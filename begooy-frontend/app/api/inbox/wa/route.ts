import { NextResponse } from "next/server";

function notConfigured() {
  return NextResponse.json(
    { ok: false, error: "whatsapp_inbox_route_not_configured" },
    { status: 501 }
  );
}

export async function GET() {
  return notConfigured();
}

export async function POST() {
  return notConfigured();
}
