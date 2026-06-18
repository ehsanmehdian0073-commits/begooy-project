// app/api/auth/me/route.ts
import { NextResponse } from "next/server";
import { createClientForAction } from "@/utils/supabase/server";

export async function GET() {
  try {
    const supabase = await createClientForAction();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ ok: true, userId: user.id }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unexpected_error" },
      { status: 500 }
    );
  }
}
