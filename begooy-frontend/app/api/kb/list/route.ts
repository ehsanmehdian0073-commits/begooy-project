// app/api/kb/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin as sb } from "@/lib/supabaseAdmin";

const QuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().optional(), // جستجو روی title (اختیاری)
});

export async function GET(req: NextRequest) {
  try {
    const userId = (req.headers.get("x-user-id") || "").trim();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "missing_user_id" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const parsed = QuerySchema.parse({
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      q: searchParams.get("q") || undefined,
    });

    const { page, pageSize, q } = parsed;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = sb
      .from("knowledge_base")
      .select(
        "id, title, status, created_at, total_chunks, language, source_type, source_ref",
        { count: "exact" }
      )
      .eq("owner_id", userId);

    if (q && q.trim()) {
      query = query.ilike("title", `%${q.trim()}%`);
    }

    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      items: data ?? [],
      page,
      pageSize,
      total: count ?? 0,
      hasMore: typeof count === "number" ? to + 1 < count : false,
    });
  } catch (e: any) {
    if (e?.issues) {
      return NextResponse.json({ ok: false, error: "validation_error", details: e.issues }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: e?.message ?? "unexpected_error" }, { status: 500 });
  }
}
