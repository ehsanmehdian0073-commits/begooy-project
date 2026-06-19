// app/api/kb/ask/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireVerifiedUserId } from "@/lib/server-auth";

/** ---------- Config ---------- */
const BASE =
  process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "") || "http://localhost:3000";

const DEFAULT_LIMIT = 5;
const DEFAULT_MIN_SIM = 0.2;                 // fallback semantic
const DEFAULT_DIMS = [1536];                 // fallback
const DEFAULT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

// Hybrid defaults
const USE_HYBRID_DEFAULT = true;
const SEM_WEIGHT_DEFAULT = 0.7;
const LEX_WEIGHT_DEFAULT = 0.3;

// Context sizing (approx)
const MAX_CONTEXT_CHARS = 8000;
const MAX_CHUNK_CHARS = 1200;

/** ---------- Utils ---------- */
function isPersian(text: string) { return /[\u0600-\u06FF]/.test(text); }
function truncate(s: string, n: number) { return !s ? "" : (s.length <= n ? s : s.slice(0, n) + " …"); }

type RawSearchItem = {
  id?: string;
  kbId?: string;
  kb_id?: string;
  dim?: number;
  score?: number;
  sem?: number;
  lex?: number;
  content?: string;
  text?: string;
  meta?: { title?: string; path?: string } | null;
};

type Citation = {
  index: number;
  id: string | null;
  kbId: string | null;
  dim: number | null;
  score: number | null;
  title: string | null;
  path: string | null;
  snippet: string;
};

function normalizeCitations(results: RawSearchItem[]): Citation[] {
  return results.map((r, i) => ({
    index: i + 1,
    id: r.id ?? null,
    kbId: (r as any).kbId ?? (r as any).kb_id ?? null,
    dim: r.dim ?? null,
    score: typeof r.score === "number" ? r.score : null,
    title: r?.meta?.title ?? null,
    path: r?.meta?.path ?? null,
    snippet: truncate(r.content ?? r.text ?? "", 220),
  }));
}

function buildContext(results: RawSearchItem[]) {
  const lines: string[] = [];
  let total = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const chunk = truncate(r.content ?? r.text ?? "", MAX_CHUNK_CHARS);
    const block = `[${i + 1}] ${chunk}`;
    if (total + block.length > MAX_CONTEXT_CHARS) break;
    lines.push(block);
    total += block.length;
  }
  return lines.join("\n\n");
}

function systemInstruction(langFa: boolean) {
  if (langFa) {
    return (
      "تو یک دستیار دقیق هستی. فقط و فقط از «متن زمینه» که بهت داده می‌شود پاسخ بده. " +
      "اگر پاسخ در متن زمینه نبود یا مطمئن نبودی، صریح بگو «نمی‌دانم». " +
      "پاسخ را به زبان پرسش‌کننده (اینجا: فارسی) بنویس. " +
      "هنگام ارجاع به منابع، از قالب ]]1[[، ]]2[[ استفاده کن و در انتهای پاسخ بخش «منابع» را لیست کن."
    );
  }
  return (
    "You are a precise assistant. Answer ONLY from the provided CONTEXT. " +
    "If the answer isn't in the context or you're unsure, say you don't know. " +
    "Answer in the user's language. " +
    "Use citations with the ]]1[[, ]]2[[ markup and list a final 'Sources' section."
  );
}

/** ---------- Route ---------- */
export async function POST(req: NextRequest) {
  const hasApiKey = !!process.env.OPENAI_API_KEY;
  const openai = hasApiKey ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY! }) : null;

  try {
    const auth = await requireVerifiedUserId();
    if (auth.response) return auth.response;

    // Body
    const body = await req.json();
    const kbId: string = body.kbId;
    const question: string = body.question;
    const limit: number = Number.isFinite(body.limit) ? Number(body.limit) : DEFAULT_LIMIT;
    const model = String(body.model || DEFAULT_MODEL);

    // Hybrid controls (overridable)
    const useHybrid: boolean =
      body.useHybrid === undefined ? USE_HYBRID_DEFAULT : !!body.useHybrid;

    const _sw = Number.isFinite(body.semWeight) ? Number(body.semWeight) : SEM_WEIGHT_DEFAULT;
    const _lw = Number.isFinite(body.lexWeight) ? Number(body.lexWeight) : LEX_WEIGHT_DEFAULT;

    // clamp to [0..1], then normalize so sum=1 (and avoid div/0)
    const swClamped = Math.max(0, Math.min(1, _sw));
    const lwClamped = Math.max(0, Math.min(1, _lw));
    const sum = swClamped + lwClamped || 1;
    const semWeight = swClamped / sum;
    const lexWeight = lwClamped / sum;

    // Semantic fallback params
    const dims: number[] =
      Array.isArray(body.dims) && body.dims.length ? body.dims : DEFAULT_DIMS;
    const minSim: number =
      Number.isFinite(body.minSim) ? Number(body.minSim) : DEFAULT_MIN_SIM;

    if (!kbId || !question) {
      return NextResponse.json(
        { ok: false, error: "kbId and question are required" },
        { status: 400 }
      );
    }

    const passHeaders = new Headers({ "Content-Type": "application/json" });
    const cookie = req.headers.get("cookie");
    if (cookie) passHeaders.set("cookie", cookie);

    // ---------- Retrieval
    let mode: "hybrid" | "semantic" | "no-context" | "dry-run" = "hybrid";
    let results: RawSearchItem[] = [];

    if (useHybrid) {
      try {
        const hres = await fetch(`${BASE}/api/kb/search-hybrid`, {
          method: "POST",
          headers: passHeaders,
          cache: "no-store",
          body: JSON.stringify({
            kbId,
            query: question,
            dims,            // keep same dims as fallback
            limit,
            minScore: 0,
            semWeight,
            lexWeight,
          }),
        });
        if (hres.ok) {
          const j = await hres.json();
          results = j.results || [];
        }
      } catch {
        // swallow & fall back
      }
    }

    // Fallback to semantic vector search
    if (!results.length) {
      mode = "semantic";
      try {
        const sres = await fetch(`${BASE}/api/kb/search`, {
          method: "POST",
          headers: passHeaders,
          cache: "no-store",
          body: JSON.stringify({ kbId, query: question, dims, limit, minSim }),
        });
        if (sres.ok) {
          const j = await sres.json();
          results = j.results || [];
        }
      } catch { /* ignore */ }

      // Last-chance: minSim=0 for citations
      if (!results.length) {
        try {
          const fb = await fetch(`${BASE}/api/kb/search`, {
            method: "POST",
            headers: passHeaders,
            cache: "no-store",
            body: JSON.stringify({ kbId, query: question, dims, limit, minSim: 0 }),
          });
          if (fb.ok) {
            const jj = await fb.json();
            results = jj.results || [];
          }
        } catch { /* ignore */ }
      }
    }

    const citations: Citation[] = normalizeCitations(results);

    // Dry-run without API key
    if (!hasApiKey) {
      return NextResponse.json(
        {
          ok: true,
          answer: null,
          citations,
          model: null,
          mode: useHybrid ? "dry-run" : "dry-run-semantic",
          weights: useHybrid ? { semWeight, lexWeight } : undefined,
        },
        { status: 200 }
      );
    }

    // No context
    if (!results.length) {
      mode = "no-context";
      const langFa = isPersian(question);
      return NextResponse.json(
        {
          ok: true,
          answer: langFa ? "پاسخی در پایگاه دانش پیدا نشد." : "No relevant information was found.",
          citations,
          model,
          mode,
          weights: useHybrid ? { semWeight, lexWeight } : undefined,
        },
        { status: 200 }
      );
    }

    // ---------- Build context & answer
    const context = buildContext(results);
    const langFa = isPersian(question);
    const sys = systemInstruction(langFa);

    const userPrompt = [
      langFa ? "پرسش:" : "QUESTION:",
      question,
      "",
      langFa ? "متن زمینه:" : "CONTEXT:",
      context,
      "",
      langFa
        ? "دستور: فقط از متن زمینه بالا استفاده کن. اگر کافی نبود، صریح بگو «نمی‌دانم». در انتها بخش «منابع» را با قالب ]]n[[ لیست کن."
        : "Instruction: Use ONLY the context above. If not sufficient, say you don't know. End with a 'Sources' section using ]]n[[ markup.",
    ].join("\n");

    const chat = await openai!.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userPrompt },
      ],
    });

    const answer = chat.choices?.[0]?.message?.content?.trim() ?? "";

    return NextResponse.json(
      {
        ok: true,
        answer,
        citations,
        model,
        mode: useHybrid ? "rag-hybrid" : mode,
        weights: useHybrid ? { semWeight, lexWeight } : undefined,
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
        { ok: false, error: err?.message || "unknown_error" },
        { status: 500 }
    );
  }
}
