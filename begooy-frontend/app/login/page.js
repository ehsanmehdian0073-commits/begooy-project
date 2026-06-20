"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import AuthLayout from "@/components/auth/AuthLayout";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const supabase = createClient();
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/dashboard/billing";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setMsg("");
    if (!email || !password) return setMsg("ایمیل و رمز عبور را وارد کنید.");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMsg(error.message === "Invalid login credentials" ? "ایمیل یا رمز عبور نادرست است." : error.message);
      return;
    }
    router.push(next);
  }

  async function handleMagicLink() {
    setMsg("");
    if (!email) return setMsg("ایمیل را وارد کنید.");
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setLoading(false);
    setMsg(error ? error.message : "لینک ورود برایتان ایمیل شد.");
  }

  return (
    <AuthLayout bubbleText="👋 خوش آمدید! ورود شما امن و مطابق اصول UX انجام می‌شود.">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">ورود به بگوی</h1>
        <p className="mt-1 text-sm text-neutral-600/90">
          سریع، امن و متمرکز بر تجربه — هماهنگ با نوروساینس UI
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <label className="block text-sm font-medium text-neutral-700">
          ایمیل
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 outline-none focus:border-orange-500 transition"
          />
        </label>

        <label className="block text-sm font-medium text-neutral-700">
          رمز عبور
          <div className="mt-1 relative">
            <input
              type={showPass ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 outline-none focus:border-orange-500 transition"
            />
            <button
              type="button"
              onClick={() => setShowPass((s) => !s)}
              className="absolute inset-y-0 left-0 flex items-center px-3 text-xs text-neutral-500 hover:text-neutral-700"
              aria-label={showPass ? "پنهان کردن رمز" : "نمایش رمز"}
            >
              {showPass ? "مخفی" : "نمایش"}
            </button>
          </div>
        </label>

        <div className="flex items-center justify-between text-[11px] text-neutral-500">
          <span>ورود امن با رمزنگاری سمت سرور</span>
          <a href={`/signup?next=${encodeURIComponent(next)}`} className="text-emerald-600 hover:text-emerald-700">
            ثبت‌نام نکرده‌اید؟
          </a>
        </div>

        <div className="space-y-2">
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-orange-600 text-white py-2.5 text-sm font-semibold shadow-sm hover:bg-orange-700 active:bg-orange-800 disabled:opacity-60 transition"
          >
            {loading ? "در حال ورود…" : "ورود"}
          </button>

          <button
            type="button"
            onClick={handleMagicLink}
            disabled={loading}
            className="w-full rounded-xl bg-white border border-neutral-200 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition"
            title="ورود بدون رمز؛ لینک به ایمیل شما ارسال می‌شود"
          >
            <span className="text-emerald-600">ورود با لینک جادویی</span>
          </button>
        </div>

        {msg && (
          <div className={`text-[12px] leading-relaxed mt-1 ${msg.includes("ایمیل شد") ? "text-emerald-700" : "text-rose-600"}`} role="alert">
            {msg}
          </div>
        )}
      </form>
    </AuthLayout>
  );
}
