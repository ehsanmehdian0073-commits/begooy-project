// app/api/kb/search/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin as sb } from "@/lib/supabaseAdmin";
import { embedBatchWithDims } from "@/lib/kb/embed";
import { getAuthenticatedUserId, unauthorizedJson } from "@/lib/auth/routeUser";

const BodySchema = z.object({
  kbId: z.string().uuid(),
  query: z.string().min(1),
  dims: z.array(z.number().int().refine((d) => d === 1024 || d === 1536)).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  minSim: z.number().min(0).max(1).optional(),
});

const DEFAULT_DIMS = [1536] as const;
const DEFAULT_LIMIT = 5;
const DEFAULT_MIN_SIM = 0.2;

type RpcRow = {
  chunk_id?: string;
  kb_id?: string;
  dim?: number;
  content?: string;
  score?: number;
  meta?: any; // jsonb from SQL
};

export async function POST(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return unauthorizedJson();
    }

    // ---- Validate body
    const raw = await req.json();
    const { kbId, query, dims, limit, minSim } = BodySchema.parse(raw);

    const useDims = ((dims?.length ? Array.from(new Set(dims)) : DEFAULT_DIMS) as number[]).filter(
      (d) => d === 1024 || d === 1536
    ) as (1024 | 1536)[];
    const useLimit = typeof limit === "number" ? limit : DEFAULT_LIMIT;
    const useMinSim = typeof minSim === "number" ? minSim : DEFAULT_MIN_SIM;

    // ---- Ownership check (RLS bypass در admin client را جبران می‌کند)
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

    // ---- Embed the query for requested dims
    const embedMap = await embedBatchWithDims([query], useDims);
    const q1024 = embedMap[1024]?.[0] ?? null;   // real[] for 1024
    const q1536 = embedMap[1536]?.[0] ?? null;   // real[] for 1536

    // ---- Call RPC
    const { data, error } = await sb.rpc("match_knowledge_chunks", {
      p_kb_id: kbId,
      p_query_1024: q1024,
      p_query_1536: q1536,
      p_dims: useDims,
      p_match_count: useLimit,
      p_min_sim: useMinSim,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: `rpc error: ${error.message}` }, { status: 500 });
    }

    const rows = (data ?? []) as RpcRow[];

    // ---- Normalize results shape for the rest of the app
    const results = rows.map((r) => {
      const meta = r.meta ?? {};
      return {
        id: r.chunk_id ?? null,
        kbId,
        dim: r.dim ?? null,
        score: typeof r.score === "number" ? r.score : null,
        content: r.content ?? "",
        meta: {
          title: meta.title ?? null,
          path: meta.path ?? null,
          ...meta, // keep all meta for later (lang, chunk_index, etc.)
        },
      };
    });

    return NextResponse.json({ ok: true, results }, { status: 200 });
  } catch (e: any) {
    if (e?.issues) {
      return NextResponse.json({ ok: false, error: "validation_error", details: e.issues }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: e?.message ?? "unexpected error" }, { status: 500 });
  }
}
