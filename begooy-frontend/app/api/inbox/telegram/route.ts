import { NextResponse } from "next/server";

function notImplemented() {
  return NextResponse.json(
    { ok: false, error: "telegram_inbox_not_configured" },
    { status: 501 }
  );
}

export async function GET() {
  return notImplemented();
}

export async function POST() {
  return notImplemented();
}
