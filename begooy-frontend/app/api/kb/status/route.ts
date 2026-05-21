// app/api/kb/status/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin as sb } from "@/lib/supabaseAdmin";
import { getAuthenticatedUserId } from "@/lib/auth/session";

export async function GET(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const u = new URL(req.url);
    const kbId = (u.searchParams.get("kbId") || u.searchParams.get("id") || "").trim();

    if (!kbId) {
      return NextResponse.json({ ok: false, error: "kbId required" }, { status: 400 });
    }

    // 1) KB info
    const { data: kb, error: kbErr } = await sb
      .from("knowledge_base")
      .select("id,title,status,created_at,language,total_chunks,source_type,source_ref,owner_id")
      .eq("id", kbId)
      .single();

    if (kbErr || !kb) {
      return NextResponse.json({ ok: false, error: "KB not found" }, { status: 404 });
    }
    if (kb.owner_id !== userId) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    // 2) Counts بدون payload
    const { count: total } = await sb
      .from("knowledge_chunks")
      .select("*", { count: "exact", head: true })
      .eq("kb_id", kbId);

    const { count: c1024 } = await sb
      .from("knowledge_chunks")
      .select("*", { count: "exact", head: true })
      .eq("kb_id", kbId)
      .not("embedding_1024", "is", null);

    const { count: c1536 } = await sb
      .from("knowledge_chunks")
      .select("*", { count: "exact", head: true })
      .eq("kb_id", kbId)
      .not("embedding_1536", "is", null);

    return NextResponse.json(
      {
        ok: true,
        kbId: kb.id,
        title: kb.title,
        status: kb.status,
        createdAt: kb.created_at,
        language: kb.language,
        totalChunks: kb.total_chunks ?? total ?? 0,
        sourceType: kb.source_type,
        sourceRef: kb.source_ref,
        dims: {
          has1024: (c1024 ?? 0) > 0,
          count1024: c1024 ?? 0,
          has1536: (c1536 ?? 0) > 0,
          count1536: c1536 ?? 0,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Status failed" },
      { status: 500 }
    );
  }
}
