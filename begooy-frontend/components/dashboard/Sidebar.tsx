"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Users,
  BarChart3,
  CreditCard,
  LayoutDashboard,
  MessageSquare,
  Sparkles,
  BookOpen,
} from "lucide-react";

const NAV = [
  // ✅ Omni-Inbox
  { href: "/inbox", label: " مرکز پیام‌ها", icon: MessageSquare },

  // ✅ داشبوردها
  { href: "/dashboard", label: "نمای کلی", icon: LayoutDashboard },

  // ✅ استودیو بات
  { href: "/dashboard/overview", label: "استودیو بات (نمای کلی)", icon: Bot },
  { href: "/dashboard/bot-studio", label: "ویزارد ساخت دستیار", icon: Sparkles },

  // ✅ پایگاه دانش
  { href: "/dashboard/knowledge", label: "پایگاه دانش", icon: BookOpen },

  // ✅ سایر ماژول‌ها
  { href: "/dashboard/crm", label: "مدیریت مشتریان", icon: Users },
  { href: "/dashboard/analytics", label: "تحلیل‌ها", icon: BarChart3 },
  { href: "/dashboard/billing", label: "وضعیت اشتراک", icon: CreditCard },
];

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="h-dvh w-64 shrink-0 border-r bg-white/70 dark:bg-neutral-900/50 backdrop-blur">
      <div className="px-4 py-5 space-y-3">
        {/* برند (انگلیسی طبق خواستهٔ قبلی) */}
        <div className="text-xl font-semibold tracking-tight">
          <span className="text-orange-600">Begooy</span>{" "}
          <span className="text-neutral-700 dark:text-neutral-200">Dashboard</span>
        </div>

        {/* CTA: رفتن سریع به ویزارد */}
        <Link
          href="/dashboard/bot-studio"
          className="block rounded-xl text-center text-sm font-semibold text-white py-2 px-3 bg-orange-500 hover:bg-orange-600 transition"
        >
          ساخت دستیار جدید (ویزارد)
        </Link>
      </div>

      <nav className="px-2 space-y-1" dir="rtl">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-sm transition
                ${
                  active
                    ? "bg-gradient-to-r from-orange-50 to-white text-orange-700 ring-1 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-300"
                    : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
