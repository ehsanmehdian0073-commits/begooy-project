export default function AnalyticsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Analytics</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border p-4">DAU (Mock): 0</div>
        <div className="rounded-2xl border p-4">Messages/Day (Avg): 0</div>
        <div className="rounded-2xl border p-4">CSAT (Mock): —</div>
      </div>
      <div className="rounded-2xl border p-6 text-sm text-neutral-500">
        چارت‌ها بعداً به دیتا وصل می‌شن.
      </div>
    </div>
  );
}
