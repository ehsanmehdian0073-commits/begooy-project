// app/api/bot/stream/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ---------- Supabase ---------- */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRV_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;   // اختیاری ولی بهتر
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SRV_KEY || ANON_KEY, { auth: { persistSession: false } });

/* ---------- OpenRouter ---------- */
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "openai/gpt-4o-mini";
const AI_MAX_TOKENS = Math.max(100, Math.min(Number(process.env.AI_MAX_TOKENS || 350), 800));
const OPENROUTER_REFERER = process.env.OPENROUTER_REFERER || "https://begooy.local";
const OPENROUTER_TITLE = process.env.OPENROUTER_TITLE || "Begooy Chatbot";

const snip = (s, n = 220) => (s || "").toString().slice(0, n);

/* درج پیام نهایی بات در conversations */
async function insertBotMessage({ sessionId, text }) {
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      platform: "web",
      is_bot_response: true,
      message_text: text,
      session_id: sessionId,
      delivery_status: "delivered",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data?.id;
}

export async function POST(req) {
  try {
    const { sessionId, text, tempId } = await req.json().catch(() => ({}));
    if (!sessionId || !text || !tempId) {
      return NextResponse.json({ ok: false, error: "missing sessionId/text/tempId" }, { status: 400 });
    }
    if (!OPENROUTER_API_KEY) {
      // اگر کلید نداری، سریع جواب غیر استریم بده (fallback)
      const msg = `فعلاً استریم غیرفعاله. کلید OpenRouter ست نشده.\nسوال: «${snip(text, 140)}»`;
      await insertBotMessage({ sessionId, text: msg });
      return NextResponse.json({ ok: true, fallback: true });
    }

    // استریم SSE به کلاینت
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (obj) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

        // درخواست استریم به OpenRouter (OpenAI-compatible)
        const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": OPENROUTER_REFERER,
            "X-Title": OPENROUTER_TITLE,
          },
          body: JSON.stringify({
            model: AI_MODEL,
            messages: [
              {
                role: "system",
                content:
                  "تو یک دستیار فارسی مودب و عمل‌گرا هستی. پاسخ‌ها کوتاه، دقیق و کاربردی باشند. اگر جواب قطعی نیست، شفاف بگو و سوال تکمیلی بپرس.",
              },
              { role: "user", content: text },
            ],
            temperature: 0.2,
            max_tokens: AI_MAX_TOKENS,
            stream: true, // مهم: استریم فعال
          }),
        });

        if (!resp.ok || !resp.body) {
          const errTxt = await resp.text().catch(() => "");
          send({ type: "error", message: `OpenRouter error: ${resp.status} ${errTxt}` });
          controller.close();
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullText = "";
        let buf = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });

            // پاسخ OpenRouter به صورت خطوط SSE می‌آید: "data: {...}"
            let idx;
            while ((idx = buf.indexOf("\n\n")) !== -1) {
              const chunk = buf.slice(0, idx).trim();
              buf = buf.slice(idx + 2);

              if (!chunk.startsWith("data:")) continue;
              const jsonStr = chunk.slice(5).trim();
              if (jsonStr === "[DONE]") {
                // پایان استریم مدل
                break;
              }

              try {
                const parsed = JSON.parse(jsonStr);
                const delta = parsed?.choices?.[0]?.delta?.content ?? "";
                if (delta) {
                  fullText += delta;
                  // به کلاینت بفرست که متن اضافه کنه
                  send({ type: "delta", tempId, token: delta });
                }
              } catch {
                // ignore parse error
              }
            }
          }

          // پایان: درج پیام نهایی در DB و اطلاع به کلاینت
          let messageId = null;
          try {
            const id = await insertBotMessage({ sessionId, text: fullText.trim() || "…" });
            messageId = id || null;
          } catch (e) {
            // ممکنه RLS/Policy مانع باشه؛ فقط ادامه بده
          }

          send({ type: "done", tempId, messageId });
          controller.close();
        } catch (e) {
          send({ type: "error", message: String(e?.message || e) });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // برای برخی پروکسی‌ها
      },
    });
  } catch (e) {
    console.error("bot/stream error:", e);
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
