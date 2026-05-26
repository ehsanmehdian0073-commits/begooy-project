// app/api/kb/crawl/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { supabaseAdmin as sb } from "@/lib/supabaseAdmin";
import { chunkText } from "@/lib/kb/chunker";
import { embedBatchWithDims } from "@/lib/kb/embed";
import { getAuthenticatedUserId, unauthorizedJson } from "@/lib/auth/routeUser";

export const runtime = "nodejs";

/* ---------------- Config ---------------- */
const DEFAULT_DIMS = [1536] as const;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const FETCH_TIMEOUT_MS = 15000;
const ROBOTS_TIMEOUT_MS = 4000;
const MAX_PAGES_HARD = 30;
const MAX_HTML_LEN = 800_000;

/* ---------------- Rate Limit (Dev) ---------------- */
const RL = new Map<string, number[]>();
function rateLimit(key: string, limit = RATE_LIMIT_MAX, win = RATE_LIMIT_WINDOW_MS) {
  const now = Date.now();
  const arr = (RL.get(key) || []).filter((t) => now - t < win);
  if (arr.length >= limit) return false;
  arr.push(now);
  RL.set(key, arr);
  return true;
}

/* ---------------- Validation ---------------- */
const BodySchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  depth: z.number().int().min(0).max(3).optional().default(1),
  maxPages: z.number().int().min(1).max(MAX_PAGES_HARD).optional().default(5),
  sameHost: z.boolean().optional().default(true),
  /** NEW: فقط مسیرهایی که با این پیشوند شروع می‌شوند */
  pathPrefix: z.string().optional(),
  /** NEW: فقط زیرشاخهٔ همان مسیر شروع (اگر true باشد، pathPrefix را از URL شروع مشتق می‌کنیم) */
  samePath: z.boolean().optional().default(false),
  dims: z.array(z.number().int().refine((d) => d === 1024 || d === 1536)).optional(),
});

/* ---------------- Utils ---------------- */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function estTokens(s: string) { return Math.ceil((s?.length ?? 0) / 4); }
function isPersian(s: string) { return /[\u0600-\u06FF]/.test(s || ""); }
function parseTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m?.[1]?.trim() || null;
}
async function fetchWithTimeout(url: string, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal }); }
  finally { clearTimeout(id); }
}

/** فایل/ایست‌ها که نباید دنبال شوند */
const ASSET_EXTS = new Set([
  ".css",".js",".mjs",".json",
  ".png",".jpg",".jpeg",".gif",".svg",".ico",".webp",
  ".pdf",".zip",".rar",".7z",".gz",".tgz",
  ".mp3",".mp4",".webm",".ogg",
  ".woff",".woff2",".ttf",".eot",".otf",
  ".xml",".rss",".atom",".sitemap"
]);

function isProbablyHtmlURL(u: URL): boolean {
  const p = (u.pathname || "").toLowerCase();
  const m = p.match(/\.[a-z0-9]+$/);
  if (!m) return true;
  const ext = m[0];
  if (ASSET_EXTS.has(ext)) return false;
  return [".html", ".htm", ".xhtml"].includes(ext);
}

function extractLinks(html: string, base: URL): string[] {
  const hrefRe = /href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const raw = m[1] ?? m[2] ?? m[3] ?? "";
    if (!raw) continue;
    if (/^(mailto:|tel:|javascript:)/i.test(raw)) continue;
    if (raw.startsWith("#")) continue;

    let abs: URL | null = null;
    try { abs = new URL(raw, base); } catch { abs = null; }
    if (!abs) continue;
    abs.hash = "";
    if (!/^https?:$/i.test(abs.protocol)) continue;
    if (!isProbablyHtmlURL(abs)) continue;
    found.add(abs.toString());
  }
  return Array.from(found);
}

/** robots.txt cache per origin */
const ROBOTS_CACHE = new Map<string, string[]>();
async function allowedByRobotsTxt(target: URL): Promise<boolean> {
  try {
    const origin = target.origin;
    if (!ROBOTS_CACHE.has(origin)) {
      const robotsUrl = new URL("/robots.txt", origin).toString();
      const res = await fetchWithTimeout(robotsUrl, ROBOTS_TIMEOUT_MS);
      if (!res?.ok) {
        ROBOTS_CACHE.set(origin, []);
      } else {
        const txt = await res.text();
        const lines = txt.split(/\r?\n/);
        let inStar = false;
        const dis: string[] = [];
        for (const line of lines) {
          const L = line.trim();
          if (!L || L.startsWith("#")) continue;
          if (/^User-agent:\s*\*/i.test(L)) { inStar = true; continue; }
          if (/^User-agent:/i.test(L)) { inStar = false; continue; }
          if (inStar) {
            const m = L.match(/^Disallow:\s*(.*)$/i);
            const rule = (m?.[1] || "").trim();
            if (rule) dis.push(rule);
          }
        }
        ROBOTS_CACHE.set(origin, dis);
      }
    }
    const dis = ROBOTS_CACHE.get(origin) || [];
    const path = target.pathname || "/";
    for (const rule of dis) {
      if (rule === "/") return false;
      if (rule && path.startsWith(rule)) return false;
    }
    return true;
  } catch { return true; }
}

/** نرمال‌سازی پیشوند مسیر: شروع با `/` و پایان با `/` */
function normalizePrefix(p: string): string {
  let s = (p || "").trim();
  if (!s.startsWith("/")) s = "/" + s;
  if (!s.endsWith("/")) s += "/";
  return s;
}

/** استخراج پیشوند «همان شاخه» از URL شروع (برای samePath) */
function deriveSamePathPrefix(start: URL): string {
  let p = start.pathname || "/";
  if (!p.endsWith("/")) {
    const i = p.lastIndexOf("/");
    p = i >= 0 ? p.slice(0, i + 1) : "/";
  }
  return normalizePrefix(p);
}

/* ---------------- Route ---------------- */
export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) return unauthorizedJson();

    // Rate-limit
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!rateLimit(`${ip}:crawl`)) {
      return NextResponse.json({ ok: false, error: "rate_limited", hint: "Too many requests, try later." }, { status: 429 });
    }

    // Validate
    const parsed = BodySchema.parse(await req.json());
    const { url, title, depth, maxPages, sameHost, pathPrefix, samePath } = parsed;
    const dims = (parsed.dims?.length ? Array.from(new Set(parsed.dims)) : DEFAULT_DIMS) as (1024 | 1536)[];
    const start = new URL(url);

    // robots برای مبدا
    if (!(await allowedByRobotsTxt(start))) {
      return NextResponse.json({ ok: false, error: "blocked_by_robots", url }, { status: 403 });
    }

    // تعیین پیشوند فیلترینگ مسیر
    const samePathPrefix = samePath ? deriveSamePathPrefix(start) : null;
    const pathPrefixNorm = pathPrefix ? normalizePrefix(pathPrefix) : null;

    // BFS — فچ و نگه‌داری HTML/متن همان‌جا
    type Page = { url: string; html: string; text: string; title: string | null };
    const visited = new Set<string>();
    const pages: Page[] = [];

    let level = 0;
    let currentLevel: URL[] = [start];

    while (level <= depth && pages.length < maxPages && currentLevel.length) {
      const nextLevel: URL[] = [];

      for (const u of currentLevel) {
        if (pages.length >= maxPages) break;
        const key = u.toString();
        if (visited.has(key)) continue;
        visited.add(key);

        if (sameHost && u.host !== start.host) continue;

        // فیلتر مسیر
        const pth = u.pathname || "/";
        if (pathPrefixNorm && !pth.startsWith(pathPrefixNorm)) continue;
        if (!pathPrefixNorm && samePathPrefix && !pth.startsWith(samePathPrefix)) continue;

        if (!(await allowedByRobotsTxt(u))) continue;

        const res = await fetchWithTimeout(key);
        if (!res?.ok) continue;

        const ct = res.headers.get("content-type") || "";
        if (!/\btext\/html\b/i.test(ct)) continue;

        let html = await res.text();
        if (html.length > MAX_HTML_LEN) html = html.slice(0, MAX_HTML_LEN);

        const pageTitle = parseTitle(html) || u.hostname;
        const text = stripHtml(html);
        if (!text) continue;

        pages.push({ url: key, html, text, title: pageTitle });

        if (level < depth) {
          const outs = extractLinks(html, u)
            .map(h => { try { return new URL(h); } catch { return null as any; } })
            .filter((x: URL | null): x is URL => !!x)
            .filter(x => !sameHost || x.host === start.host)
            .filter(x => {
              const xp = x.pathname || "/";
              if (pathPrefixNorm) return xp.startsWith(pathPrefixNorm);
              if (samePathPrefix) return xp.startsWith(samePathPrefix);
              return true;
            })
            .filter(x => !visited.has(x.toString()));
          nextLevel.push(...outs);
        }
      }

      currentLevel = nextLevel;
      level += 1;
    }

    if (pages.length === 0) {
      return NextResponse.json({ ok: false, error: "no_pages_fetched" }, { status: 422 });
    }

    // عنوان KB
    const kbTitle = title || pages[0]?.title || start.hostname;

    // Dedup — بر پایهٔ کل متن گردآوری‌شده
    const joined = pages.map(p => p.text.slice(0, 200_000)).join("\n\n");
    const checksum = crypto.createHash("sha256").update(joined).digest("hex");

    const { data: existingKB } = await sb
      .from("knowledge_base")
      .select("id, total_chunks")
      .eq("owner_id", userId)
      .eq("source_ref", start.toString())
      .eq("checksum", checksum)
      .maybeSingle();

    if (existingKB?.id) {
      return NextResponse.json({
        ok: true,
        kbId: existingKB.id,
        title: kbTitle,
        status: "ready",
        chunks: existingKB.total_chunks ?? 0,
        has1024: Number(dims.includes(1024)),
        has1536: Number(dims.includes(1536)),
        dedup: true,
        pages: pages.map(p => p.url),
        filters: {
          sameHost,
          pathPrefix: pathPrefixNorm,
          samePath: samePath || false,
        },
      });
    }

    // چانک‌سازی
    const allChunks: { content: string; path: string; idx: number; lang: string; title: string | null }[] = [];
    let idx = 0;
    for (const p of pages) {
      const lang = isPersian(p.text) ? "fa" : "en";
      const parts = chunkText(p.text, 700, 0.12);
      for (const part of parts) {
        const content = String((part as any)?.text ?? part ?? "");
        if (!content) continue;
        allChunks.push({ content, path: p.url, idx: idx++, lang, title: p.title });
      }
    }
    if (!allChunks.length) {
      return NextResponse.json({ ok: false, error: "no_chunks_produced" }, { status: 422 });
    }

    const langKB = allChunks.some(c => c.lang === "fa") ? "fa" : "en";

    // ساخت KB
    const { data: kbRow, error: kbErr } = await sb
      .from("knowledge_base")
      .insert({
        title: kbTitle,
        status: "indexing",
        total_chunks: allChunks.length,
        language: langKB,
        source_type: "crawl",
        source_ref: start.toString(),
        checksum,
        owner_id: userId,
      })
      .select("id")
      .single();
    if (kbErr || !kbRow) {
      return NextResponse.json({ ok: false, error: kbErr?.message ?? "KB insert failed" }, { status: 500 });
    }
    const kbId: string = kbRow.id;

    // امبدینگ‌ها
    const vectorsByDim = await embedBatchWithDims(allChunks.map(c => c.content), dims);

    // درج چانک‌ها
    const records = allChunks.map((c, i) => {
      const meta_json = {
        title: c.title || kbTitle,
        lang: c.lang,
        chunk_index: i,
        path: c.path,
      };
      const rec: any = {
        kb_id: kbId,
        chunk_index: i,
        content: c.content,
        tokens: estTokens(c.content),
        meta_json,
      };
      if (vectorsByDim[1024]?.[i]) rec.embedding_1024 = vectorsByDim[1024][i];
      if (vectorsByDim[1536]?.[i]) rec.embedding_1536 = vectorsByDim[1536][i];
      return rec;
    });

    const { error: insErr } = await sb.from("knowledge_chunks").insert(records);
    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr?.message ?? "Chunks insert failed" }, { status: 500 });
    }

    await sb.from("knowledge_base").update({ status: "ready" }).eq("id", kbId);

    return NextResponse.json({
      ok: true,
      kbId,
      title: kbTitle,
      status: "ready",
      chunks: records.length,
      has1024: Number(!!vectorsByDim[1024]),
      has1536: Number(!!vectorsByDim[1536]),
      dedup: false,
      degraded: false,
      pages: pages.map(p => p.url),
      filters: {
        sameHost,
        pathPrefix: pathPrefixNorm,
        samePath: samePath || false,
      },
    });
  } catch (e: any) {
    if (e?.issues) {
      return NextResponse.json({ ok: false, error: "validation_error", details: e.issues }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: e?.message ?? "internal_error" }, { status: 500 });
  }
}
