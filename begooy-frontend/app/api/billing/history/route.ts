// app/api/billing/history/route.ts
import { NextResponse } from "next/server";
import { createClientForAction } from "@/utils/supabase/server";

export async function GET(req: Request) {
  const supabase = await createClientForAction();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("payments")
    .select("id, plan_id, amount_toman, amount_rial, gateway, status, ref_id, authority, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[billing.history]", error);
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, items: data ?? [] });
}
