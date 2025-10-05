// app/api/magic/scan/route.ts
import { NextResponse } from "next/server";
import { scanUrl } from "@/lib/magic";

export const dynamic = "force-dynamic"; // در محیط dev کمک می‌کند

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = (body?.url || "").toString().trim();

    if (!url) {
      return NextResponse.json({ ok: false, error: "url-required" }, { status: 400 });
    }

    const result = await scanUrl(url);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "scan-failed", detail: err?.message || "unknown" },
      { status: 500 }
    );
  }
}
