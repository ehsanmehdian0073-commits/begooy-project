// app/api/billing/verify/route.ts
import { NextResponse } from "next/server";
import { createClientForAction } from "@/utils/supabase/server";
import { fulfillPayment } from "../_fulfillment";

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

    if (status !== "OK") {
      await supabase.from("payments").update({ status: "failed" }).eq("id", payRow.id).neq("status", "paid");
      return NextResponse.redirect(abs(`${returnTo}&paid=0&err=user_cancelled`, req));
    }

    // mock یا واقعی
    let verify: VerifyResult = { ok: true };
    if (!authority.startsWith("mock-")) {
      const amountRial = Number(payRow.amount_rial ?? 0);
      verify = await verifyWithZarinpal(authority, amountRial);
    }

    if (!verify.ok) {
      await supabase.from("payments").update({ status: "failed" }).eq("id", payRow.id).neq("status", "paid");
      return NextResponse.redirect(abs(`${returnTo}&paid=0&err=${encodeURIComponent((verify as any).error)}`, req));
    }

    const fulfilled = await fulfillPayment(
      supabase,
      { id: payRow.id, user_id: payRow.user_id, plan_id: effectivePlan, status: payRow.status },
      "refId" in verify ? verify.refId ?? null : null,
    );

    if (!fulfilled.ok) {
      return NextResponse.redirect(abs(`${returnTo}&paid=0&err=${encodeURIComponent(fulfilled.error)}`, req));
    }

    return NextResponse.redirect(abs(`${returnTo}&paid=1`, req));
  } catch (err: any) {
    const m = typeof err?.message === "string" ? err.message : "verify_unhandled_error";
    return NextResponse.redirect(abs(`/dashboard/billing?paid=0&err=${encodeURIComponent(m)}`, req));
  }
}
