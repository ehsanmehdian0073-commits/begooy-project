"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function AuthLayout({ children, bubbleText }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const next = search.get("next") || "/dashboard/billing";

  const isLogin = pathname?.startsWith("/login");
  const tabs = [
    { href: `/login?next=${encodeURIComponent(next)}`, label: "ورود", active: isLogin },
    { href: `/signup?next=${encodeURIComponent(next)}`, label: "ثبت‌نام", active: !isLogin },
  ];

  return (
    <main
      dir="rtl"
      className="min-h-dvh flex items-center justify-center px-4"
      style={{ background: "#FAF9F7" }}
    >
      {/* هاله‌های بسیار ملایم (نارنجی/سبز) */}
      <div className="pointer-events-none absolute inset-0 [background:radial-gradient(480px_220px_at_85%_-10%,_rgba(249,115,22,.06),_transparent_60%),radial-gradient(520px_260px_at_10%_110%,_rgba(16,185,129,.06),_transparent_60%)]" />

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl sm:rounded-3xl border border-white/60 shadow-lg bg-white/90 backdrop-blur-md">
          {/* هدر کوچک + تب‌ها */}
          <div className="px-6 sm:px-8 pt-6">
            <div className="flex items-center justify-between">
              {/* لوگو کوچک هم‌سو با لندینگ (نارنجی) */}
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-md">
                <span className="text-base font-extrabold">B</span>
              </div>

              <nav className="flex items-center gap-1 bg-neutral-100 rounded-xl p-1">
                {tabs.map((t) => (
                  <Link
                    key={t.href}
                    href={t.href}
                    className={[
                      "px-3 py-1.5 text-sm rounded-lg transition",
                      t.active
                        ? "bg-white shadow-sm text-neutral-900"
                        : "text-neutral-600 hover:text-neutral-800"
                    ].join(" ")}
                  >
                    {t.label}
                  </Link>
                ))}
              </nav>
            </div>

            {/* بالن خوش‌آمد اختیاری */}
            {bubbleText && (
              <div className="mt-5">
                <div className="inline-block relative">
                  <div className="rounded-2xl px-4 py-2 text-[13px] shadow-sm bg-emerald-50 text-emerald-800 border border-emerald-100">
                    {bubbleText}
                  </div>
                  <div className="absolute -bottom-2 right-6 w-0 h-0 border-t-8 border-t-emerald-50 border-x-8 border-x-transparent" />
                </div>
              </div>
            )}
          </div>

          {/* محتوای فرم */}
          <div className="p-6 sm:p-8">{children}</div>
        </div>
      </div>
    </main>
  );
}
