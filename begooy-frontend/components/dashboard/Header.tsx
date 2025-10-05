"use client";
import LogoutButton from "@/components/LogoutButton";

export default function Header() {
  return (
    <header className="flex items-center justify-between px-4 py-2 border-b bg-white dark:bg-neutral-900">
      <h1 className="text-lg font-semibold">Begooy Dashboard</h1>

      <div className="flex items-center gap-3">
        {/* اینجا می‌تونی آواتار یا منوی کاربر هم اضافه کنی */}
        <LogoutButton />
      </div>
    </header>
  );
}
