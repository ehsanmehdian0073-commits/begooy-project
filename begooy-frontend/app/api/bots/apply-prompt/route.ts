// app/api/bots/apply-prompt/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin as sb } from "@/lib/supabaseAdmin";
import { requireAuthenticatedUserId } from "@/lib/auth";

export const runtime = "nodejs";

const BodySchema = z.object({
  botId: z.string().uuid(),
  prompt: z.string().min(10, "prompt is too short").max(8000, "prompt too long"),
});

export async function POST(req: Request) {
  try {
    const { userId, response } = await requireAuthenticatedUserId();
    if (response) return response;

    // 1) اعتبارسنجی ورودی
    const json = await req.json();
    const { botId, prompt } = BodySchema.parse(json);

    // 2) وجود و مالکیت بات
    const { data: bot, error: selErr } = await sb
      .from("bots")
      .select("id")
      .eq("id", botId)
      .eq("user_id", userId)
      .single();

    if (selErr || !bot) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }

    // 3) آپدیت پرامپت با شرط مالکیت
    const { data, error } = await sb
      .from("bots")
      .update({
        prompt,
        updated_at: new Date().toISOString(), // اگر تریگر دارید می‌تونید حذف کنید
      })
      .eq("id", botId)
      .eq("user_id", userId)
      .select("id, prompt, updated_at")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: "db_update_failed", details: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, bot: data }, { status: 200 });
  } catch (e: any) {
    if (e?.issues) {
      // خطاهای Zod
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
