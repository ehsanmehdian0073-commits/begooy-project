// app/api/billing/route.ts
import { NextResponse } from "next/server";
import { createClientForAction } from "@/utils/supabase/server"; // ⬅️ تغییر مهم

// ─────────────────────────────── Helpers
function extractLimits(p: any) {
  const lim = p?.limits || {};
  const fromJson = {
    messagesPerDay: lim.messagesPerDay ?? lim.messages_per_day ?? lim.messages ?? null,
    channels:      lim.channels ?? lim.max_channels ?? null,
    bots:          lim.bots ?? lim.max_bots ?? null,
    storageMB:     lim.storageMB ?? lim.storage_mb ?? lim.storage ?? null,
  };
  const fromColumns = {
    messagesPerDay: p?.messages_per_day ?? p?.messagesPerDay ?? null,
    channels:       p?.max_channels ?? p?.channels ?? null,
    bots:           p?.max_bots ?? p?.bots ?? null,
    storageMB:      p?.storage_mb ?? p?.storageMB ?? null,
  };
  return {
    messagesPerDay: fromJson.messagesPerDay ?? fromColumns.messagesPerDay ?? 0,
    channels:       fromJson.channels ?? fromColumns.channels ?? 0,
    bots:           fromJson.bots ?? fromColumns.bots ?? 0,
    storageMB:      fromJson.storageMB ?? fromColumns.storageMB ?? 0,
  };
}

function mapPlanRow(p: any) {
  const limits = extractLimits(p);
  return {
    id: p.id,
    name: p.name ?? p.title ?? p.id,
    price: Number(p.price ?? 0),
    period: p.period ?? "monthly",
    limits,
  };
}

// ─────────────────────────────── GET
export async function GET() {
  const supabase = await createClientForAction(); // ⬅️ بدون await
  const { data: { user } } = await supabase.auth.getUser();

  const { data: allPlans, error: plansErr } = await supabase
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (plansErr) console.error("[plansErr]", plansErr);
  const plans = (allPlans ?? []).map(mapPlanRow);

  if (!user) return NextResponse.json({ plan: null, plans });

  const { data: vrow, error: viewErr } = await supabase
    .from("v_current_subscription")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (viewErr) console.error("[viewErr]", viewErr);
  if (!vrow) return NextResponse.json({ plan: null, plans });

  const currentPlanRow = (allPlans ?? []).find((p) => p.id === vrow.plan_id);
  const currentPlan = currentPlanRow
    ? mapPlanRow(currentPlanRow)
    : {
        id: vrow.plan_id,
        name: vrow.plan_id,
        price: 0,
        period: "monthly",
        limits: { messagesPerDay: 0, channels: 0, bots: 0, storageMB: 0 },
      };

  const usage = {
    todayMessages: vrow.messages_today ?? 0,
    connectedChannels: vrow.connected_channels ?? 0,
    botsCount: vrow.bots_count ?? 0,
    storageUsedMB: vrow.storage_used_mb ?? 0,
  };

  const plan = {
    ...currentPlan,
    status: vrow.status ?? "active",
    startedAt: vrow.started_at ?? null,
    endsAt: vrow.ends_at ?? null,
    usage,
  };

  return NextResponse.json({ plan, plans });
}

// ─────────────────────────────── POST
/**
 * POST → شروع Checkout
 * هم در حالت mock رکورد می‌سازه، هم درگاه واقعی اگر ENV آماده باشه
 */
export async function POST(req: Request) {
  const { planId } = await req.json().catch(() => ({}));
  if (!planId) {
    return NextResponse.json({ ok: false, error: "planId is required" }, { status: 400 });
  }

  const supabase = await createClientForAction(); // ⬅️ بدون await
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 1) plan معتبر؟
  const { data: planRow, error: planErr } = await supabase
    .from("plans")
    .select("id, price, name")
    .eq("id", planId)
    .eq("is_active", true)
    .maybeSingle();

  if (planErr) console.error("[planErr]", planErr);
  if (!planRow) {
    return NextResponse.json({ ok: false, error: "invalid planId" }, { status: 400 });
  }

  // 2) مبالغ و ENV
  const amountToman = Number(planRow.price ?? 0);
  const amountRial = Math.max(1000, Math.round(amountToman * 10));
  const MERCHANT_ID = process.env.ZARINPAL_MERCHANT_ID?.trim();
  const IS_SANDBOX = String(process.env.ZARINPAL_SANDBOX ?? "true") === "true";
  const APP_BASE_URL = process.env.APP_BASE_URL?.trim() || "http://localhost:3000";
  const hasGateway = Boolean(MERCHANT_ID && APP_BASE_URL);
  const base = IS_SANDBOX
    ? "https://sandbox.zarinpal.com/pg/v4"
    : "https://api.zarinpal.com/pg/v4";

  // 3) مقادیر پیش‌فرض (Mock)
  let gatewayMode: "mock" | "zarinpal" = "mock";
  let authority = `mock-${Date.now()}`;
let redirectUrl = `/api/billing/verify?planId=${encodeURIComponent(planId)}&Authority=${authority}&Status=OK`;
  // 4) اگر درگاه آماده است
  if (hasGateway) {
    try {
      const res = await fetch(`${base}/payment/request.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchant_id: MERCHANT_ID,
          amount: amountRial,
          description: `Begooy upgrade to ${planId}`,
          callback_url: `${APP_BASE_URL}/api/billing/verify?planId=${encodeURIComponent(planId)}`,
          metadata: { email: user.email ?? undefined },
        }),
        // @ts-ignore
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({} as any));
      if (json?.data?.authority) {
        authority = json.data.authority;
        redirectUrl = IS_SANDBOX
          ? `https://sandbox.zarinpal.com/pg/StartPay/${authority}`
          : `https://www.zarinpal.com/pg/StartPay/${authority}`;
        gatewayMode = "zarinpal";
      } else {
        console.error("[zarinpal.request.error]", json);
      }
    } catch (e) {
      console.error("[zarinpal.request.catch]", e);
    }
  }

  // 5) درج رکورد pending در payments
  const { error: insErr } = await supabase
    .from("payments")
    .insert([{
      user_id: user.id,
      plan_id: planId,
      amount_toman: amountToman,
      amount_rial: amountRial,
      authority,
      gateway: gatewayMode,
      status: "pending",
    }]);

  if (insErr) {
    console.error("[payments.insert.error]", insErr);
    return NextResponse.json({ ok: false, error: "payment_record_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    mode: gatewayMode,
    authority,
    redirectUrl,
  });
}
