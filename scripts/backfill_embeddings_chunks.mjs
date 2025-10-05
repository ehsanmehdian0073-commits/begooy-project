// scripts/backfill_embeddings_chunks.mjs
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

/* ---------- ENV ---------- */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRV_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COHERE_API_KEY = process.env.COHERE_API_KEY;

const COHERE_MODEL = process.env.COHERE_EMBED_MODEL || "embed-multilingual-v3.0";

if (!SUPABASE_URL || !SRV_KEY || !COHERE_API_KEY) {
  console.error("❌ Env missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / COHERE_API_KEY");
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SRV_KEY, { auth: { persistSession: false } });

/* ---------- Helpers ---------- */
const BATCH = 32;
const snip = (s, n = 4000) => (s || "").toString().slice(0, n);

async function fetchChunksWithoutEmbedding(limit = BATCH) {
  const { data, error } = await supa
    .from("knowledge_chunks")
    .select("id, content, embedding")
    .is("embedding", null)
    .limit(limit);

  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    text: snip(r.content || ""),
  }));
}

async function embedWithCohere(texts = []) {
  if (!texts.length) return [];
  const resp = await fetch("https://api.cohere.ai/v1/embed", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${COHERE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: COHERE_MODEL,
      texts: texts.map((t) => snip(t, 4000)),
      input_type: "search_document",
    }),
  });

  const raw = await resp.text();
  if (!resp.ok || raw.trim().startsWith("<")) {
    console.error("❌ Cohere HTTP", resp.status, raw.slice(0, 200));
    throw new Error("Cohere embed failed");
  }

  const json = JSON.parse(raw);
  const vecs = json?.embeddings || [];
  if (!Array.isArray(vecs) || vecs.length !== texts.length) {
    throw new Error("Unexpected embeddings shape from Cohere");
  }
  return vecs;
}

async function updateEmbeddings(pairs) {
  for (const p of pairs) {
    const { error } = await supa
      .from("knowledge_chunks")
      .update({ embedding: p.embedding })
      .eq("id", p.id);
    if (error) throw error;
  }
}

/* ---------- Main ---------- */
async function main() {
  console.log(`Backfill (chunks) started | model: ${COHERE_MODEL} | table: knowledge_chunks | batch=${BATCH}`);

  let total = 0;
  while (true) {
    const rows = await fetchChunksWithoutEmbedding(BATCH);
    if (!rows.length) break;

    console.log(`⏳ Embedding ${rows.length} chunk(s)...`);
    const texts = rows.map((r) => r.text || "");
    const vecs = await embedWithCohere(texts);

    const pairs = rows.map((r, i) => ({ id: r.id, embedding: vecs[i] }));
    await updateEmbeddings(pairs);
    total += rows.length;
  }

  console.log(`✅ Done. Updated ${total} chunk(s).`);
}

main().catch((e) => {
  console.error("Backfill error:", e?.message || e);
  process.exit(1);
});
