"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";

// مسیرهای نسبی چون فایل داخل components/marketing است
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Check, Bot, MessageSquare, LineChart, Users, Shield, Zap } from "lucide-react";

/* --- سکشن‌ها برای ناوبری و هایلایت فعال --- */
const SECTIONS = [
  { id: "features", label: "ویژگی‌ها" },
  { id: "plans", label: "پلن‌ها" },
  { id: "demo", label: "دمو" },
];

/* --- فرم ثبت ایمیل بتا (درون همین فایل) --- */
function SignupForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState({ loading: false, ok: false, error: "" });

  const onSubmit = async (e) => {
    e.preventDefault();
    setState({ loading: true, ok: false, error: "" });
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "خطا در ثبت ایمیل");
      setState({ loading: false, ok: true, error: "" });
      setEmail("");
    } catch (err) {
      setState({ loading: false, ok: false, error: String(err?.message || err) });
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-2 items-center justify-center">
      <input
        type="email"
        required
        dir="ltr"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full sm:w-auto flex-1 px-4 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[var(--brand-2)]"
      />
      <button
        type="submit"
        disabled={state.loading}
        className="px-5 py-2 rounded-xl bg-[var(--brand-2)] text-white hover:brightness-95 disabled:opacity-60"
      >
        {state.loading ? "در حال ثبت…" : "ثبت"}
      </button>
      {state.ok && <span className="text-green-700 text-sm">ثبت شد! 🎉</span>}
      {state.error && <span className="text-red-600 text-sm">خطا: {state.error}</span>}
    </form>
  );
}

export default function LandingMockup() {
  const [active, setActive] = useState("features");

  // تشخیص سکشن فعال با IntersectionObserver
  useEffect(() => {
    const opts = { root: null, rootMargin: "0px 0px -60% 0px", threshold: 0.3 };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.isIntersecting && setActive(entry.target.id));
    }, opts);

    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  // اسکرول نرم با offset (برای هدر چسبان)
  const scrollToId = (id) => (e) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.pageYOffset - 72;
    window.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] text-[var(--ink)]">
      {/* Header - Glass */}
      <header className="sticky top-0 z-40 glass">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-[var(--brand-2)]" />
            <span className="font-extrabold tracking-tight text-xl">Begooy</span>
          </div>

          <nav className="hidden md:flex items-center gap-2 text-sm">
            {SECTIONS.map((s) => {
              const isActive = active === s.id;
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={scrollToId(s.id)}
                  className={[
                    "px-3 py-1.5 rounded-xl transition-colors",
                    isActive
                      ? "bg-amber-100 text-[var(--brand-2)]"
                      : "text-slate-600 hover:text-slate-900",
                  ].join(" ")}
                >
                  {s.label}
                </a>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" className="hidden sm:inline-flex">ورود</Button>
            <Button className="bg-[var(--brand-2)] hover:brightness-95 text-white rounded-2xl px-5">
              شروع رایگان
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-8">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div className="space-y-6">
            {/* تیتر نوروساینتیفیک: کوتاه، آشنا، پردازش سریع */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-2xl sm:text-5xl font-black leading-tight tracking-tight"
            >
              <span className="text-[var(--brand-2)]">مرکز پیام‌ها</span> برای کسب‌وکارهای هوشمند
            </motion.h1>

            {/* زیرتیتر انگلیسی برای هویت بین‌المللی و شفاف‌سازی محصول */}
            <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
              Omnichannel AI Inbox — Web • Telegram • Instagram • WhatsApp • Email
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" className="bg-[var(--brand-2)] hover:brightness-95 text-white rounded-2xl px-6 shadow-md">
                شروع رایگان
              </Button>
              <Button size="lg" variant="outline" className="rounded-2xl px-6 border-slate-300">
                رزرو دمو
              </Button>
              <div className="text-xs text-slate-500">بدون نیاز به کارت بانکی</div>
            </div>

            <div className="flex items-center gap-6 text-sm text-slate-500 pt-2">
              <div className="flex items-center gap-2"><Zap className="h-4 w-4" />Streaming پاسخ</div>
              <div className="flex items-center gap-2"><Shield className="h-4 w-4" />RLS Multi-tenant</div>
            </div>
          </div>

          {/* Mocked UI preview */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative"
          >
            <div className="rounded-2xl border bg-white shadow-xl overflow-hidden max-w-full">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="h-3 w-3 rounded-full bg-slate-200" />
                <div className="text-xs text-slate-500">Inbox Preview</div>
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="h-2 w-2 rounded-full bg-[var(--brand-2)]" />
                </div>
              </div>

              <div className="grid grid-cols-5">
                <aside className="col-span-2 border-l p-3 space-y-2 bg-slate-50">
                  {["تلگرام", "اینستاگرام", "واتس‌اپ", "ایمیل"].map((ch, i) => (
                    <div key={i} className="flex items-center justify-between rounded-xl bg-white border px-3 py-2">
                      <div className="text-sm">{ch}</div>
                      <div className="text-[10px] bg-amber-100 text-[var(--brand-2)] px-2 py-0.5 rounded-full">جدید</div>
                    </div>
                  ))}
                </aside>

                <main className="col-span-3 p-4 space-y-4">
                  <div className="space-y-1">
                    <div className="text-xs text-slate-400">گفتگو با مشتری</div>
                    <div className="flex flex-col gap-2">
                      <div className="self-end max-w-[70%] bg-[var(--brand-2)] text-white rounded-2xl rounded-tr-sm px-3 py-2 text-sm">
                        سلام! وضعیت سفارش ۱۲۳۴ رو می‌خواستم بدونم
                      </div>
                      <div className="self-start max-w-[70%] bg-[var(--ok-1)] text-[var(--ok-2)] rounded-2xl rounded-tl-sm px-3 py-2 text-sm">
                        در حال بررسی است؛ زمان تحویل فرداست. کمکی دیگه؟
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-xl border px-3 py-2 text-sm"
                      placeholder="پاسخ خود را بنویسید…"
                    />
                    <Button className="bg-[var(--ok-2)] hover:brightness-95 text-white">ارسال</Button>
                  </div>
                </main>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {[
            { icon: <MessageSquare className="h-5 w-5" />, title: "Omni-Inbox", desc: "همه کانال‌ها یک‌جا" },
            { icon: <Bot className="h-5 w-5" />, title: "Bot Studio", desc: "Workflow + RAG + LLM" },
            { icon: <Users className="h-5 w-5" />, title: "CRM سبک", desc: "پروفایل، برچسب، یادداشت" },
            { icon: <LineChart className="h-5 w-5" />, title: "Reports", desc: "FRT/ART/CSAT و روندها" },
          ].map((f, i) => (
            <Card key={i} className="rounded-2xl shadow-sm hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {f.icon}
                  {f.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">{f.desc}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Demo با تصویر */}
      <section id="demo" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-4">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>یک نگاه سریع به قدرت Begooy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="aspect-video w-full overflow-hidden rounded-xl border">
              <Image
                src="/demo.png"
                alt="Begooy Demo"
                width={1280}
                height={720}
                className="w-full h-full object-cover"
                priority
              />
            </div>
            <div className="pt-4">
              <Button variant="outline" className="rounded-2xl border-slate-300">
                امتحان نسخهٔ دمو
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Plans */}
      <section id="plans" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {[
            { name: "Free", price: "0", features: ["۵۰ پیام", "۱ کاربر", "Omni-Inbox پایه"] },
            { name: "Starter", price: "290,000", features: ["۱۰۰۰ پیام", "۳ کاربر", "Bot Studio پایه"] },
            { name: "Pro", price: "1,490,000", features: ["۱۰k پیام", "۱۰ کاربر", "Reports + CRM"] },
            { name: "Enterprise", price: "سفارشی", features: ["SLA", "SSO", "پشتیبانی اختصاصی"] },
          ].map((p, i) => (
            <Card
              key={i}
              className={`rounded-2xl ${p.name === "Pro" ? "border-[var(--brand-2)] shadow-lg" : ""}`}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{p.name}</span>
                  {p.name === "Pro" && (
                    <span className="text-xs bg-amber-100 text-[var(--brand-2)] px-2 py-0.5 rounded-full">
                      پیشنهادی
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-extrabold mb-3">
                  {p.price}
                  {p.price !== "سفارشی" && (
                    <span className="text-base font-medium text-slate-500"> تومان/ماه</span>
                  )}
                </div>
                <ul className="space-y-2 text-sm text-slate-600">
                  {p.features.map((ft, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <Check className="h-4 w-4" />
                      {ft}
                    </li>
                  ))}
                </ul>
                <div className="pt-4">
                  <Button className="w-full rounded-2xl bg-[var(--brand-2)] hover:brightness-95 text-white">
                    شروع رایگان
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-8">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>مورد اعتماد برندهای ایرانی</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-16 rounded-xl border bg-white grid place-items-center text-slate-400"
                >
                  لوگو {i}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Beta Signup CTA */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 pb-12">
        <div className="bg-white/70 backdrop-blur-md rounded-2xl shadow p-6 text-center border">
          <h3 className="text-xl font-bold mb-2">به نسخهٔ بتا دسترسی بگیر</h3>
          <p className="text-slate-600 mb-4">ایمیلت رو وارد کن تا زودتر از همه به Begooy دسترسی پیدا کنی.</p>
          <SignupForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200/60 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 grid md:grid-cols-4 gap-6 text-sm">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-[var(--brand-2)]" />
              <span className="font-bold">Begooy</span>
            </div>
            <p className="text-slate-500">© 2025 Begooy — All rights reserved</p>
          </div>
          <div className="space-y-2">
            <div className="font-semibold mb-1">محصول</div>
            <ul className="space-y-1 text-slate-600">
              <li><a href="#features" onClick={scrollToId("features")}>ویژگی‌ها</a></li>
              <li><a href="#plans" onClick={scrollToId("plans")}>پلن‌ها</a></li>
              <li><a href="#demo" onClick={scrollToId("demo")}>دمو</a></li>
            </ul>
          </div>
          <div className="space-y-2">
            <div className="font-semibold mb-1">شرکت</div>
            <ul className="space-y-1 text-slate-600">
              <li>درباره ما</li>
              <li>تماس با ما</li>
              <li>وبلاگ</li>
            </ul>
          </div>
          <div className="space-y-2">
            <div className="font-semibold mb-1">ارتباط</div>
            <ul className="space-y-1 text-slate-600">
              <li>Telegram</li>
              <li>Instagram</li>
              <li>LinkedIn</li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
