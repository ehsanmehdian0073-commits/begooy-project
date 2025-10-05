// deno-lint-ignore-file no-explicit-any
// Supabase Edge Function: Telegram Bot with Sessions + Logging + RAG (OpenRouter)
// ✅ پچ‌شده برای: Idempotency (tg_updates) + Anti-loop + external_ref mapping + Anti-echo

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---- ENV ----
const TG_TOKEN = Deno.env.get("TG_TOKEN")!;
const TG_SECRET = Deno.env.get("TG_SECRET")!;

const SB_URL = Deno.env.get("SB_URL")!;
const SB_SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE")!;

const OR_API_KEY = Deno.env.get("OR_API_KEY")!;
const OR_BASE = Deno.env.get("OR_BASE") ?? "https://openrouter.ai/api/v1";
const OR_CHAT_MODEL = Deno.env.get("OR_CHAT_MODEL") ?? "openai/gpt-4o-mini";
const OR_EMBED_MODEL = Deno.env.get("OR_EMBED_MODEL") ?? "openai/text-embedding-3-small";
const OR_HTTP_REFERER = Deno.env.get("OR_HTTP_REFERER") ?? "";
const OR_APP_TITLE = Deno.env.get("OR_APP_TITLE") ?? "Begooy Telegram Bot";

// ---- Clients & Const ----
const supabase = createClient(SB_URL, SB_SERVICE_ROLE);
const CHANNEL_TELEGRAM = "telegram";

// ---- Telegram send ----
async function sendTelegram(chatId: number, text: string, replyTo?: number) {
  const maxLen = 4000;
  const safe = text.length > maxLen ? text.slice(0, maxLen) + "…" : text;

  const payload: any = {
    chat_id: chatId,
    text: safe,
    disable_web_page_preview: true,
  };
  if (replyTo) payload.reply_to_message_id = replyTo;

  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("Telegram send failed:", res.status, body);
  }
  return res.ok;
}

// ---- OpenRouter: headers, embeddings, chat ----
function orHeaders() {
  return {
    "Authorization": `Bearer ${OR_API_KEY}`,
    "Content-Type": "application/json",
    ...(OR_HTTP_REFERER ? { "HTTP-Referer": OR_HTTP_REFERER } : {}),
    ...(OR_APP_TITLE ? { "X-Title": OR_APP_TITLE } : {}),
  };
}

async function embed(text: string): Promise<number[]> {
  try {
    const res = await fetch(`${OR_BASE}/embeddings`, {
      method: "POST",
      headers: orHeaders(),
      body: JSON.stringify({ model: OR_EMBED_MODEL, input: text }),
    });
    if (!res.ok) throw new Error(`Embed failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.data[0].embedding as number[];
  } catch (e) {
    console.error("embed error:", e);
    return []; // اجازه بده RAG graceful fail بشه
  }
}

async function llmAnswer(question: string, context: string): Promise<string> {
  const system =
    "You are a helpful assistant. Use the provided CONTEXT to answer in Persian. If the CONTEXT is not enough, say you don't know briefly, then answer generally. Keep it concise.";
  const user = `QUESTION:\n${question}\n\nCONTEXT:\n${context}`;

  try {
    const res = await fetch(`${OR_BASE}/chat/completions`, {
      method: "POST",
      headers: orHeaders(),
      body: JSON.stringify({
        model: OR_CHAT_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.3,
      }),
    });
    if (!res.ok) throw new Error(`Chat failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? "";
  } catch (e) {
    console.error("llmAnswer error:", e);
    return "";
  }
}

// ---- RAG search via RPC: kb_search(q_embedding, k, min_sim) ----
async function rag(question: string): Promise<{ answer: string; usedRag: boolean }> {
  const qEmbedding = await embed(question);
  if (!qEmbedding.length) {
    const answer = await llmAnswer(question, "");
    return { answer: answer || "متوجه نشدم. لطفاً دوباره بپرس 🌱", usedRag: false };
  }

  const qLiteral = `[${qEmbedding.join(",")}]`;

  const { data, error } = await supabase.rpc("kb_search", {
    q_embedding: qLiteral,
    k: 4,
    min_sim: 0.78,
  });

  if (error) {
    console.error("kb_search error:", error);
    const answer = await llmAnswer(question, "");
    return { answer: answer || "متوجه نشدم. لطفاً دوباره بپرس 🌱", usedRag: false };
  }

  const rows = (data ?? []) as Array<{ id: string; content: string; similarity: number }>;
  if (!rows.length) {
    const answer = await llmAnswer(question, "");
    return { answer: answer || "متوجه نشدم. لطفاً دوباره بپرس 🌱", usedRag: false };
  }

  const context = rows.map((r, i) => `[#${i + 1} | sim=${r.similarity.toFixed(3)}]\n${r.content}`).join("\n\n");
  const answer = await llmAnswer(question, context);
  return { answer: answer || "متوجه نشدم. لطفاً دوباره بپرس 🌱", usedRag: true };
}

// ---- Sessions & Conversations ----
async function getOrCreateSessionForTelegram(chatId: number): Promise<string> {
  const externalRef = String(chatId); // قرارداد فعلی‌ات را حفظ می‌کنیم (بدون prefix)

  // Try find
  {
    const { data, error } = await supabase
      .from("sessions")
      .select("id")
      .eq("channel", CHANNEL_TELEGRAM)
      .eq("external_ref", externalRef)
      .maybeSingle();

    if (!error && data?.id) return data.id;
  }

  // Create
  {
    const { data, error } = await supabase
      .from("sessions")
      .insert({ channel: CHANNEL_TELEGRAM, external_ref: externalRef })
      .select("id")
      .single();

    if (data?.id) return data.id;

    // handle race: re-fetch
    const { data: again } = await supabase
      .from("sessions")
      .select("id")
      .eq("channel", CHANNEL_TELEGRAM)
      .eq("external_ref", externalRef)
      .maybeSingle();

    if (again?.id) return again.id;
    throw error ?? new Error("cannot create or fetch session");
  }
}

async function insertConversation(
  sessionId: string,
  platform: string,
  text: string,
  isBot = false,
  reply_to: number | null = null,
  delivery_status: string | null = null
) {
  const { error } = await supabase.from("conversations").insert({
    session_id: sessionId,
    platform,
    message_text: text,
    is_bot_response: isBot,
    reply_to,
    delivery_status,
  });
  if (error) console.error("insert conversations error:", error);
}

async function lastBotMessage(sessionId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("message_text")
    .eq("session_id", sessionId)
    .eq("is_bot_response", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("lastBotMessage error:", error);
    return null;
  }
  return data?.message_text ?? null;
}

// ---- Idempotency helper (tg_updates) ----
async function seenOrMarkUpdate(updateId: number, chatId: number): Promise<boolean> {
  // returns true if already seen (duplicate)
  const { error } = await supabase.from("tg_updates").insert({ update_id: updateId, chat_id: chatId });
  if (!error) return false; // first time

  const msg = (error as any)?.message?.toLowerCase?.() ?? "";
  if (msg.includes("duplicate") || (error as any)?.code === "23505" || msg.includes("unique")) {
    return true; // already processed
  }
  console.error("tg_updates insert error:", error);
  return false; // best-effort: process
}

// ---- Webhook ----
Deno.serve(async (req) => {
  try {
    if (req.method === "GET") return new Response("ok");

    // Secret header (case-insensitive)
    const secA = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    const secB = req.headers.get("x-telegram-bot-api-secret-token");
    const secretHdr = secA ?? secB;
    if (!secretHdr || secretHdr !== TG_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }

    const update = (await req.json()) as any;
    const message = update?.message ?? update?.edited_message;
    const chatId: number | undefined = message?.chat?.id;
    const text: string = (message?.text ?? "").trim();

    // ✅ Anti-loop: do nothing if the sender is a bot
    if (message?.from?.is_bot) {
      return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
    }

    // ✅ Idempotency: drop duplicate updates early
    const updateId: number | undefined = update?.update_id;
    if (typeof updateId === "number" && typeof chatId === "number") {
      const already = await seenOrMarkUpdate(updateId, chatId);
      if (already) {
        return new Response(JSON.stringify({ ok: true, deduped: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // پاسخ سریع به تلگرام؛ پردازش async
    (async () => {
      if (!chatId) return;

      // Session mapping (always)
      let sessionId = "";
      try {
        sessionId = await getOrCreateSessionForTelegram(chatId);
      } catch (e) {
        console.error("session mapping error:", e);
        await sendTelegram(chatId, "یک خطای موقت رخ داد؛ دوباره تلاش کنید 🌱", message?.message_id);
        return;
      }

      // Handle start/empty
      if (!text) {
        await sendTelegram(chatId, "پیامتون متن نداشت 🙂", message?.message_id);
        return;
      }
      if (text === "/start") {
        // می‌تونی ذخیره هم بکنی؛ ترجیحاً ساد‌ه نگه می‌داریم
        await sendTelegram(
          chatId,
          "سلام! 👋\nپیامت رو دریافت می‌کنم. اول از دانش‌نامه (RAG) جواب می‌دم؛ اگر نبود از AI کمک می‌گیرم.",
          message?.message_id
        );
        return;
      }

      // Log user message
      await insertConversation(sessionId, "telegram", text, false, null, "received");

      // RAG → LLM
      let answer = "";
      let tag = "";
      try {
        const { answer: a1, usedRag } = await rag(text);
        answer = (a1 || "").trim();
        tag = usedRag ? "‎(منبع: KB)" : "‎(AI)";
      } catch (err) {
        console.error("handler error:", err);
      }
      if (!answer) answer = "متوجه نشدم. لطفاً ساده‌تر یا دقیق‌تر بپرس 🌱";

      // ✅ Anti-echo: جلوگیری از تکرار پاسخ اخیر بات
      try {
        const last = (await lastBotMessage(sessionId))?.trim();
        if (last && last === answer.trim()) {
          answer = "✅ پیام دریافت شد. مورد مشابه قبلاً پاسخ داده شده بود.";
          tag = "‎";
        }
      } catch (e) {
        // بی‌صدا
      }

      // Send & persist bot reply
      const sent = await sendTelegram(chatId, `${answer}\n\n_${tag}_`, message?.message_id);
      await insertConversation(sessionId, "telegram", answer, true, null, sent ? "sent" : "failed");
    })();

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("fatal:", err);
    return new Response("Bad Request", { status: 400 });
  }
});
