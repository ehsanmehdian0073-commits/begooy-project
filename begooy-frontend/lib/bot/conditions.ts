// lib/bot/conditions.ts
import { EventPayload } from "./types";

/* --------------------------- Text Normalization --------------------------- */
/** نرمال‌سازی سادهٔ فارسی/عربی + حذف اعراب و نیم‌فاصله برای مقایسهٔ بهتر */
function normalizeFa(text: string): string {
  if (!text) return "";
  let t = text.normalize("NFC");
  // ی/ي و ک/ك
  t = t.replace(/ي/g, "ی").replace(/ك/g, "ک");
  // حذف اعراب و نشانه‌ها
  t = t.replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06ED]/g, "");
  // حذف نیم‌فاصله و فاصله‌های عجیب
  t = t.replace(/[\u200c\u200d\u200e\u200f]/g, "");
  // یکدست‌سازی فاصله
  t = t.replace(/\s+/g, " ").trim();
  return t.toLowerCase();
}

/* ------------------------------- contains_any ----------------------------- */
export function cond_contains_any(text: string, keywords: string[] = []): boolean {
  const t = normalizeFa(String(text || ""));
  for (const k of keywords || []) {
    const kk = normalizeFa(String(k || ""));
    if (!kk) continue;
    if (t.includes(kk)) return true;
  }
  return false;
}

/* ---------------------------------- regex -------------------------------- */
export function cond_regex(text: string, pattern: string, flags = "i"): boolean {
  try {
    // نرمال‌سازی ورودی تا regexهای فارسی پایدارتر شوند
    const src = String(pattern || "");
    const t = String(text || "");
    const re = new RegExp(src, flags || "i");
    return re.test(t);
  } catch {
    return false;
  }
}

/* ------------------------------- time_window ------------------------------ */
type TimeWindowCfg = {
  timezone?: string;   // e.g. "Asia/Tehran"
  start: string;       // "09:00"
  end: string;         // "18:00"
  weekdays?: number[]; // 1..7 (Mon..Sun)
  invert?: boolean;    // اگر true باشد، خارج از بازه را قبول می‌کند
};

/** گرفتن تاریخ/زمان محلی برای یک timezone بدون وابستگی خارجی */
function getZonedParts(d: Date, timeZone: string) {
  // از Intl.DateTimeFormat برای استخراج ساعت/دقیقه/روز هفته در timezone استفاده می‌کنیم
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(d);
  const get = (tp: string) => parts.find((p) => p.type === tp)?.value ?? "";
  const hour = Number(get("hour") || "0");
  const minute = Number(get("minute") || "0");
  // weekday: Mon..Sun → 1..7
  const wdStr = get("weekday"); // e.g. "Mon"
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const weekday = map[wdStr as keyof typeof map] || 1;
  return { hour, minute, weekday };
}

export function cond_time_window(now: Date, cfg: TimeWindowCfg): boolean {
  const tz = cfg.timezone || "UTC";
  const { hour, minute, weekday } = getZonedParts(now, tz);

  const [sh, sm] = String(cfg.start || "09:00").split(":").map((n) => Number(n || 0));
  const [eh, em] = String(cfg.end || "18:00").split(":").map((n) => Number(n || 0));

  const curMin = hour * 60 + minute;
  const startMin = (isFinite(sh) ? sh : 9) * 60 + (isFinite(sm) ? sm : 0);
  const endMin = (isFinite(eh) ? eh : 18) * 60 + (isFinite(em) ? em : 0);

  // پشتیبانی از بازه‌های شبانه (مثلاً 22:00 تا 06:00 فردا)
  let inWindow: boolean;
  if (endMin >= startMin) {
    inWindow = curMin >= startMin && curMin <= endMin;
  } else {
    // overnight: داخل بازه اگر (cur >= start) یا (cur <= end)
    inWindow = curMin >= startMin || curMin <= endMin;
  }

  // weekday check
  if (cfg.weekdays && cfg.weekdays.length) {
    if (!cfg.weekdays.includes(weekday)) inWindow = false;
  }

  return cfg.invert ? !inWindow : inWindow;
}

/* --------------------------- trigger: message.received -------------------- */
type TriggerCfg = {
  direction?: "inbound" | "outbound";
  channels?: string[];       // ["telegram","webchat",...]
  channel?: string;          // پشتیبانی از مقدار تکی
  textIncludes?: string[];   // محدودسازی اولیه روی متن
  textRegex?: { pattern: string; flags?: string }; // محدودسازی regex روی متن
};

export function matches_trigger_message_received(evt: EventPayload, cfg: TriggerCfg = {}): boolean {
  if (evt.event !== "message.received") return false;
  if (cfg.direction && cfg.direction !== "inbound") return false; // فعلاً ورودی

  // channel / channels
  if (Array.isArray(cfg.channels) && cfg.channels.length) {
    if (!cfg.channels.includes(evt.channel)) return false;
  } else if (cfg.channel) {
    if (cfg.channel !== evt.channel) return false;
  }

  // textIncludes (اختیاری)
  if (Array.isArray(cfg.textIncludes) && cfg.textIncludes.length) {
    if (!cond_contains_any(evt.text || "", cfg.textIncludes)) return false;
  }

  // textRegex (اختیاری)
  if (cfg.textRegex?.pattern) {
    if (!cond_regex(evt.text || "", cfg.textRegex.pattern, cfg.textRegex.flags || "i")) return false;
  }

  return true;
}
