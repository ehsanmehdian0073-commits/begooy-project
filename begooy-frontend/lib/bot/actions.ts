// lib/bot/actions.ts
import { EngineDeps, EventPayload } from "./types";
import { setTimeout as delay } from "timers/promises";

/* -------------------------- Tiny Template Engine -------------------------- */
/** گرفتن مقدار از مسیر نقطه‌ای: e.g. get(ctx, "user.name") */
function getByPath(obj: any, path: string) {
  try {
    return path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
  } catch {
    return undefined;
  }
}

/** رندر ساده‌ی {{path}} با fallback به خالی-string */
function renderTemplate(tmpl: string, context: Record<string, any>) {
  if (!tmpl) return "";
  return tmpl.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, p1) => {
    const key = String(p1 || "").trim();
    const val =
      getByPath(context, key) ??
      getByPath(context, key.replace(/^evt\./, "")) ?? // اجازه بده {{evt.text}} یا {{text}} هر دو کار کنند
      "";
    return (val == null ? "" : String(val));
  });
}

/* ------------------------------- Send Message ----------------------------- */
export async function act_send_message(deps: EngineDeps, evt: EventPayload, cfg: any) {
  // کانال: اگر use_same_channel=true بود از evt.channel استفاده کن
  const useSame = !!cfg?.use_same_channel;
  const channel = useSame ? evt.channel : (cfg?.channel || evt.channel);

  // Context برای تمپلیت
  const ctx = {
    ...evt,                 // دسترسی به evt.text, evt.channel, evt.external_ref, evt.profile_name, evt.ctx, ...
    ctx: (evt as any).ctx || {},
    answer: (evt as any).ctx?.answer, // میان‌بر: {{answer}}
  };

  // اولویت متن:
  // 1) textTemplate (از Bot Studio)
  // 2) cfg.text (قدیمی)
  // 3) evt.text (fallback)
  let text: string = "";
  if (cfg?.textTemplate) {
    text = renderTemplate(String(cfg.textTemplate), ctx);
  } else if (cfg?.text) {
    text = renderTemplate(String(cfg.text), ctx);
  } else {
    text = String(evt.text || "");
  }

  // optional: prepend/append در کانفیگ (کیس‌های خاص)
  if (cfg?.prepend) text = String(cfg.prepend) + text;
  if (cfg?.append) text = text + String(cfg.append);

  await deps.sendOnChannel({
    channel,
    toExternalRef: evt.external_ref,
    session_id: evt.session_id,
    text,
  });
}

/* --------------------------------- Add Tag -------------------------------- */
export async function act_add_tag(deps: EngineDeps, evt: EventPayload, cfg: any) {
  if (!evt.external_ref) return; // نیاز به شناسه مشتری
  const tags: string[] = Array.isArray(cfg?.tags) ? cfg.tags : [cfg?.tag || "untitled"];
  for (const t of tags.filter(Boolean)) {
    await deps.addCustomerTag(evt.external_ref, t);
  }
}

/* ------------------------------- Create Note ------------------------------ */
export async function act_create_note(deps: EngineDeps, evt: EventPayload, cfg: any) {
  const bodyRaw: string = cfg?.body || "(empty)";
  const body = renderTemplate(String(bodyRaw), {
    ...evt,
    ctx: (evt as any).ctx || {},
  });
  if (!evt.external_ref) return;
  await deps.createCustomerNote(evt.external_ref, body, "bot");
}

/* ----------------------------------- Delay -------------------------------- */
export async function act_delay_ms(ms: number) {
  await delay(Math.max(0, Number(ms || 0)));
}

/* -------------------------------- Webhook --------------------------------- */
export async function act_call_webhook(
  deps: EngineDeps,
  url: string,
  body: any,
  headers?: Record<string, string>
) {
  if (!deps.httpPostJSON || !url) return;
  await deps.httpPostJSON(url, body, headers);
}
