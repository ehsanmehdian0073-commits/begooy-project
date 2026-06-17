// app/api/bot/reply/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID as nodeRandomUUID } from "node:crypto";

/* ---------- ENV ---------- */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRV_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // REQUIRED for writes
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_REFERER = process.env.OPENROUTER_REFERER || "https://begooy.local";
const OPENROUTER_TITLE = process.env.OPENROUTER_TITLE || "Begooy Chatbot";

const AI_MODEL = (process.env.AI_MODEL || "openai/gpt-4o-mini").trim();
const AI_MAX_TOKENS = Math.max(100, Math.min(Number(process.env.AI_MAX_TOKENS || 350), 800));

const AI_EMBED_MODEL = (process.env.AI_EMBED_MODEL || "embed-multilingual-v3.0").trim();
const COHERE_API_KEY = process.env.COHERE_API_KEY || "";

/* ---------- Supabase server client ---------- */
if (!SUPABASE_URL) console.error("Env missing: NEXT_PUBLIC_SUPABASE_URL");
if (!SRV_KEY) console.error("Env missing: SUPABASE_SERVICE_ROLE_KEY (needed for writes)");

const supabase = SRV_KEY
  ? createClient(SUPABASE_URL, SRV_KEY, { auth: { persistSession: false } })
  : null;

/* ---------- RAG gating ---------- */
const RAG_MAX_L2 = Number(process.env.RAG_MAX_L2 || 0.8);
const RAG_MIN_OVERLAP = Math.max(0, Number(process.env.RAG_MIN_OVERLAP || 1));
const ENABLE_PUBLIC_BOT_RAG = String(process.env.ENABLE_PUBLIC_BOT_RAG || "false") === "true";

/* ---------- Helpers ---------- */
const snip = (s, n = 220) => (s || "").toString().slice(0, n);
const cleanQ = (s) => (s || "").toString().replace(/\s+/g, " ").trim();
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function tokenize(str) {
  if (!str) return [];
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}
function keywordOverlap(query, text) {
  const q = new Set(tokenize(query));
  if (!q.size) return 0;
  let count = 0;
  const toks = tokenize(text);
  for (const t of toks) if (q.has(t)) count++;
  return count;
}

/* ---------- Sessions & Messages ---------- */
async function ensureSession(sessionId) {
  const { data, error } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) console.warn("ensureSession select error:", error);

  if (!data) {
    const insertRow = {
      id: sessionId,
      platform: "web",
      channel: "web",  // ✅ مطابق چک‌کانسترِین شما
      status: "open",
    };
    const { error: insErr } = await supabase.from("sessions").insert(insertRow);
    if (insErr) {
      console.error("ensureSession insert error:", insErr);
      throw insErr;
    }
  }
}

async function insertBotMessage({ sessionId, text }) {
  await ensureSession(sessionId);
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

/* ---------- Workflow ---------- */
async function matchWorkflow(botId, text) {
  const { data: rules, error } = await supabase
    .from("workflow_rules")
    .select("rule_type, pattern, reply_text, priority, enabled")
    .eq("bot_id", botId)
    .eq("enabled", true)
    .order("priority", { ascending: true });
  if (error) return null;

  const t = (text || "").toLowerCase();
  for (const r of rules || []) {
    const p = (r.pattern || "").toLowerCase();
    if (r.rule_type === "contains" && t.includes(p)) return r.reply_text;
    if (r.rule_type === "starts_with" && t.startsWith(p)) return r.reply_text;
    if (r.rule_type === "regex") {
      try {
        const re = new RegExp(r.pattern, "i");
        if (re.test(text)) return r.reply_text;
      } catch {}
    }
  }
  return null;
}

/* ---------- RAG (lexical) ---------- */
async function kbSearchLex(query, limit = 4) {
  const q = snip(cleanQ(query), 200);
  if (!q) return [];
  const { data, error } = await supabase
    .from("knowledge_base")
    .select("id, title, content")
    .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
    .limit(limit);
  if (error) return [];
  return data || [];
}

/* ---------- Embeddings + Vendor ---------- */
function modelVendor() {
  const m = AI_EMBED_MODEL.toLowerCase();
  if (m.startsWith("embed-")) return { via: "cohere", model: m };
  if (m.includes("/")) return { via: "openrouter", model: m };
  return { via: "openrouter", model: `openai/${m}` };
}

async function embedQuery(input) {
  const { via, model } = modelVendor();
  const text = cleanQ(input).slice(0, 4000);
  if (!text) return null;

  if (via === "cohere") {
    if (!COHERE_API_KEY) return null;
    try {
      const resp = await fetch("https://api.cohere.ai/v1/embed", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${COHERE_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model,
          texts: [text],
          input_type: "search_query",
          truncate: "END",
        }),
      });
      const body = await resp.text();
      if (!resp.ok || body.trim().startsWith("<")) return null;
      const json = JSON.parse(body);
      const arr = json?.embeddings;
      const emb = Array.isArray(arr?.[0]) ? arr[0] : arr?.[0]?.embedding;
      return emb || null;
    } catch {
      return null;
    }
  } else {
    if (!OPENROUTER_API_KEY) return null;
    try {
      const resp = await fetch("https://openrouter.ai/api/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "HTTP-Referer": OPENROUTER_REFERER,
          "X-Title": OPENROUTER_TITLE,
          "User-Agent": "begooy-rag/1.0",
        },
        body: JSON.stringify({ model, input: [text] }),
      });
      const t = await resp.text();
      if (!resp.ok || t.trim().startsWith("<")) return null;
      const j = JSON.parse(t);
      return j?.data?.[0]?.embedding || null;
    } catch {
      return null;
    }
  }
}

/* ---------- RAG (vector with gates) ---------- */
async function kbSearchVector(q, k = 5) {
  const qvec = await embedQuery(q);
  if (!qvec) return { hits: [], method: "lexical" };

  const { data, error } = await supabase.rpc("search_kb_vec", { qvec, k });
  if (error) return { hits: [], method: "lexical" };

  const hits = data || [];
  if (!hits.length) return { hits: [], method: "lexical" };

  const top = hits[0];
  const topDist = typeof top?.distance === "number" ? top.distance : undefined;
  const overlap = keywordOverlap(q, `${top?.title || ""} ${top?.content || ""}`);

  const passL2 = typeof topDist === "number" ? topDist <= RAG_MAX_L2 : true;
  const passLex = overlap >= RAG_MIN_OVERLAP;

  if (passL2 && passLex) return { hits, method: "vector" };
  return { hits: [], method: "lexical" };
}

function ragComposeAnswer(query, hits) {
  if (!hits?.length) {
    return `متوجه «${snip(query, 140)}» شدم اما پاسخ دقیقی در دانش‌نامه پیدا نشد. اگر کمی دقیق‌تر بگی، بهتر می‌تونم کمک کنم.`;
  }
  const items = hits
    .map((h, i) => `${i + 1}) ${h.title || "بدون‌عنوان"} — ${snip(h.content, 160)}`)
    .join("\n");
  return `سؤال: «${snip(query, 140)}»\n\nبر اساس دانش‌نامه:\n${items}\n\nبگو روی کدوم مورد باز کنم.`;
}

/* ---------- OpenRouter Chat ---------- */
async function generateWithOpenRouter({ query, kb, systemPrompt }) {
  if (!OPENROUTER_API_KEY) return null;

  const context = (kb || [])
    .map((x, i) => `#${i + 1} ${x.title || "بدون‌عنوان"}\n${snip(x.content, 700)}`)
    .join("\n\n");

  const messages = [
    { role: "system", content: systemPrompt || "تو یک دستیار فارسی مودب و عمل‌گرا هستی. پاسخ‌ها کوتاه، دقیق و کاربردی باشند. اگر جواب قطعی نیست، شفاف بگو و سوال تکمیلی بپرس." },
    { role: "user", content: `### پرسش کاربر:\n${snip(query, 800)}\n\n${context ? `### کانتکست دانش‌نامه:\n${context}` : ""}` },
  ];

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": OPENROUTER_REFERER,
      "X-Title": OPENROUTER_TITLE,
    },
    body: JSON.stringify({ model: AI_MODEL, messages, temperature: 0.2, max_tokens: AI_MAX_TOKENS }),
  });

  if (!resp.ok) return null;
  const json = await resp.json();
  return json?.choices?.[0]?.message?.content?.trim() || null;
}

/* ---------- API ---------- */
export async function POST(req) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: "Server misconfigured: SUPABASE_SERVICE_ROLE_KEY is missing. Add it to .env.local and restart." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    let { sessionId, text } = body || {};
    if (!text) return NextResponse.json({ ok: false, error: "missing text" }, { status: 400 });

    if (!UUID_RE.test(sessionId || "")) {
      try { sessionId = nodeRandomUUID(); }
      catch { sessionId = `${Date.now()}-0000-4000-8000-000000000000`; }
    }

    const BOT_ID = "11111111-1111-1111-1111-111111111111";

    // 1) Workflow
    const wf = await matchWorkflow(BOT_ID, text);
    if (wf) {
      const id = await insertBotMessage({ sessionId, text: wf });
      return NextResponse.json({ ok: true, source: "workflow", message_id: id, reply_text: wf, session_id: sessionId });
    }

    // 2) RAG
    let hits = [];
    let ragMethod = "disabled";
    if (ENABLE_PUBLIC_BOT_RAG) {
      const vec = await kbSearchVector(text, 5);
      if (vec?.hits?.length) { hits = vec.hits; ragMethod = "vector"; }
      else { hits = await kbSearchLex(text, 4); ragMethod = "lexical"; }
    }

    // 3) Answer
    const systemPrompt = "تو یک دستیار فارسی هستی که پاسخ‌های کوتاه، دقیق و قابل‌اجرا می‌دهد. اگر اطمینان نداری، شفاف بگو و سوال تکمیلی بپرس.";
    const ai = await generateWithOpenRouter({ query: text, kb: hits, systemPrompt });
    const answer = ai || ragComposeAnswer(text, hits);

    const id = await insertBotMessage({ sessionId, text: answer });
    return NextResponse.json({ ok: true, source: ai ? `openrouter+${ragMethod}` : `rag-${ragMethod}`, message_id: id, reply_text: answer, session_id: sessionId });
  } catch (e) {
    console.error("bot/reply error:", e);
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
