// app/(dashboard)/layout.tsx
import { createClientReadOnly } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Toaster } from "sonner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server Component: فقط read-only
  const supabase = await createClientReadOnly();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // اگر لاگین نیست، هدایت به لاگین
    redirect("/login?next=/dashboard/billing");
  }

  return (
    <div
      dir="rtl"
      className="min-h-dvh w-full bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50"
    >
      {/* ظرف اصلی داشبورد: بدون محدودیت عرض */}
      <div className="w-full">
        <div className="flex min-h-dvh">
          {/* سایدبار: از فشرده شدن جلوگیری شود */}
          <div className="shrink-0">
            <Sidebar />
          </div>

          {/* ستون محتوا: فول‌ویدث روی باقیمانده */}
          <main className="flex-1 min-w-0 w-full overflow-x-hidden">
            {/* هدر چسبان تمام‌عرض */}
            <div className="sticky top-0 z-40 bg-neutral-50/80 dark:bg-neutral-900/70 backdrop-blur-md supports-[backdrop-filter]:bg-neutral-50/60 border-b border-black/5 dark:border-white/10">
              <div className="w-full px-3 md:px-6">
                <Header />
              </div>
            </div>

            {/* بدنهٔ صفحه‌ها: بدون max-width، فقط padding افقی تمیز */}
            <div className="w-full px-3 md:px-6 py-4 md:py-6">
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* Toasts */}
      <Toaster
        closeButton
        richColors
        position="top-center"
        toastOptions={{
          className:
            "rtl text-sm font-medium shadow-lg border border-black/5 dark:border-white/10",
        }}
      />
    </div>
  );
}
