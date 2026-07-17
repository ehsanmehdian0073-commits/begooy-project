// app/api/magic/scan/route.ts
import { NextResponse } from "next/server";
import { scanUrl } from "@/lib/magic";
import { createClientForAction } from "@/utils/supabase/server";

export const dynamic = "force-dynamic"; // در محیط dev کمک می‌کند
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supabase = await createClientForAction();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const url = (body?.url || "").toString().trim();

    if (!url) {
      return NextResponse.json({ ok: false, error: "url-required" }, { status: 400 });
    }

    const result = await scanUrl(url);
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    const message = String(err?.message || "");
    if (message === "invalid_url") {
      return NextResponse.json({ ok: false, error: "invalid_url" }, { status: 400 });
    }
    if (message === "unsafe_url" || message === "unresolvable_url") {
      return NextResponse.json({ ok: false, error: "unsafe_url" }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, error: "scan-failed", detail: message || "unknown" },
      { status: 500 }
    );
  }
}
