// app/(dashboard)/inbox/page.tsx
import InboxClient from "./_client";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// فقط برای read اولیه در سرور
const sb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function fetchInitial(limit = 200) {
  const { data, error } = await sb
    .from("conversations")
    .select(`
      id, channel, session_id, user_id, message_text, attachments,
      delivery_status, external_ref, created_at, profile_name, direction,
      is_read, is_resolved, needs_human, priority
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export default async function Page() {
  const initial = await fetchInitial();

  return (
    <div className="p-4 md:p-6" dir="rtl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg md:text-xl font-bold">📨 مرکز پیام‌ها</h2>
      </div>
      <InboxClient initialItems={initial as any} />
    </div>
  );
}
