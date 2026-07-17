// app/api/magic/auto-detect/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { scanUrl } from "@/lib/magic";
import { createClientForAction } from "@/utils/supabase/server";

export const dynamic = "force-dynamic"; // برای اجبار اجرای سروری تازه
export const runtime = "nodejs";

const BodySchema = z.object({
  url: z.string().min(1, "url-required"),
});

function normalizeUrl(raw: string): string {
  let u = raw.trim();
  if (!/^https?:\/\//i.test(u)) {
    // اگر پروتکل نداشت، https را پیش‌فرض کن
    u = `https://${u}`;
  }
  try {
    // اگر URL نامعتبر بود، این خط throw می‌دهد
    const parsed = new URL(u);
    // نمونه ساده برای جلوگیری از جاوااسکریپت‌: URL schemes
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("invalid-protocol");
    }
    return parsed.toString();
  } catch {
    throw new Error("invalid-url");
  }
}

export async function OPTIONS() {
  // برای preflight CORS (اگر جلوتر proxy داری می‌تونی حذفش کنی)
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  try {
    const supabase = await createClientForAction();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // 1) Parse + validate
    const json = await req.json();
    const { url } = BodySchema.parse(json);

    // 2) Normalize URL
    const safeUrl = normalizeUrl(url);

    // 3) Timeout برای scanUrl تا ریکوئست آویزان نماند
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12_000); // 12s

    // اگر scanUrl خود signal نمی‌پذیرد، می‌توانید داخلش هندل کنید یا این سطر را نادیده بگیرید
    // @ts-ignore: pass-through signal if implemented
    const result = await scanUrl(safeUrl, { signal: controller.signal }).finally(
      () => clearTimeout(t)
    );

    // 4) خروجی سازگار با قبل
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (e: any) {
    // کد خطاهای قابل تشخیص
    const msg = String(e?.message || "");
    if (msg === "invalid-url" || msg === "invalid-protocol" || msg === "invalid_url") {
      return NextResponse.json(
        { ok: false, error: "invalid_url" },
        { status: 400 }
      );
    }
    if (msg === "unsafe_url" || msg === "unresolvable_url") {
      return NextResponse.json(
        { ok: false, error: "unsafe_url" },
        { status: 400 }
      );
    }
    if (e?.name === "AbortError") {
      return NextResponse.json(
        { ok: false, error: "timeout" },
        { status: 504 }
      );
    }
    // خطای اسکیما
    if (e?.issues) {
      return NextResponse.json(
        { ok: false, error: "validation_error", details: e.issues },
        { status: 422 }
      );
    }
    // خطای عمومی
    return NextResponse.json(
      { ok: false, error: "scan-failed", detail: msg || "unknown" },
      { status: 500 }
    );
  }
}
