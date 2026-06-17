import { NextResponse } from "next/server";
import { createClientForAction } from "@/utils/supabase/server";

/**
 * DELETE /api/billing/pending
 * body:
 *  - { id: string }   → لغو همان pending
 *  - { all: true }    → لغو تمام pendingهای کاربر
 */
export async function DELETE(req: Request) {
  // ⬅️ نکته‌ی اصلی: یادت نره await
  const supabase = await createClientForAction();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}

  const id: string | undefined = body?.id;
  const all: boolean = Boolean(body?.all);

  try {
    if (all) {
      const { error } = await supabase
        .from("payments")
        .update({ status: "canceled" })
        .eq("user_id", user.id)
        .eq("status", "pending");
      if (error) throw error;

      return NextResponse.json({ ok: true, count: "all" });
    }

    if (!id) {
      return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
    }

    const { error } = await supabase
      .from("payments")
      .update({ status: "canceled" })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("status", "pending");
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "delete_failed" },
      { status: 500 }
    );
  }
}
