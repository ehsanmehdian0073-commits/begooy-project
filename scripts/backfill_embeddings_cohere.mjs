// scripts/backfill_embeddings_cohere.mjs
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

/* ---------- ENV ---------- */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRV_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COHERE_API_KEY = process.env.COHERE_API_KEY;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_REFERER = process.env.OPENROUTER_REFERER || "https://begooy.local";
const OPENROUTER_TITLE = process.env.OPENROUTER_TITLE || "Begooy Backfill";

const COHERE_MODEL = (process.env.COHERE_EMBED_MODEL || "embed-multilingual-v3.0").trim();

if (!SUPABASE_URL || !SRV_KEY) {
  console.error("❌ Env missing: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!COHERE_API_KEY && !OPENROUTER_API_KEY) {
  console.error("❌ Need at least one of COHERE_API_KEY or OPENROUTER_API_KEY");
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SRV_KEY, { auth: { persistSession: false } });

/* ---------- Helpers ---------- */
const BATCH = 32;
const MAX_TEXT_LEN = 4000;
const snip = (s, n = MAX_TEXT_LEN) => (s || "").toString().slice(0, n);
const normalize = (s) => (s || "").toString().replace(/\s+/g, " ").trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function showNetErr(prefix, e) {
  const cause = e?.cause || {};
  console.error(prefix,
    e?.name || "", e?.message || "",
    "| code:", cause.code,
    "| errno:", cause.errno,
    "| syscall:", cause.syscall,
    "| host:", cause.hostname
  );
}

async function retryWithBackoff(fn, { tries = 4, baseMs = 600 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      const status = err?.status || err?.code;
      const retriable =
        status === 429 ||
        (typeof status === "number" && status >= 500) ||
        (err?.message || "").toLowerCase().includes("network") ||
        (err?.name || "").includes("FetchError") ||
        (err?.message || "").includes("fetch failed");
      if (!retriable || i === tries - 1) break;
      const wait = Math.round(baseMs * Math.pow(1.6, i));
      console.warn(`⚠️ transient (${status || err.message}); retry in ${wait}ms...`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

/* ---------- Connectivity Diagnostics ---------- */
async function diagSupabase() {
  try {
    const { data, error } = await supa.from("knowledge_base").select("id").limit(1);
    if (error) throw error;
    console.log("✅ Supabase reachable:", SUPABASE_URL);
  } catch (e) {
    showNetErr("❌ Supabase fetch failed", e);
    throw new Error("supabase_unreachable");
  }
}

async function diagCohere() {
  if (!COHERE_API_KEY) {
    console.log("ℹ️ Skip Cohere diag (no COHERE_API_KEY)");
    return;
  }
  try {
    const resp = await fetch("https://api.cohere.ai/v1/embed", {
      method: "POST",
      headers: { Authorization: `Bearer ${COHERE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: COHERE_MODEL, texts: ["ping"], input_type: "search_document", truncate: "RIGHT" }),
    });
    const ok = resp.ok;
    console.log(ok ? "✅ Cohere reachable" : `⚠️ Cohere responded status ${resp.status}`);
  } catch (e) {
    showNetErr("❌ Cohere fetch failed", e);
  }
}

async function diagOpenRouter() {
  if (!OPENROUTER_API_KEY) {
    console.log("ℹ️ Skip OpenRouter diag (no OPENROUTER_API_KEY)");
    return;
  }
  try {
    const resp = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": OPENROUTER_REFERER,
        "X-Title": OPENROUTER_TITLE,
      },
      body: JSON.stringify({ model: "cohere/embed-multilingual-v3.0", input: ["ping"] }),
    });
    const ok = resp.ok;
    console.log(ok ? "✅ OpenRouter reachable" : `⚠️ OpenRouter responded status ${resp.status}`);
  } catch (e) {
    showNetErr("❌ OpenRouter fetch failed", e);
  }
}

/* ---------- DB ---------- */
async function fetchRowsWithoutEmbedding(limit = BATCH) {
  const { data, error } = await supa
    .from("knowledge_base")
    .select("id, question, answer, content, embedding")
    .is("embedding", null)
    .order("id", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data || []).map((r) => {
    const text = normalize([r.question, r.answer, r.content].filter(Boolean).join(" "));
    return { id: r.id, text };
  });
}

async function updateEmbeddings(pairs) {
  for (const p of pairs) {
    const { error } = await supa.from("knowledge_base").update({ embedding: p.embedding }).eq("id", p.id);
    if (error) throw error;
  }
}

/* ---------- Embeddings ---------- */
async function embedWithCohere(rawTexts = []) {
  const texts = rawTexts.map((t) => normalize(snip(t, MAX_TEXT_LEN))).filter((t) => t.length > 0);
  if (!texts.length) return [];

  if (!COHERE_API_KEY) throw Object.assign(new Error("COHERE_API_KEY missing"), { status: 499 });

  const execCall = async () => {
    try {
      const resp = await fetch("https://api.cohere.ai/v1/embed", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${COHERE_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: COHERE_MODEL,
          texts,
          input_type: "search_document",
          truncate: "RIGHT",
        }),
      });
      const raw = await resp.text();
      if (!resp.ok || raw.trim().startsWith("<")) {
        const err = new Error(`Cohere embed failed (${resp.status})`);
        err.status = resp.status; err.body = raw.slice(0, 600);
        throw err;
      }
      const json = JSON.parse(raw);
      const vecs = json?.embeddings || json?.data || [];
      if (!Array.isArray(vecs) || vecs.length !== texts.length) {
        const err = new Error("Unexpected embeddings shape from Cohere");
        err.status = 500; err.body = JSON.stringify(Object.keys(json || {}));
        throw err;
      }
      const arr = vecs.map((v) => (Array.isArray(v) ? v : v?.embedding));
      const dim = Array.isArray(arr?.[0]) ? arr[0].length : 0;
      if (dim && dim !== 1024) console.warn(`⚠️ Cohere dim=${dim} expected 1024`);
      return arr;
    } catch (e) {
      showNetErr("[Cohere fetch failed]", e);
      throw e;
    }
  };

  return retryWithBackoff(execCall, { tries: 4, baseMs: 700 });
}

async function embedWithOpenRouterCohere(rawTexts = []) {
  const texts = rawTexts.map((t) => normalize(snip(t, MAX_TEXT_LEN))).filter((t) => t.length > 0);
  if (!texts.length) return [];
  if (!OPENROUTER_API_KEY) throw Object.assign(new Error("OPENROUTER_API_KEY missing"), { status: 499 });

  const execCall = async () => {
    const resp = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "HTTP-Referer": OPENROUTER_REFERER,
        "X-Title": OPENROUTER_TITLE,
        "User-Agent": "begooy-backfill/1.0",
      },
      body: JSON.stringify({
        model: "cohere/embed-multilingual-v3.0",
        input: texts,
      }),
    });
    const raw = await resp.text();
    if (!resp.ok || raw.trim().startsWith("<")) {
      const err = new Error(`OpenRouter embed failed (${resp.status})`);
      err.status = resp.status; err.body = raw.slice(0, 600);
      throw err;
    }
    const j = JSON.parse(raw);
    const vecs = (j?.data || []).map((d) => d.embedding);
    if (!Array.isArray(vecs) || vecs.length !== texts.length) {
      const err = new Error("Unexpected embeddings shape from OpenRouter");
      err.status = 500; err.body = JSON.stringify(Object.keys(j || {}));
      throw err;
    }
    if (Array.isArray(vecs[0]) && vecs[0].length !== 1024) {
      console.warn("⚠️ OpenRouter dim", vecs[0].length, "expected 1024");
    }
    return vecs;
  };

  return retryWithBackoff(execCall, { tries: 4, baseMs: 700 });
}

/* ---------- Main ---------- */
async function main() {
  console.log(`Backfill started | model: ${COHERE_MODEL} | table: knowledge_base | batch=${BATCH}`);

  // 0) Diagnostics
  await diagSupabase().catch((e) => { throw e; });
  await diagCohere();
  await diagOpenRouter();

  let total = 0;

  while (true) {
    let rows;
    try {
      rows = await fetchRowsWithoutEmbedding(BATCH);
    } catch (e) {
      showNetErr("❌ Supabase query failed", e);
      throw e;
    }
    if (!rows.length) break;

    const filtered = rows.filter((r) => (r.text || "").trim().length > 0);
    if (!filtered.length) break;

    console.log(`⏳ Embedding ${filtered.length} row(s)...`);
    const texts = filtered.map((r) => r.text);

    let vecs = [];
    try {
      vecs = await embedWithCohere(texts);
    } catch (e) {
      console.warn("⛑ Falling back to OpenRouter embeddings (Cohere model)...");
      vecs = await embedWithOpenRouterCohere(texts);
    }

    if (!vecs.length || vecs.length !== filtered.length) {
      throw new Error(`Embedding count mismatch: got ${vecs.length}, expected ${filtered.length}`);
    }

    try {
      const pairs = filtered.map((r, i) => ({ id: r.id, embedding: vecs[i] }));
      await updateEmbeddings(pairs);
      total += filtered.length;
    } catch (e) {
      showNetErr("❌ Supabase update failed", e);
      throw e;
    }
  }

  console.log(`✅ Done. Updated ${total} row(s).`);
}

main().catch((e) => {
  console.error("Backfill error:", e?.status ? `${e.status} ${e.message}` : e?.message || e);
  if (e?.body) console.error("Body:", e.body);
  process.exit(1);
});
