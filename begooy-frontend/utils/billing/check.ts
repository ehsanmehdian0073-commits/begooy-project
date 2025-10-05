// utils/billing/check.ts
import { createClientForAction } from "@/utils/supabase/server";
import { createClientReadOnly } from "@/utils/supabase/server";

export type LimitKey = "messagesPerDay" | "channels" | "bots" | "storageMB";

type Limits = {
  messagesPerDay: number;
  channels: number;
  bots: number;
  storageMB: number;
};

type Usage = {
  todayMessages: number;
  connectedChannels: number;
  botsCount: number;
  storageUsedMB: number;
};

type PlanRow = {
  id: string;
  limits: Partial<Limits> | null;
  price?: number;
  period?: string;
};

// مقدار current و حداکثر را برای یک کلید برمی‌گردانیم
function pick(usage: Usage, limits: Limits, key: LimitKey) {
  const current =
    key === "messagesPerDay" ? usage.todayMessages :
    key === "channels"      ? usage.connectedChannels :
    key === "bots"          ? usage.botsCount :
                               usage.storageUsedMB;

  const max = limits[key] ?? 0;
  return { current, max };
}

// خواندن پلن/استفادهٔ فعلی (نسخهٔ read-only برای Server Components)
export async function getCurrentPlanAndUsageRO() {
  const supabase = await createClientReadOnly();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, planId: "free", usage: null as any, limits: null as any };

  // از ویو فعلی بخوان
  const { data: view } = await supabase
    .from("v_current_subscription")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const planId = view?.plan_id ?? "free";

  // محدودیت‌ها از جدول plans
  const { data: planRow } = await supabase
    .from("plans")
    .select("id, limits, price, period")
    .eq("id", planId)
    .maybeSingle<PlanRow>();

  const limits: Limits = {
    messagesPerDay: Number((planRow?.limits as any)?.messagesPerDay ?? (planRow?.limits as any)?.messages_per_day ?? 0),
    channels:       Number((planRow?.limits as any)?.channels ?? (planRow?.limits as any)?.max_channels ?? 0),
    bots:           Number((planRow?.limits as any)?.bots ?? (planRow?.limits as any)?.max_bots ?? 0),
    storageMB:      Number((planRow?.limits as any)?.storageMB ?? (planRow?.limits as any)?.storage_mb ?? 0),
  };

  const usage: Usage = {
    todayMessages: Number(view?.messages_today ?? 0),
    connectedChannels: Number(view?.connected_channels ?? 0),
    botsCount: Number(view?.bots_count ?? 0),
    storageUsedMB: Number(view?.storage_used_mb ?? 0),
  };

  return { user, planId, usage, limits };
}

// نسخهٔ اکشن/روت (اجرا روی سرور اکشن‌ها/route handlers)
export async function canUse(need: { key: LimitKey; inc?: number }) {
  const supabase = await createClientForAction();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "unauthorized", message: "ابتدا وارد شوید." };

  // از ویو بخوان
  const { data: view } = await supabase
    .from("v_current_subscription")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const planId = view?.plan_id ?? "free";
  const { data: planRow } = await supabase
    .from("plans")
    .select("id, limits")
    .eq("id", planId)
    .maybeSingle<PlanRow>();

  const limits: Limits = {
    messagesPerDay: Number((planRow?.limits as any)?.messagesPerDay ?? (planRow?.limits as any)?.messages_per_day ?? 0),
    channels:       Number((planRow?.limits as any)?.channels ?? (planRow?.limits as any)?.max_channels ?? 0),
    bots:           Number((planRow?.limits as any)?.bots ?? (planRow?.limits as any)?.max_bots ?? 0),
    storageMB:      Number((planRow?.limits as any)?.storageMB ?? (planRow?.limits as any)?.storage_mb ?? 0),
  };

  const usage: Usage = {
    todayMessages: Number(view?.messages_today ?? 0),
    connectedChannels: Number(view?.connected_channels ?? 0),
    botsCount: Number(view?.bots_count ?? 0),
    storageUsedMB: Number(view?.storage_used_mb ?? 0),
  };

  const inc = Math.max(1, Number(need.inc ?? 1));
  const { current, max } = pick(usage, limits, need.key);
  if (max === 0) {
    return { ok: false, code: "not_allowed", message: "این قابلیت در پلن شما فعال نیست." };
  }
  if (current + inc > max) {
    return {
      ok: false,
      code: "quota_exceeded",
      message: `سقف ${need.key} شما پر شده است. (${current}/${max})`,
      meta: { current, max, key: need.key },
    };
  }

  return { ok: true, user, planId, usage, limits };
}
