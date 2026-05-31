import { NextResponse } from "next/server";
import { createClientForAction } from "@/utils/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
    const { error: payErr } = await supabaseAdmin.from("payments").update({ status: "paid" }).eq("id", p.id);
    if (payErr) {
      console.error("[billing.reverify.mock_payment_update]", payErr);
      return NextResponse.json({ ok: false, error: "payment_update_failed" }, { status: 500 });
    }

    // ایجاد/تمدید اشتراک یک‌ماهه
    const now = new Date();
    const ends = new Date(now); ends.setMonth(ends.getMonth() + 1);
    const { error: subErr } = await supabaseAdmin.from("subscriptions").insert([{
      user_id: user.id,
      plan_id: p.plan_id,
      status: "active",
      started_at: now.toISOString(),
      ends_at: ends.toISOString(),
    }]);
    if (subErr) {
      console.error("[billing.reverify.mock_subscription_insert]", subErr);
      const { error: rollbackErr } = await supabaseAdmin
        .from("payments")
        .update({ status: "pending", ref_id: null })
        .eq("id", p.id);
      if (rollbackErr) {
        console.error("[billing.reverify.mock_payment_rollback]", rollbackErr);
      }
      return NextResponse.json({ ok: false, error: "subscription_create_failed" }, { status: 500 });
    }

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
      const { error: failErr } = await supabaseAdmin.from("payments").update({ status: "failed" }).eq("id", p.id);
      if (failErr) {
        console.error("[billing.reverify.verify_failed_update]", failErr);
      }
      return NextResponse.json({ ok: false, error: "verify_failed" }, { status: 400 });
    }

    const { error: payErr } = await supabaseAdmin.from("payments").update({
      status: "paid",
      ref_id: String(json?.data?.ref_id ?? ""),
    }).eq("id", p.id);
    if (payErr) {
      console.error("[billing.reverify.payment_update]", payErr);
      return NextResponse.json({ ok: false, error: "payment_update_failed" }, { status: 500 });
    }

    const now = new Date();
    const ends = new Date(now); ends.setMonth(ends.getMonth() + 1);
    const { error: subErr } = await supabaseAdmin.from("subscriptions").insert([{
      user_id: user.id,
      plan_id: p.plan_id,
      status: "active",
      started_at: now.toISOString(),
      ends_at: ends.toISOString(),
    }]);
    if (subErr) {
      console.error("[billing.reverify.subscription_insert]", subErr);
      const { error: rollbackErr } = await supabaseAdmin
        .from("payments")
        .update({ status: "pending", ref_id: null })
        .eq("id", p.id);
      if (rollbackErr) {
        console.error("[billing.reverify.payment_rollback]", rollbackErr);
      }
      return NextResponse.json({ ok: false, error: "subscription_create_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, paid: true, plan: p.plan_id });
  } catch {
    const { error: failErr } = await supabaseAdmin.from("payments").update({ status: "failed" }).eq("id", p.id);
    if (failErr) {
      console.error("[billing.reverify.catch_failed_update]", failErr);
    }
    return NextResponse.json({ ok: false, error: "verify_catch" }, { status: 500 });
  }
}
