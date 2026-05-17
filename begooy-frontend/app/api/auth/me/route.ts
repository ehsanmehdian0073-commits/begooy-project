// app/api/auth/me/route.ts
import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth/server";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
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
