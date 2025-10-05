// app/api/subscribe/route.js
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

// ایمیل‌سنج ساده
const isEmail = (s = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function POST(req) {
  try {
    const { email } = await req.json();

    if (!isEmail(email)) {
      return NextResponse.json({ error: "ایمیل معتبر نیست." }, { status: 400 });
    }

    // upsert با unique(email) — اگر وجود داشت، کاری نمی‌کند
    const { error } = await supabaseAdmin
      .from("subscribers")
      .upsert({ email }, { onConflict: "email" });

    if (error) {
      return NextResponse.json({ error: error.message || "Database error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
