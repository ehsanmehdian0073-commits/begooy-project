// app/api/bots/apply-prompt/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin as sb } from "@/lib/supabaseAdmin";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth/route";

export const runtime = "nodejs";

const BodySchema = z.object({
  botId: z.string().uuid(),
  prompt: z.string().min(10, "prompt is too short").max(8000, "prompt too long"),
});

export async function POST(req: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return unauthorizedResponse();
    }

    const json = await req.json();
    const { botId, prompt } = BodySchema.parse(json);

    const { data: bot, error: selErr } = await sb
      .from("bots")
      .select("id, user_id")
      .eq("id", botId)
      .single();

    if (selErr || !bot) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (bot.user_id && bot.user_id !== userId) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const { data, error } = await sb
      .from("bots")
      .update({
        prompt,
        user_id: bot.user_id ?? userId,
        updated_at: new Date().toISOString(), // اگر تریگر دارید می‌تونید حذف کنید
      })
      .eq("id", botId)
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
