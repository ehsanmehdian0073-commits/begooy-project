import SubscriptionCard from "@/components/dashboard/SubscriptionCard";
import BillingHistory from "@/components/dashboard/BillingHistory";
import { tokens } from "@/components/ui/tokens";
import { Suspense } from "react";

export default function BillingPage() {
  return (
    <div className="space-y-4">
      <h1 className={`text-2xl ${tokens.heading}`}>Subscription</h1>

      <Suspense
        fallback={
          <div className={`${tokens.card} ${tokens.surface} p-6 animate-pulse`}>
            <div className="h-5 w-24 rounded bg-slate-200 mb-2" />
            <div className="h-7 w-36 rounded bg-slate-200 mb-4" />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="h-16 rounded-xl bg-slate-100" />
              <div className="h-16 rounded-xl bg-slate-100" />
              <div className="h-16 rounded-xl bg-slate-100" />
              <div className="h-16 rounded-xl bg-slate-100" />
            </div>
          </div>
        }
      >
        <SubscriptionCard />
      </Suspense>

      <Suspense
        fallback={
          <div className={`${tokens.card} ${tokens.surface} p-4 animate-pulse`}>
            <div className="h-5 w-28 rounded bg-slate-200 mb-2" />
            <div className="h-8 w-full rounded bg-slate-100" />
          </div>
        }
      >
        <BillingHistory />
      </Suspense>
    </div>
  );
}
