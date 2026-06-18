// app/api/bots/save-settings/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin as sb } from "@/lib/supabaseAdmin";
import { requireUser } from "@/lib/auth/requireUser";

export const runtime = "nodejs";

// محاسبهٔ سایز JSON ایمن‌تر از Blob برای محیط‌های Node
function jsonSizeUtf8(obj: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(obj ?? {}), "utf8");
  } catch {
    return Infinity; // باعث رد شدن در ولیدیشن می‌شود
  }
}

// (اختیاری) یک شمای سبک برای settings؛ فعلاً آزاد می‌گذاریم و فقط محدودیت سایز داریم
const BodySchema = z
  .object({
    botId: z.string().uuid(),
    settings: z.record(z.any()).default({}),
  })
  .superRefine((val, ctx) => {
    const size = jsonSizeUtf8(val.settings);
    if (size > 100 * 1024) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "settings payload too large (>100KB)",
        path: ["settings"],
      });
    }
  });

export async function POST(req: Request) {
  try {
    const auth = await requireUser(req);
    if ("response" in auth) return auth.response;
    const { userId } = auth;

    // 2) اعتبارسنجی ورودی
    const json = await req.json();
    const { botId, settings } = BodySchema.parse(json);

    // 3) خواندن Bot برای مالکیت و مقادیر قبلی
    const { data: bot, error: selErr } = await sb
      .from("bots")
      .select("id, user_id, settings_json")
      .eq("id", botId)
      .single();

    if (selErr) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (bot.user_id && bot.user_id !== userId) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    // 4) Merge سطحی (در صورت نیاز می‌تونیم Deep Merge بذاریم)
    const prev = (bot.settings_json ?? {}) as Record<string, any>;
    const merged = { ...prev, ...settings };

    // 5) آپدیت + مالک اگر تهی بود
    const { data, error } = await sb
      .from("bots")
      .update({
        settings_json: merged,
        user_id: bot.user_id ?? userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", botId)
      .select("id, settings_json, updated_at")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "db_update_failed", details: error.message },
        { status: 400 }
      );
    }

    // (اختیاری) ثبت رویداد
    // await sb.from("analytics_logs").insert({ event: "save_settings", payload: { botId } }).catch(() => {});

    return NextResponse.json(
      { ok: true, bot: { id: data.id, settings_json: data.settings_json, updated_at: data.updated_at } },
      { status: 200 }
    );
  } catch (e: any) {
    if (e?.issues) {
      return NextResponse.json(
        { ok: false, error: "validation_error", details: e.issues },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unexpected_error" },
      { status: 500 }
    );
  }
}
