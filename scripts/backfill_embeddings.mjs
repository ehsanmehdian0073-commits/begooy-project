// scripts/backfill_embeddings.mjs
// Usage:
//   node -r dotenv/config scripts/backfill_embeddings.mjs dotenv_config_path=.env.local
// یا: node scripts/backfill_embeddings.mjs   (اگر .env.local در ریشه است)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// --- load .env.local if exists ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  // fallback to default .env (optional)
  dotenv.config();
}

// --------- Config ----------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRV_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

const TABLE = "knowledge_base";
const BATCH_SIZE = 32;
// مدل پیش‌فرض 1536 بعدی (سازگار با ستون vector(1536))
const EMBED_MODEL = process.env.AI_EMBED_MODEL || "openai/text-embedding-3-small";

// ---------- Guards ----------
if (!SUPABASE_URL || !SRV_KEY) {
  console.error("Env missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!OPENROUTER_KEY) {
  console.error("Env missing: OPENROUTER_API_KEY");
  process.exit(1);
}

// ---------- Clients ----------
const supa = createClient(SUPABASE_URL, SRV_KEY, { auth: { persistSession: false } });

// ---------- Helpers ----------
const snip = (s, n = 8000) => (s || "").toString().slice(0, n);

// ترکیب عنوان و محتوا برای embedding
function buildText(row) {
  const title = (row.title || "").trim();
  const content = (row.content || "").trim();
  const joined = (title ? `${title}\n\n` : "") + content;
  return snip(joined, 8000);
}

async function embedBatch(texts) {
  // OpenRouter Embeddings endpoint
  const url = "https://openrouter.ai/api/v1/embeddings";

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "HTTP-Referer": "https://begooy.local",
      "X-Title": "Begooy Embedding Script",
      "User-Agent": "begooy-rag/1.0",
    },
    body: JSON.stringify({
      model: EMBED_MODEL,        // ⬅️  مثلا openai/text-embedding-3-small
      input: texts,
    }),
  });

  const text = await resp.text();

  // گاهی پاسخ HTML خطاست (مثلا quota/مدل اشتباه)
  if (!resp.ok) {
    console.error("OpenRouter HTTP", resp.status, text.slice(0, 200));
    throw new Error(`OpenRouter error ${resp.status}`);
  }
  if (text.trim().startsWith("<")) {
    console.error("OpenRouter returned HTML (probably an error page).");
    throw new Error("OpenRouter returned HTML");
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("OpenRouter non-JSON:", text.slice(0, 200));
    throw new Error("OpenRouter non-JSON response");
  }

  const arr = json?.data || [];
  return arr.map((d) => d.embedding);
}

/**
 * یک نوبت پردازش:
 *   - انتخاب N ردیفی که embedding = NULL
 *   - ساخت متن
 *   - گرفتن embedding به صورت batch
 *   - آپدیت ستون embedding
 */
async function processOnce() {
  const { data: rows, error } = await supa
    .from(TABLE)
    .select("id, title, content")
    .is("embedding", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) throw error;
  if (!rows || rows.length === 0) return { done: true, count: 0 };

  console.log(`⏳ Embedding ${rows.length} row(s)...`);

  const texts = rows.map(buildText);

  let vecs;
  try {
    vecs = await embedBatch(texts);
  } catch (e) {
    console.error("Batch failed:", e.message || e);
    // اگر batch fail شد، کار را متوقف می‌کنیم تا مشکل کلید/مدل/کوتا حل شود
    throw e;
  }

  // sanity check
  if (vecs.length !== rows.length) {
    throw new Error(`Embedding count mismatch: got ${vecs.length} for ${rows.length} rows`);
  }

  // Update each row
  let updated = 0;
  for (let i = 0; i < rows.length; i++) {
    const id = rows[i].id;
    const vec = vecs[i];

    // اگر ابعاد اشتباه بود، خطا بده (برای شفافیت)
    if (!Array.isArray(vec)) {
      console.error("Invalid embedding for id=", id);
      continue;
    }

    // آپدیت رکورد
    const { error: upErr } = await supa
      .from(TABLE)
      .update({ embedding: vec })
      .eq("id", id);

    if (upErr) {
      console.error(`Update failed for id=${id}:`, upErr.message || upErr);
      continue;
    }
    updated++;
  }

  console.log(`✅ Done. Updated: ${updated}/${rows.length}`);
  return { done: false, count: updated };
}

async function main() {
  console.log(
    `Backfill started | model: ${EMBED_MODEL} | table: ${TABLE} | batch=${BATCH_SIZE}`
  );

  while (true) {
    const { done, count } = await processOnce();
    if (done) {
      console.log("🎉 All rows are embedded (embedding is NOT NULL).");
      break;
    }
    // اگر هیچ آپدیتی نشد ولی هنوز NULL داریم، کمی صبر/تکرار
    if (count === 0) {
      console.log("No rows updated in this round. Sleeping 2s...");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Backfill error:", e.message || e);
    process.exit(1);
  });
