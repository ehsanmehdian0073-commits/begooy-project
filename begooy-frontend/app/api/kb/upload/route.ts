// app/api/kb/upload/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin as sb } from "@/lib/supabaseAdmin";
import { embedBatchWithDims } from "@/lib/kb/embed";
import { isAuthFailure, requireVerifiedUser } from "@/lib/server/auth";

/** ---------- Config ---------- */
const DEFAULT_BUCKET = "kb-uploads";
const DEFAULT_DIMS = [1536] as const;
const TARGET_TOKENS = 700;
const OVERLAP_TOKENS = 80;
const MAX_CHUNK_CHARS = 2800;

// Dev rate limit: 5 req / 5m per IP
const RL = new Map<string, number[]>();
const RL_WINDOW = 5 * 60 * 1000;
const RL_MAX = 5;

/** ---------- Utils ---------- */
function rateLimit(key: string) {
  const now = Date.now();
  const arr = (RL.get(key) || []).filter((t) => now - t < RL_WINDOW);
  if (arr.length >= RL_MAX) return false;
  arr.push(now);
  RL.set(key, arr);
  return true;
}

const JsonBody = z.object({
  text: z.string().min(1).optional(),
  title: z.string().optional(),
  dims: z.array(z.number().int().refine((d) => d === 1024 || d === 1536)).optional(),
  storagePath: z.string().optional(),
  storage_path: z.string().optional(), // سازگاری
  path: z.string().optional(), // سازگاری
});

function estTokens(s: string) {
  return Math.ceil((s?.length ?? 0) / 4);
}
function isPersian(s: string) {
  return /[\u0600-\u06FF]/.test(s || "");
}
function normalize(s: string) {
  return (s || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function splitParagraphs(s: string) {
  return normalize(s).split(/\n{2,}/g);
}
function splitSentences(p: string) {
  const parts = p
    .replace(/([\.!\?؟])\s+/g, "$1⟂")
    .split("⟂")
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length ? parts : [p];
}
function chunkByTokens(text: string) {
  const paras = splitParagraphs(text);
  const pieces: string[] = [];
  let cur: string[] = [],
    curTok = 0;

  const flush = (force = false) => {
    if (!cur.length) return;
    let joined = cur.join(" ");
    if (joined.length > MAX_CHUNK_CHARS) joined = joined.slice(0, MAX_CHUNK_CHARS);
    pieces.push(joined);
    if (force) {
      cur = [];
      curTok = 0;
    } else {
      const words = joined.split(/\s+/);
      let backTok = 0;
      const keep: string[] = [];
      for (let i = words.length - 1; i >= 0 && backTok < OVERLAP_TOKENS; i--) {
        keep.unshift(words[i]);
        backTok += estTokens(words[i] + " ");
      }
      cur = keep;
      curTok = estTokens(keep.join(" "));
    }
  };

  for (const para of paras) {
    const sents = splitSentences(para);
    for (const s of sents) {
      const t = estTokens(s + " ");
      if (curTok + t > TARGET_TOKENS) {
        flush(false);
        if (t > TARGET_TOKENS) {
          const hard = s.match(/.{1,300}/g) || [s];
          for (const h of hard) {
            const ht = estTokens(h + " ");
            if (curTok + ht > TARGET_TOKENS) flush(false);
            cur.push(h);
            curTok += ht;
          }
        } else {
          cur.push(s);
          curTok += t;
        }
      } else {
        cur.push(s);
        curTok += t;
      }
    }
  }
  flush(true);
  return pieces.map((c) => c.trim()).filter(Boolean);
}

function storagePathToBucketKey(storagePath: string) {
  let bucket = DEFAULT_BUCKET,
    filePath = storagePath;
  if (storagePath.includes("/")) {
    const [maybeBucket, ...rest] = storagePath.split("/");
    if (maybeBucket) {
      bucket = maybeBucket;
      filePath = rest.join("/");
    }
  }
  return { bucket, filePath };
}
async function loadTextFromStorage(storagePath: string): Promise<string> {
  const { bucket, filePath } = storagePathToBucketKey(storagePath);
  const { data, error } = await sb.storage.from(bucket).download(filePath);
  if (error || !data)
    throw new Error(`storage download failed: ${error?.message ?? "unknown error"}`);
  return await data.text();
}

async function readBody(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const raw = await req.json();
    const parsed = JsonBody.parse(raw);
    const title = parsed.title ?? "demo";
    const dims = parsed.dims?.length ? Array.from(new Set(parsed.dims)) : [...DEFAULT_DIMS];
    const storagePath = parsed.storagePath ?? parsed.storage_path ?? parsed.path;
    return { text: parsed.text, title, dims, storagePath };
  }
  if (ct.includes("multipart/form-data")) {
    const fd = await req.formData();
    const text = fd.get("text")?.toString();
    const title = fd.get("title")?.toString() ?? "demo";
    const rawDims = (
      fd.getAll("dims").map((d) => d.toString()).join(",") || ""
    )
      .split(/[,\s]+/)
      .filter(Boolean)
      .map((x) => parseInt(x, 10));
    const dims = rawDims.length
      ? Array.from(new Set(rawDims.filter((d) => d === 1024 || d === 1536)))
      : [...DEFAULT_DIMS];
    const storagePath =
      fd.get("storagePath")?.toString() ??
      fd.get("storage_path")?.toString() ??
      fd.get("path")?.toString();
    return { text, title, dims, storagePath };
  }
  // default empty
  return { text: undefined, title: "demo", dims: [...DEFAULT_DIMS], storagePath: undefined };
}

/** ---------- Route ---------- */
export async function POST(req: Request) {
  try {
    const auth = await requireVerifiedUser(req);
    if (isAuthFailure(auth)) return auth.response;
    const userId = auth.userId;

    // rate-limit per IP
    const ip =
      ((req.headers as any).get?.("x-forwarded-for")?.split(",")[0]?.trim()) || "local";
    if (!rateLimit(`${ip}:upload`)) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", hint: "Too many requests, try later." },
        { status: 429 }
      );
    }

    const { text: textRaw, title, dims, storagePath } = await readBody(req);
    let text = typeof textRaw === "string" ? textRaw.trim() : "";
    if (!text && storagePath) text = (await loadTextFromStorage(storagePath)).trim();
    if (!text)
      return NextResponse.json(
        { ok: false, error: "text or storagePath is required" },
        { status: 400 }
      );

    const lang = isPersian(text) ? "fa" : "en";
    const chunksRaw = chunkByTokens(text);
    if (!chunksRaw.length)
      return NextResponse.json({ ok: false, error: "no chunks produced" }, { status: 400 });

    // KB: indexing → ready (✅ با owner_id)
    const { data: kbRow, error: kbErr } = await sb
      .from("knowledge_base")
      .insert({
        title,
        status: "indexing",
        total_chunks: chunksRaw.length,
        language: lang,
        source_type: storagePath ? "upload" : "text",
        source_ref: storagePath || null,
        owner_id: userId, // ⬅️ مهم
      })
      .select("id")
      .single();
    if (kbErr || !kbRow)
      return NextResponse.json({ ok: false, error: kbErr?.message ?? "KB insert failed" }, { status: 500 });
    const kbId: string = kbRow.id;

    // Embeddings
    const vectorsByDim = await embedBatchWithDims(chunksRaw, dims as any);

    // records
    const pathMeta = storagePath ? storagePathToBucketKey(storagePath) : null;
    const records = chunksRaw.map((content, idx) => {
      const tokens = estTokens(content);
      const meta_json = {
        title,
        lang,
        chunk_index: idx,
        path: pathMeta ? `${pathMeta.bucket}/${pathMeta.filePath}` : undefined,
      };
      const rec: any = { kb_id: kbId, chunk_index: idx, content, tokens, meta_json };
      if (vectorsByDim[1024]?.[idx]) rec.embedding_1024 = vectorsByDim[1024][idx];
      if (vectorsByDim[1536]?.[idx]) rec.embedding_1536 = vectorsByDim[1536][idx];
      return rec;
    });
    const { error: insErr } = await sb.from("knowledge_chunks").insert(records);
    if (insErr)
      return NextResponse.json(
        { ok: false, error: insErr?.message ?? "Chunks insert failed" },
        { status: 500 }
      );

    await sb.from("knowledge_base").update({ status: "ready" }).eq("id", kbId);

    return NextResponse.json(
      {
        ok: true,
        kbId,
        title,
        status: "ready",
        chunks: records.length,
        has1024: Number(!!vectorsByDim[1024]),
        has1536: Number(!!vectorsByDim[1536]),
      },
      { status: 200 }
    );
  } catch (e: any) {
    if (e?.issues)
      return NextResponse.json(
        { ok: false, error: "validation_error", details: e.issues },
        { status: 400 }
      );
    return NextResponse.json({ ok: false, error: e?.message ?? "Internal error" }, { status: 500 });
  }
}
