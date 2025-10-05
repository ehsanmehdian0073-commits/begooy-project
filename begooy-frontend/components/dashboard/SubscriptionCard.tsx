"use client";

import { useEffect, useMemo, useState } from "react";
import { Progress } from "@/components/ui/progress";

import { tokens } from "@/components/ui/tokens";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";

// ───────────────────────────────── Types
type Limits = {
  messagesPerDay: number;
  channels: number;
  bots: number;
  storageMB: number;
};

type Plan = {
  id: string;
  name: string;
  price: number;
  currency?: string;
  period?: string;
  limits: Limits;
};

type Usage = {
  todayMessages: number;
  connectedChannels: number;
  botsCount: number;
  storageUsedMB: number;
};

type Subscription = {
  planId: string;
  status: "active" | "past_due" | "canceled" | "trial" | "expired" | "no-subscription";
  startedAt: string;
  endsAt: string | null;
};

// رنگ متن کنار Progress بر اساس آستانه
function usageTone(pct: number) {
  if (pct >= 90) return "text-red-600";
  if (pct >= 75) return "text-amber-600";
  return "text-emerald-600";
}

// ───────────────────────────────── Component
export default function SubscriptionCard() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);

  const qp = useSearchParams();
  const router = useRouter();

  // بعد از برگشت از verify → toast + پاک کردن QueryString
  useEffect(() => {
    const paid = qp.get("paid");
    const err = qp.get("err");
    if (!paid && !err) return;

    if (paid === "1") {
      toast.success("پرداخت موفق بود و اشتراک فعال شد ✅");
    } else {
      toast.error(`پرداخت ناموفق${err ? `: ${decodeURIComponent(err)}` : ""}`);
    }

    router.replace("/dashboard/billing");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qp]);

  // بارگذاری اولیه
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/billing", { cache: "no-store" });
        const data = await res.json();
        if (!alive) return;

        // 1) Plans
        setPlans(Array.isArray(data.plans) ? data.plans : []);

        // 2) Subscription fallback
        const sub: Subscription | null =
          data.subscription ??
          (data.plan
            ? {
                planId: String(data.plan.id ?? data.plan),
                status: data.plan.status ?? "active",
                startedAt: data.plan.startedAt ?? "",
                endsAt: data.plan.endsAt ?? null,
              }
            : null);

        setSubscription(sub);

        // 3) Usage fallback
        const u = data.usage ?? data.plan?.usage;
        setUsage(
          u ?? {
            todayMessages: 0,
            connectedChannels: 0,
            botsCount: 0,
            storageUsedMB: 0,
          }
        );
      } catch {
        setPlans([]);
        setSubscription(null);
        setUsage({
          todayMessages: 0,
          connectedChannels: 0,
          botsCount: 0,
          storageUsedMB: 0,
        });
        toast.error("خطا در بارگذاری اطلاعات اشتراک");
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // اگر subscription نداریم، روی free می‌افتیم
  const currentPlan = useMemo(() => {
    if (!plans.length) return null;
    if (subscription?.planId) {
      return plans.find((p) => p.id === subscription.planId) || null;
    }
    return plans.find((p) => p.id === "free") || null;
  }, [plans, subscription]);

  const pct = (used: number, max: number) => {
    const d = Math.max(0, Number(used) || 0);
    const m = Math.max(1, Number(max) || 1);
    const value = Math.round((d / m) * 100);
    return Math.max(0, Math.min(100, value));
  };

  async function onUpgradeClick(targetPlanId: string) {
    try {
      setActionLoading(true);
      setPendingPlanId(targetPlanId);

      const tid = toast.loading("در حال آماده‌سازی پرداخت…");
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: targetPlanId }),
      });
      const data = await res.json();
      toast.dismiss(tid);

      if (!res.ok || data?.ok === false) {
        const msg = data?.error || "اشکال در ایجاد checkout";
        toast.error(msg);
        return;
      }

      if (data.redirectUrl) {
        toast.info("در حال هدایت…");
        window.location.href = data.redirectUrl; // mock یا gateway
        return;
      }

      if (data.authority) {
        toast.success(`Authority: ${data.authority}`);
        return;
      }

      toast.error("پاسخ نامعتبر از سرور دریافت شد.");
    } catch {
      toast.error("اشکال در ایجاد checkout");
    } finally {
      setActionLoading(false);
      setPendingPlanId(null);
    }
  }

  // ───────────── Render
  if (loading) {
    return (
      <div className={`${tokens.card} ${tokens.surface} p-6`}>
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-24 rounded bg-slate-200" />
          <div className="h-7 w-36 rounded bg-slate-200" />
          <div className="h-4 w-20 rounded bg-slate-200" />
          <div className="grid gap-3 md:grid-cols-2 pt-4">
            <div className="h-16 rounded-xl bg-slate-100" />
            <div className="h-16 rounded-xl bg-slate-100" />
            <div className="h-16 rounded-xl bg-slate-100" />
            <div className="h-16 rounded-xl bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  if (!currentPlan || !usage) {
    return (
      <div className={`${tokens.card} ${tokens.surface} p-6`}>
        <div className="text-sm text-slate-600">
          نتوانستیم اطلاعات پلن را بارگذاری کنیم.
        </div>
        <div className="mt-4">
          <button
            onClick={() => onUpgradeClick("pro")}
            className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-white text-sm hover:bg-indigo-700"
          >
            تست ارتقا به Pro (موقت)
          </button>
        </div>
      </div>
    );
  }

  const statusText = subscription?.status ?? "no-subscription";

  const p1 = pct(usage.todayMessages, currentPlan.limits.messagesPerDay);
  const p2 = pct(usage.connectedChannels, currentPlan.limits.channels);
  const p3 = pct(usage.botsCount, currentPlan.limits.bots);
  const p4 = pct(usage.storageUsedMB, currentPlan.limits.storageMB);

  return (
    <div className={`${tokens.card} ${tokens.surface} p-6`}>
      {/* هدر + دکمه‌ها */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="space-y-1">
          <div className="text-sm text-slate-500">پلن فعال</div>
          <div className="flex items-center gap-2">
            <div className="text-lg font-medium">{currentPlan.name}</div>
            <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[11px]">
              پلن فعلی
            </span>
          </div>
          <div className="text-xs text-slate-500">
            قیمت:{" "}
            {currentPlan.price
              ? `${currentPlan.price.toLocaleString("fa-IR")} تومان`
              : "رایگان"}
          </div>
          <div className="text-[11px] text-slate-500">وضعیت: {statusText}</div>
        </div>

        <div className="flex flex-wrap gap-8 border rounded-lg p-3 bg-white/70 dark:bg-neutral-900/50">
          {plans && plans.length > 0 ? (
            plans
              .filter((p) => p.id !== currentPlan.id)
              .map((p) => (
                <button
                  key={p.id}
                  disabled={actionLoading}
                  className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
                  onClick={() => onUpgradeClick(p.id)}
                  title={
                    actionLoading && pendingPlanId === p.id
                      ? "در حال آماده‌سازی…"
                      : `ارتقا به ${p.name}`
                  }
                >
                  {actionLoading && pendingPlanId === p.id
                    ? "در حال آماده‌سازی…"
                    : `ارتقا به ${p.name}`}
                </button>
              ))
          ) : (
            <span className="text-xs text-slate-500">هیچ پلنی لود نشده.</span>
          )}

          {/* دکمه تست همیشه‌نمایش */}
          <button
            onClick={() => onUpgradeClick("pro")}
            className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-white text-sm hover:bg-indigo-700"
            title="دکمه تست موقت"
          >
            تست ارتقا به Pro (موقت)
          </button>
        </div>
      </div>

      {/* Usage */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className={`${tokens.card} p-4`}>
          <div className="mb-1 flex justify-between text-sm">
            <span>پیام‌های امروز</span>
            <span className={usageTone(p1)}>
              {usage.todayMessages} / {currentPlan.limits.messagesPerDay} ({p1}%)
            </span>
          </div>
          <Progress value={p1} />
        </div>

        <div className={`${tokens.card} p-4`}>
          <div className="mb-1 flex justify-between text-sm">
            <span>کانال‌های متصل</span>
            <span className={usageTone(p2)}>
              {usage.connectedChannels} / {currentPlan.limits.channels} ({p2}%)
            </span>
          </div>
          <Progress value={p2} />
        </div>

        <div className={`${tokens.card} p-4`}>
          <div className="mb-1 flex justify-between text-sm">
            <span>تعداد بات‌ها</span>
            <span className={usageTone(p3)}>
              {usage.botsCount} / {currentPlan.limits.bots} ({p3}%)
            </span>
          </div>
          <Progress value={p3} />
        </div>

        <div className={`${tokens.card} p-4`}>
          <div className="mb-1 flex justify-between text-sm">
            <span>فضای استفاده‌شده</span>
            <span className={usageTone(p4)}>
              {usage.storageUsedMB} / {currentPlan.limits.storageMB} MB ({p4}%)
            </span>
          </div>
          <Progress value={p4} />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-dashed p-4 text-sm text-slate-600">
        <span className="me-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
          پیشنهادی
        </span>
        اگر رشد کردی، پلن <strong>Pro</strong> بهترین توازن امکانات/قیمت را دارد.
      </div>
    </div>
  );
}
