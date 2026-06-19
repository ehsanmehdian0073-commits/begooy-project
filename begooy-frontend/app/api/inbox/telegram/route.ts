import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "telegram_inbox_not_implemented" },
    { status: 501 },
  );
}
