// app/api/webhooks/telegram/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { processAutomation } from "@/lib/bot/engine";
import type { EngineDeps } from "@/lib/bot/types";

// ─────────────────────────────────────────────────────────────────────────────
// Next.js runtime hints
export const dynamic = "force-dynamic";     // telegram calls from outside
export const runtime = "nodejs";            // need Node APIs (crypto, fetch)

// ─────────────────────────────────────────────────────────────────────────────
// ENV
const TG_TOKEN = process.env.TG_BOT_TOKEN!;
const WEBHOOK_SECRET = process.env.TG_WEBHOOK_SECRET!;
const TG_WORKFLOW_ID = process.env.TG_WORKFLOW_ID?.trim() || "";
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ─────────────────────────────────────────────────────────────────────────────
// Supabase (admin)
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Helpers
const tokenHash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

function okJson(body: any, status = 200) {
  return NextResponse.json(body, { status });
}

async function isNewUpdate(update_id: number) {
  // Table DDL (reference):
  // create table if not exists tg_updates (
  //   bot_token_hash text primary key,
  //   last_update_id bigint,
  //   updated_at timestamptz default now()
  // );
  const h = tokenHash(TG_TOKEN);
  const { data, error } = await sb
    .from("tg_updates")
    .select("last_update_id")
    .eq("bot_token_hash", h)
    .maybeSingle();

  if (error) {
    console.error("tg_updates read error:", error);
    return true; // fail-open to avoid Telegram retry loops
  }

  if (!data) {
    await sb.from("tg_updates").insert({ bot_token_hash: h, last_update_id: update_id });
    return true;
  }

  const last = Number(data.last_update_id || 0);
  if (update_id > last) {
    await sb
      .from("tg_updates")
      .update({ last_update_id: update_id, updated_at: new Date().toISOString() })
      .eq("bot_token_hash", h);
    return true;
  }
  return false;
}

function pickTextFromUpdate(u: any): { chatId?: string; text?: string; profileName?: string } {
  // message / edited_message / channel_post
  const msg =
    u?.message ||
    u?.edited_message ||
    u?.channel_post ||
    null;

  // callback_query (buttons)
  if (u?.callback_query) {
    const cq = u.callback_query;
    const chatId = cq.message?.chat?.id ? String(cq.message.chat.id) : undefined;
    const text = (cq.data || "").toString().trim();
    const profileName =
      cq.from?.first_name ||
      cq.from?.username ||
      (cq.from?.last_name ? `${cq.from?.first_name || ""} ${cq.from?.last_name}`.trim() : "") ||
      String(cq.from?.id || "");
    return { chatId, text, profileName };
  }

  if (!msg?.chat) return {};
  const chatId = String(msg.chat.id);
  const textRaw = (msg.text ?? msg.caption ?? "") as string;
  const text = (textRaw || "").toString().trim();
  const profileName =
    msg.from?.first_name ||
    msg.from?.username ||
    (msg.from?.last_name ? `${msg.from?.first_name || ""} ${msg.from?.last_name}`.trim() : "") ||
    String(msg.from?.id || "");

  return { chatId, text, profileName };
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret");
  const headerSecret = req.headers.get("x-telegram-bot-api-secret-token");
  const ok = !!WEBHOOK_SECRET && (querySecret === WEBHOOK_SECRET || headerSecret === WEBHOOK_SECRET);
  return okJson({ ok, message: ok ? "telegram webhook alive" : "bad-secret" }, ok ? 200 : 401);
}

// Receive updates
export async function POST(req: NextRequest) {
  // Verify secret (query or Telegram header)
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret");
  const headerSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!WEBHOOK_SECRET || (querySecret !== WEBHOOK_SECRET && headerSecret !== WEBHOOK_SECRET)) {
    return okJson({ ok: false, reason: "bad-secret" }, 401);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) return okJson({ ok: true, empty: true });

    const update_id: number | undefined = body?.update_id;
    if (typeof update_id !== "number") return okJson({ ok: true, no_update_id: true });

    // Dedup
    const fresh = await isNewUpdate(update_id);
    if (!fresh) return okJson({ ok: true, deduped: true });

    // Extract message info
    const { chatId, text, profileName } = pickTextFromUpdate(body);
    if (!chatId) return okJson({ ok: true, no_chat: true });

    // 1) Upsert session (must have unique index on (channel, external_ref))
    const { data: session, error: sErr } = await sb
      .from("sessions")
      .upsert({ channel: "telegram", external_ref: chatId }, { onConflict: "channel,external_ref" })
      .select("*")
      .single();

    if (sErr || !session) {
      console.error("session upsert failed:", sErr);
      return okJson({ ok: false, reason: "session_upsert_failed" }, 500);
    }

    // 2) Log inbound message
    await sb.from("conversations").insert({
      session_id: session.id,
      user_id: null,
      platform: "telegram",
      channel: "telegram",
      message_text: (text && text.length > 0) ? text : "(non-text message)",
      attachments: null,
      delivery_status: "received",
      external_ref: String(update_id),
      profile_name: profileName ?? null,
      direction: "inbound",
      created_at: new Date().toISOString(),
    });

    // 3) Engine deps
    const deps: EngineDeps = {
      sendOnChannel: async ({ channel, toExternalRef, session_id, text }) => {
        if (channel !== "telegram") return;
        try {
          const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chat_id: toExternalRef, text }),
          });

          await sb.from("conversations").insert({
            session_id,
            user_id: null,
            platform: "telegram",
            channel: "telegram",
            message_text: text,
            attachments: null,
            delivery_status: res.ok ? "sent" : "failed",
            external_ref: null,
            profile_name: null,
            direction: "outbound",
            created_at: new Date().toISOString(),
          });
        } catch (e) {
          console.error("telegram sendMessage failed:", e);
          await sb.from("conversations").insert({
            session_id,
            user_id: null,
            platform: "telegram",
            channel: "telegram",
            message_text: text,
            attachments: null,
            delivery_status: "failed",
            external_ref: null,
            profile_name: null,
            direction: "outbound",
            created_at: new Date().toISOString(),
          });
        }
      },

      addCustomerTag: async (external_ref, tag) => {
        const { data: c, error } = await sb
          .from("customers")
          .upsert({ external_ref }, { onConflict: "external_ref" })
          .select("id,tags")
          .single();
        if (!error && c) {
          const tags = Array.from(new Set([...(c.tags || []), tag]));
          await sb.from("customers").update({ tags }).eq("id", c.id);
        }
      },

      createCustomerNote: async (external_ref, body, author) => {
        const { data: c } = await sb
          .from("customers")
          .select("id")
          .eq("external_ref", external_ref)
          .maybeSingle();
        if (c?.id) {
          await sb.from("customer_notes").insert({ customer_id: c.id, body, author });
        }
      },

      httpPostJSON: async (url, payload, headers) => {
        const r = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", ...(headers || {}) },
          body: JSON.stringify(payload),
        });
        let j: any = null;
        try { j = await r.json(); } catch {}
        return { ok: r.ok, status: r.status, json: j };
      },

      now: () => new Date(),
    };

    // 4) Automation engine (shielded)
    if (!TG_WORKFLOW_ID) {
      console.warn("TG_WORKFLOW_ID is not configured; Telegram automation skipped");
    } else {
      try {
        await processAutomation(
          TG_WORKFLOW_ID,
          {
            event: "message.received",
            channel: "telegram",
            text: text || "",
            session_id: session.id,
            external_ref: chatId,
            profile_name: profileName,
          },
          deps
        );
      } catch (e) {
        console.error("processAutomation failed:", e);
        // Optional fallback reply (commented):
        // await deps.sendOnChannel({ channel: "telegram", toExternalRef: chatId, session_id: session.id, text: "پیام دریافت شد ✅" });
      }
    }

    // Always ack fast
    return okJson({ ok: true });
  } catch (e) {
    console.error("telegram webhook error:", e);
    // Deliberately return 200 to avoid Telegram infinite retries
    return okJson({ ok: true, swallowed: true });
  }
}
