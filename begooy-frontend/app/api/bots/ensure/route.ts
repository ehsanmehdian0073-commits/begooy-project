import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin as sb } from "@/lib/supabaseAdmin";
import { requireAuthenticatedUserId } from "@/lib/auth";

const BodySchema = z.object({
  // اختیاری: اگر خواستی نام اولیه بدهی
  name: z.string().min(1).max(80).optional(),
});

export async function POST(req: Request) {
  try {
    const { userId, response } = await requireAuthenticatedUserId();
    if (response) return response;

    const json = await req.json().catch(() => ({}));
    const { name } = BodySchema.parse(json);

    // 1) اگر Bot موجود است، آخرین/اولین را برگردان
    const { data: existing, error: selErr } = await sb
      .from("bots")
      .select("id, name")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1);

    if (selErr) {
      return NextResponse.json({ ok: false, error: "db_select_failed", details: selErr.message }, { status: 400 });
    }
    if (existing && existing.length > 0) {
      return NextResponse.json({ ok: true, botId: existing[0].id, bot: existing[0] }, { status: 200 });
    }

    // 2) در غیر این‌صورت یکی بساز
    const initialName = name ?? "My Bot";
    const { data: inserted, error: insErr } = await sb
      .from("bots")
      .insert({ user_id: userId, name: initialName, prompt: "", settings_json: {} })
      .select("id, name")
      .single();

    if (insErr || !inserted) {
      return NextResponse.json({ ok: false, error: "db_insert_failed", details: insErr?.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, botId: inserted.id, bot: inserted }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unexpected_error" }, { status: 500 });
  }
}
