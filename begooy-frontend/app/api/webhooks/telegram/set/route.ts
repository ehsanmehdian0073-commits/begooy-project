import { NextResponse } from "next/server";

/** چک ساده‌ی الگوی توکن BotFather (ماک) */
function isValidToken(t: string) {
  return /^\d+:[\w-]{10,}$/.test(t);
}

/** POST /api/webhooks/telegram/set
 *  ورودی: { token: string, secret: string }
 *  خروجی: { ok: boolean, webhookUrl?: string, note?: string, error?: string }
 */
export async function POST(req: Request) {
  try {
    const { token, secret } = await req.json();

    if (!token || !secret) {
      return NextResponse.json(
        { ok: false, error: "token و secret الزامی است" },
        { status: 400 }
      );
    }
    if (!isValidToken(token)) {
      return NextResponse.json(
        { ok: false, error: "توکن نامعتبر است" },
        { status: 400 }
      );
    }

    // ✅ در نسخه‌ی واقعی اینجا باید درخواست setWebhook به تلگرام ارسال شود.
    //    فعلاً ماک: موفق برمی‌گردانیم و URL وب‌هوک را هم اعلام می‌کنیم.
    const webhookUrl = `/api/webhooks/telegram?secret=${encodeURIComponent(
      secret
    )}`;

    return NextResponse.json({
      ok: true,
      webhookUrl,
      note: "Mock: برای تولید، درخواست setWebhook را به Telegram API بزن.",
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}

/** جلوگیری از کش شدن در توسعه/لب */
export const dynamic = "force-dynamic";
