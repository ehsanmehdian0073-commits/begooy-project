import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "whatsapp_inbox_not_implemented" },
    { status: 501 },
  );
}
