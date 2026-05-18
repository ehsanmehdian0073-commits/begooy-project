// app/api/auth/me/route.ts
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";

export async function GET() {
  try {
    const { userId, response } = await requireUserId();
    if (response) return response;

    return NextResponse.json({ ok: true, userId }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unexpected_error" },
      { status: 500 }
    );
  }
}
