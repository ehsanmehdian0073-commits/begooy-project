// app/api/kb/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin as sb } from "@/lib/supabaseAdmin";
import { requireVerifiedUserId } from "@/lib/server-auth";

// ورودی را هم از body و هم از query می‌پذیریم
const BodySchema = z.object({
  kbId: z.string().uuid(),
});

async function handleDelete(req: NextRequest) {
  const auth = await requireVerifiedUserId();
  if (auth.response) return auth.response;
  const { userId } = auth;

  // جمع‌آوری kbId از body یا query
  let kbId: string | null = null;
  try {
    if (req.method === "DELETE") {
      const urlKb = req.nextUrl.searchParams.get("kbId");
      if (urlKb) kbId = urlKb;
      else {
        const raw = await req.json().catch(() => ({}));
        const parsed = BodySchema.safeParse(raw);
        if (parsed.success) kbId = parsed.data.kbId;
      }
    } else {
      const raw = await req.json();
      kbId = BodySchema.parse(raw).kbId;
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  if (!kbId) {
    return NextResponse.json({ ok: false, error: "kbId_required" }, { status: 400 });
  }

  // چک مالکیت
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

  // حذف KB (چانک‌ها به‌دلیل on delete cascade خودکار حذف می‌شوند)
  const { error: delErr } = await sb.from("knowledge_base").delete().eq("id", kbId).eq("owner_id", userId);
  if (delErr) {
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: 1, kbId });
}

export async function DELETE(req: NextRequest) {
  return handleDelete(req);
}

// برای راحتی ابزارها، POST هم همان حذف را انجام بدهد
export async function POST(req: NextRequest) {
  return handleDelete(req);
}
