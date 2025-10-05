// scripts/chunk_kb.mjs
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

/* ---------- ENV ---------- */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SRV_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SRV_KEY) {
  console.error("❌ Env missing: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supa = createClient(SUPABASE_URL, SRV_KEY, { auth: { persistSession: false } });

/* ---------- Config ---------- */
/** اندازهٔ هر چانک (کاراکتر) */
const CHUNK_SIZE = Number(process.env.KB_CHUNK_SIZE || 700);
/** هم‌پوشانی بین چانک‌ها (کاراکتر) */
const CHUNK_OVERLAP = Number(process.env.KB_CHUNK_OVERLAP || 100);
/** تعداد ردیف‌هایی که هر بار از KB می‌خوانیم */
const PAGE_SIZE = 100;
/** اگر DRY_RUN=1 باشد چیزی در DB نمی‌نویسیم */
const DRY_RUN = process.env.DRY_RUN === "1";

/* ---------- Helpers ---------- */
function normalize(s) {
  return (s || "").toString().replace(/\s+/g, " ").trim();
}

function buildBaseText(row) {
  // اولویت: content → (question + answer) → title
  const parts = [];
  if (row.title) parts.push(`عنوان: ${row.title}`);
  if (row.question) parts.push(`سؤال: ${row.question}`);
  if (row.answer) parts.push(`پاسخ: ${row.answer}`);
  if (row.content) parts.push(row.content);
  const txt = normalize(parts.filter(Boolean).join("\n\n"));
  return txt;
}

function splitIntoChunks(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  if (!text || !text.length) return chunks;
  const safeSize = Math.max(200, size);
  const safeOverlap = Math.max(0, Math.min(overlap, Math.floor(safeSize / 2)));

  let start = 0;
  let idx = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + safeSize);
    const slice = text.slice(start, end).trim();
    if (slice.length > 0) {
      chunks.push({ chunk_index: idx++, content: slice });
    }
    if (end === text.length) break;
    start = end - safeOverlap;
  }
  return chunks;
}

async function fetchKbPage(from, to) {
  const { data, error, count } = await supa
    .from("knowledge_base")
    .select("id, title, question, answer, content", { count: "exact" })
    .order("id", { ascending: true })
    .range(from, to);

  if (error) throw error;
  return { rows: data || [], total: count ?? null };
}

async function deleteExistingChunks(kb_id) {
  const { error } = await supa.from("knowledge_chunks").delete().eq("kb_id", kb_id);
  if (error) throw error;
}

async function insertChunks(kb_id, chunks) {
  if (!chunks.length) return;
  const rows = chunks.map((c) => ({
    kb_id,
    chunk_index: c.chunk_index,
    content: c.content,
  }));
  const { error } = await supa.from("knowledge_chunks").insert(rows);
  if (error) throw error;
}

/* ---------- Main ---------- */
async function main() {
  console.log(
    `Chunking started | size=${CHUNK_SIZE} overlap=${CHUNK_OVERLAP} | page=${PAGE_SIZE} | dry=${DRY_RUN}`
  );

  let from = 0;
  let to = PAGE_SIZE - 1;
  let processedKb = 0;
  let writtenChunks = 0;

  while (true) {
    const { rows, total } = await fetchKbPage(from, to);
    if (!rows.length) break;

    for (const r of rows) {
      const baseText = buildBaseText(r);
      const chunks = splitIntoChunks(baseText);

      console.log(
        `KB ${r.id} → ${chunks.length} chunk(s)` +
          (DRY_RUN ? " (dry)" : "")
      );

      if (!DRY_RUN) {
        await deleteExistingChunks(r.id);
        if (chunks.length) {
          await insertChunks(r.id, chunks);
          writtenChunks += chunks.length;
        }
      }
      processedKb++;
    }

    // صفحه بعدی
    from += PAGE_SIZE;
    to += PAGE_SIZE;

    // اگر total را داریم و از آن گذشتیم، خارج شو
    if (total !== null && from >= total) break;
  }

  console.log(
    `✅ Done. KB processed: ${processedKb}, chunks ${DRY_RUN ? "(dry simulated)" : "written"}: ${writtenChunks}`
  );
}

main().catch((e) => {
  console.error("Chunking error:", e?.message || e);
  process.exit(1);
});
