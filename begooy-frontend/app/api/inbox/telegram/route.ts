import { NextResponse } from "next/server";

function notConfigured() {
  return NextResponse.json(
    { ok: false, error: "telegram_inbox_route_not_configured" },
    { status: 501 }
  );
}

export async function GET() {
  return notConfigured();
}

export async function POST() {
  return notConfigured();
}
