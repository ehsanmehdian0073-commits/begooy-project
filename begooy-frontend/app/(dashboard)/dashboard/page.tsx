export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border p-4">Active Bots: <strong>0</strong></div>
        <div className="rounded-2xl border p-4">Open Conversations: <strong>0</strong></div>
        <div className="rounded-2xl border p-4">Today’s Messages: <strong>0</strong></div>
      </div>
      <div className="rounded-2xl border p-6">
        <div className="mb-2 text-sm text-neutral-500">Quick Tips</div>
        <ul className="list-disc pl-6 text-sm leading-7">
          <li>از <span className="text-orange-600">Bot Studio</span> یک بات جدید بساز.</li>
          <li>در <span className="text-orange-600">CRM</span> کانال‌ها رو وصل کن.</li>
          <li>در <span className="text-orange-600">Analytics</span> شاخص‌ها رو ببین.</li>
          <li>پلن رو در <span className="text-orange-600">Subscription</span> ارتقا بده.</li>
        </ul>
      </div>
    </div>
  );
}
