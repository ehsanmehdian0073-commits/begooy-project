// app/api/billing/verify/route.ts
import { NextResponse } from "next/server";
import { createClientForAction } from "@/utils/supabase/server";
import { allowMockBilling } from "@/utils/billing/mock";

type VerifyResult =
  | { ok: true; cardHash?: string; refId?: string }
  | { ok: false; error: string };

// Helper: بساز URL مطلق با توجه به origin درخواست
function abs(path: string, req: Request) {
  const { origin } = new URL(req.url);
  return new URL(path, origin).toString();
}

async function verifyWithZarinpal(authority: string, amountRial: number): Promise<VerifyResult> {
  const MERCHANT_ID = process.env.ZARINPAL_MERCHANT_ID?.trim();
  const IS_SANDBOX = String(process.env.ZARINPAL_SANDBOX ?? "true") === "true";
  if (!MERCHANT_ID) return { ok: false, error: "MISSING_MERCHANT_ID" };

  const base = IS_SANDBOX
    ? "https://sandbox.zarinpal.com/pg/v4"
    : "https://api.zarinpal.com/pg/v4";

  try {
    const res = await fetch(`${base}/payment/verify.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchant_id: MERCHANT_ID, amount: amountRial, authority }),
      // @ts-ignore
      cache: "no-store",
    });

    const json = await res.json().catch(() => ({} as any));
    const ok = json?.data?.code === 100 || json?.data?.code === 101;
    if (!ok) {
      return { ok: false, error: `VERIFY_FAILED: ${json?.errors?.message ?? json?.data?.code ?? "unknown"}` };
    }
    return { ok: true, cardHash: json?.data?.card_hash, refId: String(json?.data?.ref_id ?? "") };
  } catch (e: any) {
    return { ok: false, error: `VERIFY_CATCH: ${e?.message ?? e}` };
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const planIdQ = (url.searchParams.get("planId") || "").trim();
    const authority = (url.searchParams.get("Authority") || "").trim();
    const status = (url.searchParams.get("Status") || "").trim().toUpperCase();

    if (!planIdQ || !authority) {
      return NextResponse.redirect(abs(`/dashboard/billing?plan=${encodeURIComponent(planIdQ)}&paid=0&err=bad_params`, req));
    }

    const supabase = await createClientForAction(); // مهم: await

    const { data: payRow, error: payFindErr } = await supabase
      .from("payments")
      .select("id, user_id, plan_id, amount_rial, gateway, status")
      .eq("authority", authority)
      .maybeSingle();

    const effectivePlan = payRow?.plan_id || planIdQ || "";
    const returnTo = `/dashboard/billing?plan=${encodeURIComponent(effectivePlan)}`;

    if (payFindErr || !payRow) {
      return NextResponse.redirect(abs(`${returnTo}&paid=0&err=payment_not_found`, req));
    }

    // اگر قبلاً paid شده، دوباره کاری نکن
    if (payRow.status === "paid") {
      return NextResponse.redirect(abs(`${returnTo}&paid=1`, req));
    }

    if (status !== "OK") {
      await supabase.from("payments").update({ status: "failed" }).eq("id", payRow.id);
      return NextResponse.redirect(abs(`${returnTo}&paid=0&err=user_cancelled`, req));
    }

    // mock یا واقعی
    const isMockPayment = authority.startsWith("mock-") || payRow.gateway === "mock";
    let verify: VerifyResult = { ok: true };
    if (isMockPayment) {
      if (!allowMockBilling()) {
        return NextResponse.redirect(abs(`${returnTo}&paid=0&err=mock_billing_disabled`, req));
      }
    } else {
      const amountRial = Number(payRow.amount_rial ?? 0);
      verify = await verifyWithZarinpal(authority, amountRial);
    }

    if (!verify.ok) {
      await supabase.from("payments").update({ status: "failed" }).eq("id", payRow.id);
      return NextResponse.redirect(abs(`${returnTo}&paid=0&err=${encodeURIComponent((verify as any).error)}`, req));
    }

    // پرداخت موفق
    const { error: paidErr } = await supabase
      .from("payments")
      .update({ status: "paid", ref_id: "refId" in verify ? verify.refId : null })
      .eq("id", payRow.id);
    if (paidErr) {
      return NextResponse.redirect(abs(`${returnTo}&paid=0&err=payment_update_failed`, req));
    }

    // ایجاد/تمدید اشتراک یک‌ماهه ساده
    const now = new Date();
    const ends = new Date(now);
    ends.setMonth(ends.getMonth() + 1);

    const { error: subErr } = await supabase.from("subscriptions").insert([
      {
        user_id: payRow.user_id,
        plan_id: effectivePlan,
        status: "active",
        started_at: now.toISOString(),
        ends_at: ends.toISOString(),
      },
    ]);
    if (subErr) {
      await supabase.from("payments").update({ status: "pending" }).eq("id", payRow.id);
      return NextResponse.redirect(abs(`${returnTo}&paid=0&err=subscription_create_failed`, req));
    }

    return NextResponse.redirect(abs(`${returnTo}&paid=1`, req));
  } catch (err: any) {
    const m = typeof err?.message === "string" ? err.message : "verify_unhandled_error";
    return NextResponse.redirect(abs(`/dashboard/billing?paid=0&err=${encodeURIComponent(m)}`, req));
  }
}
