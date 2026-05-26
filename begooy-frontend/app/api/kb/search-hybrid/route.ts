// app/api/kb/search-hybrid/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin as sb } from "@/lib/supabaseAdmin";
import { embedBatchWithDims } from "@/lib/kb/embed";
import { getAuthenticatedUserId, unauthorizedJson } from "@/lib/auth/routeUser";

const BodySchema = z.object({
  kbId: z.string().uuid(),
  query: z.string().min(1),
  limit: z.number().int().min(1).max(20).optional(),
  minScore: z.number().min(0).max(10).optional(),      // 0..10 هم قبول می‌کنیم
  semWeight: z.number().min(0).max(10).optional(),      // 0..10 هم قبول می‌کنیم
  lexWeight: z.number().min(0).max(10).optional(),      // 0..10 هم قبول می‌کنیم
  dims: z.array(z.number().int().refine(d => d === 1024 || d === 1536)).optional(),
});

const DEFAULT_LIMIT = 5;
const DEFAULT_MIN_SCORE = 0;
const DEFAULT_SEM_WEIGHT = 0.7;  // وزن پیش‌فرض بهتر
const DEFAULT_LEX_WEIGHT = 0.3;
const DEFAULT_DIMS = [1536] as const;

type RpcRow = {
  chunk_id?: string;
  kb_id?: string;
  content?: string;
  score?: number;
  sem?: number;       // امضای جدید
  lex?: number;       // امضای جدید
  sem_sim?: number;   // سازگاری با امضای قدیمی
  lex_rank?: number;  // سازگاری با امضای قدیمی
  meta?: any;
  dim?: number;
};

export async function POST(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return unauthorizedJson();
    }

    const raw = await req.json();
    const parsed = BodySchema.parse(raw);

    const kbId = parsed.kbId;
    const query = parsed.query;
    const limit = typeof parsed.limit === "number" ? parsed.limit : DEFAULT_LIMIT;

    const { data: kb, error: kbErr } = await sb
      .from("knowledge_base")
      .select("id, owner_id")
      .eq("id", kbId)
      .single();

    if (kbErr || !kb) {
      return NextResponse.json({ ok: false, error: "kb_not_found" }, { status: 404 });
    }
    if (kb.owner_id !== userId) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    // نرمال‌سازی وزن‌ها (فارغ از اینکه 0..1 یا 0..10 داده‌شود)
    const sw = (typeof parsed.semWeight === "number" ? parsed.semWeight : DEFAULT_SEM_WEIGHT);
    const lw = (typeof parsed.lexWeight === "number" ? parsed.lexWeight : DEFAULT_LEX_WEIGHT);
    const swc = Math.max(0, Math.min(10, sw));
    const lwc = Math.max(0, Math.min(10, lw));
    const sum = (swc + lwc) || 1;
    const semWeight = swc / sum;
    const lexWeight = lwc / sum;

    // minScore را هم به بازهٔ 0..1 می‌آوریم
    const ms = typeof parsed.minScore === "number" ? parsed.minScore : DEFAULT_MIN_SCORE;
    const minScore = Math.max(0, Math.min(10, ms)) / 10;

    // ابعاد مورد استفاده
    const dims = (parsed.dims?.length ? Array.from(new Set(parsed.dims)) : [...DEFAULT_DIMS]) as (1024|1536)[];

    // امبدینگ برای ابعاد خواسته‌شده
    const embedMap = await embedBatchWithDims([query], dims);
    const q1024 = embedMap[1024]?.[0] ?? null;
    const q1536 = embedMap[1536]?.[0] ?? null;

    if (!q1024 && !q1536) {
      return NextResponse.json({ ok: false, error: "embedding_failed" }, { status: 500 });
    }

    // ----- تلاش 1: امضای جدید RPC (با p_query_text و p_dims)
    let rpc = await sb.rpc("match_knowledge_chunks_hybrid", {
      p_kb_id: kbId,
      p_query_text: query,
      p_query_1024: q1024,
      p_query_1536: q1536,
      p_dims: dims,
      p_match_count: limit,
      p_sem_weight: semWeight,
      p_lex_weight: lexWeight,
      p_min_score: minScore,
    });

    // اگر امضای جدید موجود نبود، تلاش 2: امضای قدیمی (بدون p_dims و با p_query)
    if (rpc.error) {
      rpc = await sb.rpc("match_knowledge_chunks_hybrid", {
        p_kb_id: kbId,
        p_query: query,
        p_query_1536: q1536 ?? q1024 ?? null,
        p_match_count: limit,
        p_sem_weight: semWeight,
        p_lex_weight: lexWeight,
        p_min_score: minScore,
      });
      if (rpc.error) {
        return NextResponse.json({ ok: false, error: `rpc error: ${rpc.error.message}` }, { status: 500 });
      }
    }

    const rows = (rpc.data ?? []) as RpcRow[];
    const results = rows.map((r) => ({
      id: r.chunk_id ?? null,
      kbId: r.kb_id ?? kbId,
      dim: r.dim ?? (q1536 ? 1536 : 1024),
      score: typeof r.score === "number" ? r.score : null,
      sem: typeof r.sem === "number" ? r.sem : (typeof r.sem_sim === "number" ? r.sem_sim : null),
      lex: typeof r.lex === "number" ? r.lex : (typeof r.lex_rank === "number" ? r.lex_rank : null),
      content: r.content ?? "",
      meta: r.meta ?? null,
    }));

    return NextResponse.json({
      ok: true,
      params: { limit, minScore, semWeight, lexWeight, dims },
      results,
    }, { status: 200 });

  } catch (e: any) {
    if (e?.issues) {
      return NextResponse.json({ ok: false, error: "validation_error", details: e.issues }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: e?.message ?? "unexpected_error" }, { status: 500 });
  }
}
