"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import AuthLayout from "@/components/auth/AuthLayout";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupContent />
    </Suspense>
  );
}

function SignupContent() {
  const supabase = createClient();
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/dashboard/billing";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (!email || !password || !confirm) return "تمام فیلدها را پر کنید.";
    if (password.length < 8) return "رمز عبور باید حداقل ۸ کاراکتر باشد.";
    if (password !== confirm) return "تکرار رمز با رمز عبور یکسان نیست.";
    if (!accepted) return "برای ادامه، شرایط استفاده را بپذیرید.";
    return null;
  };

  async function handleSignup(e) {
    e.preventDefault();
    setMsg("");

    const v = validate();
    if (v) return setMsg(v);

    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) return setMsg(error.message);

    setMsg("ثبت‌نام موفق! لطفاً ایمیل خود را برای تایید بررسی کنید.");
    router.push(`/login?next=${encodeURIComponent(next)}`);
  }

  async function handleMagicLink() {
    setMsg("");
    if (!email) return setMsg("ایمیل را وارد کنید.");
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email });
    setLoading(false);
    setMsg(error ? error.message : "لینک ثبت‌نام/ورود برایتان ایمیل شد.");
  }

  return (
    <AuthLayout bubbleText="🚀 شروعی سریع و امن — حساب رایگان شما در چند ثانیه ساخته می‌شود.">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">ثبت‌نام در بگوی</h1>
        <p className="mt-1 text-sm text-neutral-600/90">متمرکز بر تجربه؛ هماهنگ با اصول نوروساینس UI</p>
      </div>

      <form onSubmit={handleSignup} className="space-y-4">
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
              autoComplete="new-password"
              placeholder="حداقل ۸ کاراکتر"
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

        <label className="block text-sm font-medium text-neutral-700">
          تکرار رمز عبور
          <div className="mt-1 relative">
            <input
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              placeholder="تکرار رمز عبور"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 outline-none focus:border-orange-500 transition"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((s) => !s)}
              className="absolute inset-y-0 left-0 flex items-center px-3 text-xs text-neutral-500 hover:text-neutral-700"
              aria-label={showConfirm ? "پنهان کردن رمز" : "نمایش رمز"}
            >
              {showConfirm ? "مخفی" : "نمایش"}
            </button>
          </div>
        </label>

        <label className="flex items-start gap-2 text-[12px] text-neutral-600">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-orange-600 focus:ring-orange-500"
          />
          <span>شرایط استفاده و سیاست حریم‌خصوصی را می‌پذیرم.</span>
        </label>

        <div className="space-y-2">
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-orange-600 text-white py-2.5 text-sm font-semibold shadow-sm hover:bg-orange-700 active:bg-orange-800 disabled:opacity-60 transition"
          >
            {loading ? "در حال ثبت‌نام…" : "ثبت‌نام"}
          </button>

          <button
            type="button"
            onClick={handleMagicLink}
            disabled={loading}
            className="w-full rounded-xl bg-white border border-neutral-200 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition"
            title="ثبت‌نام/ورود بدون رمز؛ لینک به ایمیل شما ارسال می‌شود"
          >
            <span className="text-emerald-600">ثبت‌نام با لینک جادویی</span>
          </button>
        </div>

        {msg && (
          <div className={`text-[12px] leading-relaxed mt-1 ${msg.includes("ایمیل") ? "text-emerald-700" : "text-rose-600"}`} role="alert">
            {msg}
          </div>
        )}

        <div className="pt-2 border-t border-dashed border-neutral-200 text-[12px] text-neutral-600 text-center">
          قبلاً ثبت‌نام کرده‌اید؟{" "}
          <a href={`/login?next=${encodeURIComponent(next)}`} className="text-emerald-600 hover:text-emerald-700">
            ورود
          </a>
        </div>
      </form>
    </AuthLayout>
  );
}
