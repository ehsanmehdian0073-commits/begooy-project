import { NextResponse } from "next/server";
import { createClientForAction } from "@/utils/supabase/server";

function allowMockBilling() {
  return process.env.ALLOW_MOCK_BILLING === "true" && process.env.NODE_ENV !== "production";
}

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

  // mock ⇒ موفق فقط با opt-in غیر production
  if ((p.authority || "").startsWith("mock-") || p.gateway === "mock") {
    if (!allowMockBilling()) {
      await supabase.from("payments").update({ status: "failed" }).eq("id", p.id);
      return NextResponse.json({ ok: false, error: "MOCK_BILLING_DISABLED" }, { status: 400 });
    }

    // ایجاد/تمدید اشتراک یک‌ماهه
    const now = new Date();
    const ends = new Date(now); ends.setMonth(ends.getMonth() + 1);
    const { error: subErr } = await supabase.from("subscriptions").insert([{
      user_id: user.id,
      plan_id: p.plan_id,
      status: "active",
      started_at: now.toISOString(),
      ends_at: ends.toISOString(),
    }]);
    if (subErr) {
      console.error("[subscriptions.insert.error]", subErr);
      return NextResponse.json({ ok: false, error: "subscription_failed" }, { status: 500 });
    }

    const { error: payErr } = await supabase.from("payments").update({ status: "paid" }).eq("id", p.id);
    if (payErr) {
      console.error("[payments.paid_update.error]", payErr);
      return NextResponse.json({ ok: false, error: "payment_update_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, paid: true, plan: p.plan_id });
  }

  // واقعی ⇒ درخواست verify به زرین‌پال
  const MERCHANT_ID = process.env.ZARINPAL_MERCHANT_ID?.trim();
  const IS_SANDBOX =
    process.env.ZARINPAL_SANDBOX === undefined
      ? process.env.NODE_ENV !== "production"
      : process.env.ZARINPAL_SANDBOX === "true";
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

    const now = new Date();
    const ends = new Date(now); ends.setMonth(ends.getMonth() + 1);
    const { error: subErr } = await supabase.from("subscriptions").insert([{
      user_id: user.id,
      plan_id: p.plan_id,
      status: "active",
      started_at: now.toISOString(),
      ends_at: ends.toISOString(),
    }]);
    if (subErr) {
      console.error("[subscriptions.insert.error]", subErr);
      return NextResponse.json({ ok: false, error: "subscription_failed" }, { status: 500 });
    }

    const { error: payErr } = await supabase.from("payments").update({
      status: "paid",
      ref_id: String(json?.data?.ref_id ?? ""),
    }).eq("id", p.id);
    if (payErr) {
      console.error("[payments.paid_update.error]", payErr);
      return NextResponse.json({ ok: false, error: "payment_update_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, paid: true, plan: p.plan_id });
  } catch {
    await supabase.from("payments").update({ status: "failed" }).eq("id", p.id);
    return NextResponse.json({ ok: false, error: "verify_catch" }, { status: 500 });
  }
}
