import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "instagram_inbox_not_implemented" },
    { status: 501 },
  );
}
