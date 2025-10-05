// app/api/auth/me/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// اگر Edge نمی‌خوای، همین Node runtime بمونه (پیش‌فرض Next). Buffer در Node هست.
function parseJwt(token: string | undefined) {
  if (!token) return null;
  try {
    const [, payload] = token.split(".");
    const json = Buffer.from(payload, "base64").toString("utf-8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const c = cookies();

    // نام‌های رایج کوکی‌های Supabase (بسته به تنظیمات/هلپرها ممکنه یکی از این‌ها باشه)
    const token =
      c.get("sb-access-token")?.value ||
      c.get("sb:token")?.value ||           // بعضی کانفیگ‌ها
      c.get("supabase-auth-token")?.value || // اگر خودت ست کرده باشی
      "";

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "no_auth_cookie" },
        { status: 401 }
      );
    }

    const payload = parseJwt(token);
    const userId = payload?.sub ?? payload?.user_id ?? null;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "invalid_token_payload" },
        { status: 401 }
      );
    }

    return NextResponse.json({ ok: true, userId }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unexpected_error" },
      { status: 500 }
    );
  }
}
