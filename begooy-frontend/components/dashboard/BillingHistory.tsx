"use client";

import { useEffect, useMemo, useState } from "react";
import { tokens } from "@/components/ui/tokens";
import { toast } from "sonner";

// نوع رکورد پرداخت که از API برمی‌گرده
type Payment = {
  id: string;
  plan_id: string;
  amount_toman: number | null;
  amount_rial: number | null;
  gateway: "mock" | "zarinpal" | string | null;
  status: "pending" | "paid" | "failed" | "canceled" | string;
  ref_id?: string | null;
  authority?: string | null;
  created_at?: string | null;
};

export default function BillingHistory() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Payment[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<"retry" | "cancel" | null>(null);

  // --- Helpers UI
  const fmtDate = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString("fa-IR") : "—";

  const fmtAmount = (p: Payment) => {
    const t = Number(p.amount_toman ?? 0);
    if (t > 0) return `${t.toLocaleString("fa-IR")} تومان`;
    const r = Number(p.amount_rial ?? 0);
    return r > 0 ? `${r.toLocaleString("fa-IR")} ریال` : "—";
  };

  const statusChip = (s: string) => {
    const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs";
    if (s === "paid")
      return <span className={`${base} bg-emerald-100 text-emerald-700`}>پرداخت‌شده</span>;
    if (s === "pending")
      return <span className={`${base} bg-amber-100 text-amber-700`}>در انتظار</span>;
    if (s === "canceled")
      return <span className={`${base} bg-slate-100 text-slate-700`}>لغوشده</span>;
    return <span className={`${base} bg-rose-100 text-rose-700`}>ناموفق</span>;
  };

  // --- Fetch
  async function refetch() {
    try {
      const res = await fetch("/api/billing/history", { cache: "no-store" });
      const json = await res.json();
      if (json?.ok && Array.isArray(json.items)) setItems(json.items);
      else toast.error("دریافت تاریخچه پرداخت‌ها ناموفق بود");
    } catch {
      toast.error("خطا در ارتباط با سرور");
    }
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await refetch();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const pendingCount = useMemo(
    () => items.filter(i => i.status === "pending").length,
    [items]
  );

  // --- Retry Verify
  async function onRetry(p: Payment) {
    const tid = toast.loading("در حال بررسی پرداخت…");
    try {
      setLoadingId(p.id); setLoadingAction("retry");
      const r = await fetch("/api/billing/reverify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id }),
      });
      const j = await r.json();

      if (j?.ok && j.paid) {
        toast.success("پرداخت تایید شد ✅");
        const plan = encodeURIComponent(j.plan || p.plan_id);
        window.location.href = `/dashboard/billing?plan=${plan}&paid=1`;
        return;
      }

      toast.error(`ناموفق: ${j?.error || "verify_failed"}`);
      await refetch();
    } catch {
      toast.error("خطای شبکه در تلاش مجدد");
    } finally {
      toast.dismiss(tid);
      setLoadingId(null); setLoadingAction(null);
    }
  }

  // --- Cancel single pending
  async function onCancel(p: Payment) {
    toast("لغو این پرداخت معلق انجام شود؟", {
      action: {
        label: "بله، لغو کن",
        onClick: async () => {
          const tid = toast.loading("در حال لغو…");
          try {
            setLoadingId(p.id); setLoadingAction("cancel");
            const r = await fetch("/api/billing/pending", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: p.id }),
            });
            const j = await r.json();
            if (j?.ok) {
              toast.success("پرداخت معلق حذف شد");
              await refetch();
            } else {
              toast.error(j?.error || "لغو ناموفق بود");
            }
          } catch {
            toast.error("خطا در لغو پرداخت");
          } finally {
            toast.dismiss(tid);
            setLoadingId(null); setLoadingAction(null);
          }
        },
      },
      cancel: { label: "انصراف", onClick: () => toast.dismiss() },
      duration: 8000,
    });
  }

  // --- Cancel all pending
  async function onCancelAll() {
    toast("همهٔ پرداخت‌های در انتظار حذف شوند؟", {
      action: {
        label: "بله، همه را حذف کن",
        onClick: async () => {
          const tid = toast.loading("در حال حذف همه…");
          try {
            const r = await fetch("/api/billing/pending", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ all: true }),
            });
            const j = await r.json();
            if (j?.ok) {
              toast.success("تمام پرداخت‌های در انتظار حذف شدند");
              await refetch();
            } else {
              toast.error(j?.error || "حذف همه ناموفق بود");
            }
          } catch {
            toast.error("خطا در حذف گروهی");
          } finally {
            toast.dismiss(tid);
          }
        },
      },
      cancel: { label: "انصراف", onClick: () => toast.dismiss() },
      duration: 8000,
    });
  }

  // --- Render
  if (loading) {
    return (
      <div className={`${tokens.card} ${tokens.surface} p-4`}>
        <div className="animate-pulse space-y-2">
          <div className="h-5 w-28 rounded bg-slate-200" />
          <div className="h-8 w-full rounded bg-slate-100" />
          <div className="h-8 w-full rounded bg-slate-100" />
          <div className="h-8 w-full rounded bg-slate-100" />
        </div>
      </div>
    );
  }

  return (
    <div className={`${tokens.card} ${tokens.surface} p-4`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">تاریخچه پرداخت‌ها</div>
        {pendingCount > 0 && (
          <button
            onClick={onCancelAll}
            className="rounded-lg bg-rose-100 text-rose-700 px-3 py-1 text-xs hover:bg-rose-200"
            title="حذف همهٔ پرداخت‌های در انتظار"
          >
            حذف همهٔ در انتظار ({pendingCount})
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-xs text-slate-500">پرداختی ثبت نشده است.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr className="[&>th]:py-2 [&>th]:px-2">
                <th>تاریخ</th>
                <th>پلن</th>
                <th>مبلغ</th>
                <th>درگاه</th>
                <th>وضعیت</th>
                <th>Ref / Authority</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody className="[&>tr>td]:py-2 [&>tr>td]:px-2">
              {items.map((p) => {
                const isRetrying = loadingId === p.id && loadingAction === "retry";
                const isCancelling = loadingId === p.id && loadingAction === "cancel";
                return (
                  <tr
                    key={p.id}
                    className="border-t border-slate-100/60 dark:border-neutral-800/60"
                  >
                    <td>{fmtDate(p.created_at)}</td>
                    <td className="font-medium">{p.plan_id}</td>
                    <td>{fmtAmount(p)}</td>
                    <td>{p.gateway || "—"}</td>
                    <td>{statusChip(p.status)}</td>
                    <td className="text-xs">
                      {p.ref_id ? (
                        <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-neutral-800">
                          {p.ref_id}
                        </code>
                      ) : p.authority ? (
                        <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-neutral-800">
                          {p.authority}
                        </code>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="flex items-center gap-2">
                      {p.status === "pending" ? (
                        <>
                          <button
                            onClick={() => onRetry(p)}
                            disabled={isRetrying || isCancelling}
                            className="rounded-lg bg-indigo-600 text-white px-3 py-1 text-xs hover:bg-indigo-700 disabled:opacity-60"
                            title="تلاش مجدد وریفای"
                          >
                            {isRetrying ? "درحال بررسی..." : "تلاش مجدد"}
                          </button>
                          <button
                            onClick={() => onCancel(p)}
                            disabled={isRetrying || isCancelling}
                            className="rounded-lg bg-rose-600 text-white px-3 py-1 text-xs hover:bg-rose-700 disabled:opacity-60"
                            title="لغو / حذف پرداخت معلق"
                          >
                            {isCancelling ? "درحال لغو..." : "لغو"}
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
