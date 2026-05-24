import { NextResponse } from "next/server";
import { createClientForAction } from "@/utils/supabase/server";

/** فقط برای پرداخت‌های Zarinpal یا mock که هنوز pending هستند */
export async function POST(req: Request) {
  const supabase = await createClientForAction();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const { data: p, error } = await supabase
    .from("payments")
    .select("id, user_id, plan_id, amount_rial, gateway, status, authority")
    .eq("id", id)
    .maybeSingle();

  if (error || !p || p.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "payment_not_found" }, { status: 404 });
  }

  if (p.status === "paid") {
    return NextResponse.json({ ok: true, paid: true, already: true });
  }

  // mock ⇒ موفق
  if ((p.authority || "").startsWith("mock-") || p.gateway === "mock") {
    const { data: paidPayment, error: paidErr } = await supabase
      .from("payments")
      .update({ status: "paid" })
      .eq("id", p.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (paidErr) return NextResponse.json({ ok: false, error: "payment_update_failed" }, { status: 500 });
    if (!paidPayment) return NextResponse.json({ ok: true, paid: true, already: true });

    // ایجاد/تمدید اشتراک یک‌ماهه
    const now = new Date();
    const ends = new Date(now); ends.setMonth(ends.getMonth() + 1);
    await supabase.from("subscriptions").insert([{
      user_id: user.id,
      plan_id: p.plan_id,
      status: "active",
      started_at: now.toISOString(),
      ends_at: ends.toISOString(),
    }]);

    return NextResponse.json({ ok: true, paid: true, plan: p.plan_id });
  }

  // واقعی ⇒ درخواست verify به زرین‌پال
  const MERCHANT_ID = process.env.ZARINPAL_MERCHANT_ID?.trim();
  const IS_SANDBOX = String(process.env.ZARINPAL_SANDBOX ?? "true") === "true";
  if (!MERCHANT_ID) return NextResponse.json({ ok: false, error: "MISSING_MERCHANT_ID" }, { status: 500 });

  const base = IS_SANDBOX
    ? "https://sandbox.zarinpal.com/pg/v4"
    : "https://api.zarinpal.com/pg/v4";

  try {
    const res = await fetch(`${base}/payment/verify.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_id: MERCHANT_ID,
        amount: Number(p.amount_rial ?? 0),
        authority: p.authority,
      }),
      // @ts-ignore
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({} as any));
    const ok = json?.data?.code === 100 || json?.data?.code === 101;
    if (!ok) {
      await supabase.from("payments").update({ status: "failed" }).eq("id", p.id);
      return NextResponse.json({ ok: false, error: "verify_failed" }, { status: 400 });
    }

    const { data: paidPayment, error: paidErr } = await supabase.from("payments").update({
      status: "paid",
      ref_id: String(json?.data?.ref_id ?? ""),
    })
      .eq("id", p.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (paidErr) return NextResponse.json({ ok: false, error: "payment_update_failed" }, { status: 500 });
    if (!paidPayment) return NextResponse.json({ ok: true, paid: true, already: true });

    const now = new Date();
    const ends = new Date(now); ends.setMonth(ends.getMonth() + 1);
    await supabase.from("subscriptions").insert([{
      user_id: user.id,
      plan_id: p.plan_id,
      status: "active",
      started_at: now.toISOString(),
      ends_at: ends.toISOString(),
    }]);

    return NextResponse.json({ ok: true, paid: true, plan: p.plan_id });
  } catch {
    await supabase.from("payments").update({ status: "failed" }).eq("id", p.id);
    return NextResponse.json({ ok: false, error: "verify_catch" }, { status: 500 });
  }
}
