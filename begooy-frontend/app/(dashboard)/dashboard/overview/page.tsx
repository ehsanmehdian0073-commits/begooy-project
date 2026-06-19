"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Bot,
  Gauge,
  Activity,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Link as LinkIcon,
  Upload,
  BookOpen,
  Users,
  BarChart3,
  Settings,
  Globe,
  Phone,
  Instagram,
  Send,
  Sparkles,
  Puzzle,
  Copy,
  Check,
  SlidersHorizontal,
  Database,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

// ⬇️ Supabase (برای گرفتن userId سمت کلاینت)
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Configs
const COLORS = { brand: "#145DEE", cta: "#FF8A00", success: "#22C55E" };
const STORAGE_KEY = "begoy_wizard_draft_v2";
const BOT_ID_KEY = "begoy_active_bot_id";
const DRAFT_LABELS = [
  "شروع جادویی",
  "قالب/صنعت",
  "نام/آواتار",
  "تلگرام",
  "کانال‌ها",
  "دانش",
  "پرامپت",
  "تست",
  "انتشار",
];

// Supabase client
const supabaseClient = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (typeof window !== "undefined" && url && anon) {
    return createClient(url, anon, { auth: { persistSession: true } });
  }
  return null;
})();

// ─────────────────────────────────────────────────────────────────────────────
// Unified Auth + API helpers

async function getUserIdUnified(): Promise<string | null> {
  try {
    if (supabaseClient) {
      const { data } = await supabaseClient.auth.getUser();
      if (data?.user?.id) return data.user.id;
    }
  } catch {}
  try {
    const r = await fetch("/api/auth/me", { method: "GET", cache: "no-store" });
    const j = await r.json();
    if (j?.ok && j?.userId) return j.userId as string;
  } catch {}
  return null;
}

async function postJson<T = any>(url: string, body: any, userId: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {}
  if (!res.ok || !json?.ok) {
    const msg = json?.details
      ? `${json?.error ?? "request_failed"} — ${json.details}`
      : json?.error ?? `request_failed_${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

async function ensureBotOnServer(userId: string, payload?: Record<string, any>): Promise<string> {
  const res = await fetch("/api/bots/ensure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  const json = await res.json();
  if (!res.ok || !json?.ok || !json?.botId) {
    throw new Error(json?.error ?? `ensure_failed_${res.status}`);
  }
  return json.botId as string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small UI
function StatCard({ icon: Icon, title, value, sub, ring = 0 }: any) {
  const ringBg = { background: `conic-gradient(${COLORS.success} ${ring}%, #E5E7EB 0)` } as React.CSSProperties;
  return (
    <Card className="backdrop-blur-xl border-white/50 bg-white/70">
      <CardContent className="p-4" dir="rtl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-neutral-500 mb-2">{title}</div>
            <div className="text-2xl font-extrabold">{value}</div>
            {sub && <div className="text-[12px] text-neutral-500 mt-1">{sub}</div>}
          </div>
          <div className="grid place-items-center">
            <div className="relative w-14 h-14 rounded-full" style={ringBg}>
              <div className="absolute inset-[6px] rounded-full bg-white/90 grid place-items-center">
                <Icon size={18} className="text-neutral-700" />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HealthPill({ ok = true }: { ok?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full ${
        ok ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
      }`}
    >
      {ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} {ok ? "سالم" : "نیازمند اقدام"}
    </span>
  );
}

function ConnectorCard({ icon: Icon, title, connected, onAction }: any) {
  return (
    <div className="rounded-2xl border bg-white/70 backdrop-blur-xl p-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl grid place-items-center ${connected ? "bg-green-50 text-green-700" : "bg-orange-50 text-[var(--cta,#FF8A00)]"}`}>
          <Icon size={18} />
        </div>
        <div className="text-sm font-semibold">{title}</div>
      </div>
      <div className="flex items-center gap-2">
        <HealthPill ok={!!connected} />
        <Button
          size="sm"
          variant={connected ? "secondary" : "default"}
          className={connected ? "" : "text-white"}
          style={{ background: connected ? undefined : COLORS.cta }}
          onClick={onAction}
        >
          {connected ? "مدیریت" : "اتصال"}
        </Button>
      </div>
    </div>
  );
}

function KBItem({ name, pct, docs }: { name: string; pct: number; docs: number }) {
  return (
    <div className="rounded-xl border p-3 bg-white/70">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium truncate max-w-[60%]" title={name}>
          {name}
        </div>
        <Badge variant="outline" className="text-[11px]">
          {docs} سند
        </Badge>
      </div>
      <div className="mt-2">
        <Progress value={pct} />
      </div>
      <div className="text-[11px] text-neutral-500 mt-1">ایندکس: {pct}%</div>
    </div>
  );
}

function Modal({ open, onClose, title, children }: any) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border p-4" dir="rtl">
        <div className="flex items-center justify-between pb-2 border-b">
          <div className="text-sm font-bold">{title}</div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            بستن
          </Button>
        </div>
        <div className="pt-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WordPress Guide
function WPGuide({ onCopy }: { onCopy: (s: string) => void }) {
  const snippet = `<script src="https://cdn.begoy.ir/widget.js" data-bot="YOUR_BOT" defer></script>`;
  return (
    <div className="space-y-3 text-sm">
      <div className="text-neutral-700">برای وردپرس دو راه دارید:</div>
      <ol className="list-decimal pr-4 space-y-2 text-neutral-700">
        <li>
          <b>افزونه رسمی وردپرس</b>: افزونه «Begooy Chat Widget» را نصب کنید. سپس در تنظیمات افزونه <code>Bot ID</code> را وارد کنید.
        </li>
        <li>
          <b>کد اسکریپت</b> (سریع): کد زیر را در <code>&lt;head&gt;</code> قالب یا از بخش ابزارک‌ها اضافه کنید:
          <div className="mt-2 p-2 rounded-xl bg-neutral-100 text-[11px] select-all overflow-x-auto">{snippet}</div>
          <div className="flex gap-2">
            <Button size="sm" className="text-white" style={{ background: COLORS.cta }} onClick={() => onCopy(snippet)}>
              <Copy size={14} className="ml-1" />
              کپی کد
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onCopy("YOUR_BOT")}>
              کپی Bot ID
            </Button>
          </div>
        </li>
      </ol>
      <div className="text-[12px] text-neutral-500">پس از نصب، وضعیت کانکتور در کارت‌ها سبز می‌شود.</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Library (Auto Apply with user/bot)
const PROMPTS: Record<string, string> = {
  support: `تو یک دستیار پشتیبانی برای {{brand}} هستی. فقط به فارسی، کوتاه و روشن پاسخ بده. اگر پاسخ دقیق در KB نبود، از کاربر شماره سفارش/راه تماس بگیر و او را به فرم پشتیبانی لینک بده: {{support_link}}. خارج از ساعات کاری: {{working_hours}} را اعلام کن. از ایموجی کم و مناسب استفاده کن.`,
  sales: `تو مشاور فروش {{brand}} هستی. نیاز کاربر را با 2 سؤال کوتاه مشخص کن و سپس حداکثر 3 پیشنهاد مرتبط بده. قیمت، موجودی و مزیت کلیدی را بگو و در پایان CTA بده: «برای ثبت سفارش اینجا کلیک کنید: {{checkout_link}}». از فشار فروشی پرهیز کن.`,
  education: `تو مدرس همراه برای {{brand}} هستی. پاسخ‌ها را مرحله‌به‌مرحله و بر اساس پایگاه دانش ارائه بده. اگر PDF/لینک مرجع وجود دارد، در پایان منبع را با عنوان کوتاه بده. اگر خارج از حوزه بود، بگو «نیاز به منبع جدید دارم».`,
  hr: `تو راهنمای منابع انسانی {{brand}} هستی. فقط سیاست‌ها و فرایندهای داخلی را از KB پاسخ بده. برای موارد حساس (مرخصی خاص/شکایات) کاربر را به فرم HR ارجاع بده: {{hr_form}}.`,
  booking: `تو دستیار رزرو {{brand}} هستی. تاریخ/ساعت مدنظر را بپرس، ظرفیت را بررسی کن (اگر API وصل بود)، و خلاصه رزرو را تکرار و تایید بگیر. در پایان لینک پرداخت: {{pay_link}}.`,
};

function fillTemplate(t: string, ctx: Record<string, string>) {
  return t.replace(/\{\{(\w+)\}\}/g, (_, k) => ctx?.[k] ?? `{{${k}}}`);
}

function PromptLibrary({ userId, botId, onEnsure }: { userId: string | null; botId: string; onEnsure: () => Promise<{ uid: string; botId: string }> }) {
  const [key, setKey] = useState<keyof typeof PROMPTS>("support");
  const [copied, setCopied] = useState(false);
  const [applying, setApplying] = useState(false);
  const [brand, setBrand] = useState("بگوی");
  const [supportLink, setSupportLink] = useState("https://begoy.ir/support");
  const [checkoutLink, setCheckoutLink] = useState("https://begoy.ir/checkout");
  const [workingHours, setWorkingHours] = useState("9 تا 17 (شنبه تا چهارشنبه)");
  const [hrForm, setHrForm] = useState("https://begoy.ir/hr");
  const [payLink, setPayLink] = useState("https://begoy.ir/pay");

  const filled = useMemo(
    () =>
      fillTemplate(PROMPTS[key], {
        brand,
        support_link: supportLink,
        checkout_link: checkoutLink,
        working_hours: workingHours,
        hr_form: hrForm,
        pay_link: payLink,
      }),
    [key, brand, supportLink, checkoutLink, workingHours, hrForm, payLink]
  );

  const copy = async () => {
    await navigator.clipboard.writeText(filled);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const applyToBot = async () => {
    try {
      setApplying(true);
      const { uid, botId: ensuredBotId } = await onEnsure(); // اطمینان از userId و botId
      await postJson("/api/bots/apply-prompt", { botId: ensuredBotId, prompt: filled }, uid);
      alert("✅ پرامپت روی بات اعمال شد");
    } catch (e: any) {
      alert("❌ خطا در اعمال پرامپت: " + (e?.message ?? e));
    } finally {
      setApplying(false);
    }
  };

  const tabs: Array<{ k: keyof typeof PROMPTS; t: string }> = [
    { k: "support", t: "پشتیبانی" },
    { k: "sales", t: "فروش" },
    { k: "education", t: "آموزشی" },
    { k: "hr", t: "منابع انسانی" },
    { k: "booking", t: "رزرو" },
  ];

  return (
    <Card className="backdrop-blur-xl border-white/50 bg-white/70">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">کتابخانه دستورالعمل‌ها (Prompt)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3" dir="rtl">
        <div className="grid grid-cols-5 gap-2">
          {tabs.map((t) => (
            <Button
              key={t.k}
              variant={key === t.k ? "default" : "secondary"}
              className={key === t.k ? "text-white" : ""}
              style={key === t.k ? { background: COLORS.cta } : {}}
              onClick={() => setKey(t.k)}
            >
              {t.t}
            </Button>
          ))}
        </div>

        {/* Variables */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[12px]">
          <input className="border rounded-lg px-2 py-2" placeholder="نام برند" value={brand} onChange={(e) => setBrand(e.target.value)} />
          <input className="border rounded-lg px-2 py-2" placeholder="لینک پشتیبانی" value={supportLink} onChange={(e) => setSupportLink(e.target.value)} />
          <input className="border rounded-lg px-2 py-2" placeholder="لینک ثبت سفارش" value={checkoutLink} onChange={(e) => setCheckoutLink(e.target.value)} />
          <input className="border rounded-lg px-2 py-2" placeholder="ساعات کاری" value={workingHours} onChange={(e) => setWorkingHours(e.target.value)} />
          <input className="border rounded-lg px-2 py-2" placeholder="لینک فرم HR" value={hrForm} onChange={(e) => setHrForm(e.target.value)} />
          <input className="border rounded-lg px-2 py-2" placeholder="لینک پرداخت" value={payLink} onChange={(e) => setPayLink(e.target.value)} />
        </div>

        <div className="rounded-xl border bg-white/70 p-3 text-[12px] leading-7 text-neutral-800 whitespace-pre-wrap min-h-[120px]">{filled}</div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-neutral-500">وضعیت ورود:</span>
            <Badge variant="outline">{userId ? "تأیید شد" : "نامشخص"}</Badge>
            <span className="text-neutral-500">Bot:</span>
            <Badge variant="outline">{botId ? `${botId.slice(0, 8)}…` : "—"}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={copy} className="text-white" style={{ background: COLORS.cta }}>
              {copied ? (
                <>
                  <Check size={14} className="ml-1" />
                  کپی شد
                </>
              ) : (
                <>
                  <Copy size={14} className="ml-1" />
                  کپی متن
                </>
              )}
            </Button>
            <Button onClick={applyToBot} disabled={applying} variant="secondary">
              {applying ? "در حال اعمال..." : "اعمال به بات جاری"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat Test (mini)
function ChatTest() {
  const [msgs, setMsgs] = useState<Array<{ me?: boolean; text: string }>>([
    { text: "سلام! من چت‌بات هوشمند بگوی هستم." },
    { text: "چطور می‌تونم کمک کنم؟" },
  ]);
  const [input, setInput] = useState("");
  const send = () => {
    if (!input.trim()) return;
    setMsgs((m) => [...m, { me: true, text: input }]);
    setInput("");
    setTimeout(() => setMsgs((m) => [...m, { text: "پیام شما دریافت شد ✅" }]), 500);
  };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="rounded-2xl border bg-white/70 p-3 h-[420px] overflow-auto">
        <div className="text-sm font-semibold mb-3">پایگاه‌های دانش متصل</div>
        <div className="space-y-2">
          <KBItem name="Default Knowledge Base" pct={100} docs={42} />
          <KBItem name="FAQ فروشگاه" pct={86} docs={12} />
        </div>
      </div>
      <div className="lg:col-span-2 rounded-2xl border bg-white/70 p-3 flex flex-col h-[420px]">
        <div className="text-sm font-semibold mb-2">گفتگو و تست</div>
        <div className="flex-1 rounded-xl border bg-white p-3 overflow-auto space-y-2">
          {msgs.map((m, i) => (
            <div key={i} className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${m.me ? "ml-auto bg-[var(--brand,#145DEE)] text-white" : "bg-neutral-100"}`}>
              {m.text}
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="اینجا تایپ کنید" className="flex-1 border rounded-xl px-3 py-2" />
          <Button onClick={send} className="text-white" style={{ background: COLORS.brand }}>
            <Send size={14} className="ml-1" />
            ارسال
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup Progress card
function SetupProgress() {
  const router = useRouter();
  const [draft, setDraft] = useState<any | null>(null);
  const step: number = draft?.step ?? 0; // 0..8
  const pct = Math.round((Math.min(step, 8) / 8) * 100);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setDraft(JSON.parse(raw));
    } catch {}
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        try {
          setDraft(e.newValue ? JSON.parse(e.newValue) : null);
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const goWizard = () => router.push("/dashboard/bot-studio");
  const resetDraft = () => {
    localStorage.removeItem(STORAGE_KEY);
    setDraft(null);
  };

  return (
    <Card className="backdrop-blur-xl border-white/50 bg-white/70">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">پیکربندی دستیار (Progress)</CardTitle>
      </CardHeader>
      <CardContent dir="rtl" className="space-y-3">
        {!draft ? (
          <>
            <div className="text-sm">هنوز درفتی وجود ندارد.</div>
            <Progress value={0} />
            <div className="text-[12px] text-neutral-600">از ویزارد ۸ مرحله‌ای شروع کنید.</div>
            <div className="flex gap-2 pt-1">
              <Button className="text-white" style={{ background: COLORS.cta }} onClick={goWizard} aria-label="شروع ویزارد">
                شروع ویزارد
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="text-sm">
              مرحله فعلی: <b>{DRAFT_LABELS[step] || DRAFT_LABELS[0]}</b>
            </div>
            <Progress value={pct} />
            <div className="text-[12px] text-neutral-600">پیشرفت کلی: {pct}%</div>
            <div className="flex gap-2 pt-1">
              <Button className="text-white" style={{ background: COLORS.cta }} onClick={goWizard} aria-label={`ادامه تنظیم از مرحله ${step}`}>
                ادامه تنظیم از مرحله {step}
              </Button>
              <Button variant="secondary" onClick={resetDraft}>
                شروع مجدد
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Knowledge Base section (inline)
function KnowledgeBase() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">لیست پایگاه‌های دانش متصل به این دستیار</div>
        <Button variant="default" className="text-white" style={{ background: COLORS.brand }} onClick={() => alert("متصل کردن پایگاه دانش (Mock)")}>
          <Database size={14} className="ml-1" />
          متصل کردن پایگاه دانش جدید
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <KBItem name="Default Knowledge Base" pct={96} docs={58} />
        <KBItem name="سیاست‌های مرجوعی" pct={100} docs={8} />
      </div>

      <Card className="backdrop-blur-xl border-white/50 bg-white/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">افزودن منبع دانش</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Button variant="secondary" className="h-20 flex-col" onClick={() => alert("متن (Mock)")}>
            <FileText className="mb-1" />
            متن
          </Button>
          <Button variant="secondary" className="h-20 flex-col" onClick={() => alert("فایل (Mock)")}>
            <Upload className="mb-1" />
            فایل متنی
          </Button>
          <Button variant="secondary" className="h-20 flex-col" onClick={() => alert("وب‌سایت (Mock)")}>
            <Globe className="mb-1" />
            وب‌سایت
          </Button>
          <Button variant="secondary" className="h-20 flex-col" onClick={() => alert("Q&A (Mock)")}>
            <MessageSquare className="mb-1" />
            پرسش و پاسخ
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings panel (demo)
function SettingsPanel() {
  const [creativity, setCreativity] = useState(0.2);
  const [detectLang, setDetectLang] = useState(true);
  const [restrictKB, setRestrictKB] = useState(true);
  const [markdown, setMarkdown] = useState(true);
  const [emoji, setEmoji] = useState(false);
  const [showSources, setShowSources] = useState(false);

  return (
    <div className="space-y-4">
      <Card className="backdrop-blur-xl border-white/50 bg-white/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">تنظیمات مدل زبانی</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3" dir="rtl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <select className="border rounded-xl px-3 py-2" aria-label="انتخاب مدل">
              <option>GPT-4o mini (کیفیت خوب/قیمت مناسب)</option>
              <option>GPT-4.1 (کیفیت بالا)</option>
              <option>Begoy Local (آفلاین)</option>
            </select>
            <div className="flex items-center gap-2 text-sm">
              <SlidersHorizontal size={16} /> میزان خلاقیت:
              <input type="range" min={0} max={1} step={0.1} value={creativity} onChange={(e) => setCreativity(parseFloat(e.target.value))} aria-label="میزان خلاقیت" />
              <span className="text-neutral-600 text-xs">{creativity.toFixed(1)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={restrictKB} onChange={() => setRestrictKB(!restrictKB)} /> محدود کردن پاسخ‌دهی فقط به پایگاه‌های دانش
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={markdown} onChange={() => setMarkdown(!markdown)} /> استفاده از Markdown
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={emoji} onChange={() => setEmoji(!emoji)} /> استفاده از ایموجی‌ها
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showSources} onChange={() => setShowSources(!showSources)} /> نمایش منابع در پاسخ
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={detectLang} onChange={() => setDetectLang(!detectLang)} /> تشخیص خودکار زبان
            </label>
          </div>

          <Button variant="secondary">
            <Sparkles size={14} className="ml-1" />
            ذخیره تغییرات
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
export default function OverviewStudio() {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "chat" | "kb" | "settings">("overview");
  const [openWP, setOpenWP] = useState(false);
  const [copied, setCopied] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [botId, setBotId] = useState<string>("");
  const ensuredOnce = useRef(false);

  useEffect(() => {
    (async () => {
      const uid = await getUserIdUnified();
      setUserId(uid);
      // load saved bot if any
      try {
        const b = localStorage.getItem(BOT_ID_KEY);
        if (b) setBotId(b);
      } catch {}
    })();
  }, []);

  // Ensure bot one-time (اگر کاربر لاگین بود و botId نداشت)
  useEffect(() => {
    (async () => {
      if (ensuredOnce.current) return;
      if (!userId) return;
      if (botId) {
        ensuredOnce.current = true;
        return;
      }
      try {
        const ensured = await ensureBotOnServer(userId, { name: "دستیار من" });
        setBotId(ensured);
        try {
          localStorage.setItem(BOT_ID_KEY, ensured);
        } catch {}
      } catch {
        // سکوت؛ کاربر می‌تونه بعداً با اکشن‌های صفحه هم ensure کنه
      } finally {
        ensuredOnce.current = true;
      }
    })();
  }, [userId, botId]);

  const handleCopy = async (s: string) => {
    await navigator.clipboard.writeText(s);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const goWizard = () => router.push("/dashboard/bot-studio");

  // helper برای PromptLibrary
  const ensureForPrompt = async () => {
    let uid = userId || (await getUserIdUnified());
    if (!uid) throw new Error("ابتدا وارد شوید.");
    let currentBotId = botId || localStorage.getItem(BOT_ID_KEY) || "";
    if (!currentBotId) {
      currentBotId = await ensureBotOnServer(uid, { name: "دستیار من" });
      setBotId(currentBotId);
      try {
        localStorage.setItem(BOT_ID_KEY, currentBotId);
      } catch {}
    }
    return { uid, botId: currentBotId };
  };

  return (
    <div className="relative min-h-screen" dir="rtl" style={{ fontFamily: "Vazir, sans-serif" }}>
      {/* BG */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 animate-[wave_14s_ease-in-out_infinite]"
        style={{
          background:
            `radial-gradient(1100px 600px at 110% -10%, #EBF5FF 0%, transparent 55%),` +
            `radial-gradient(1100px 600px at -10% 110%, #F0FDF4 0%, transparent 55%),` +
            `linear-gradient(120deg, #FFF8F0, #F0FDF4, #EBF5FF)`,
        }}
      />
      <style jsx>{`
        @keyframes wave {
          0% { filter: hue-rotate(0deg) }
          50% { filter: hue-rotate(10deg) }
          100% { filter: hue-rotate(0deg) }
        }
      `}</style>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl grid place-items-center text-white shadow-lg" style={{ background: COLORS.brand }}>
              <Bot size={18} />
            </div>
            <div>
              <div className="text-lg font-extrabold">استودیو بات بگوی — نمای کلی</div>
              <div className="text-[12px] text-neutral-600 flex items-center gap-2">
                <Badge variant="outline">{userId ? "ورود تأیید شد ✔︎" : "وارد نشده"}</Badge>
                <Badge variant="outline">{botId ? `Bot: ${botId.slice(0, 8)}…` : "Bot: —"}</Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="gap-1" onClick={() => setTab("settings")} aria-label="رفتن به تنظیمات">
              <Settings size={14} /> تنظیمات
            </Button>
            <Button className="text-white gap-1" style={{ background: COLORS.cta }} onClick={goWizard} aria-label="ادامه ویزارد">
              <Sparkles size={14} /> ادامه ویزارد
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {[
            { k: "overview", t: "نمای کلی" },
            { k: "chat", t: "گفتگو و تست" },
            { k: "kb", t: "پایگاه دانش" },
            { k: "settings", t: "تنظیمات" },
          ].map((tb: any) => (
            <Button
              key={tb.k}
              variant={tab === tb.k ? "default" : "secondary"}
              className={tab === tb.k ? "text-white" : ""}
              style={tab === tb.k ? { background: COLORS.brand } : {}}
              onClick={() => setTab(tb.k)}
              aria-label={`رفتن به تب ${tb.t}`}
            >
              {tb.t}
            </Button>
          ))}
        </div>

        {/* Content */}
        {tab === "overview" && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={Activity} title="پیام‌های امروز" value="1,284" sub="+12% نسبت به دیروز" ring={72} />
              <StatCard icon={Users} title="مخاطبان فعال" value="428" sub="۳۰ روز گذشته" ring={54} />
              <StatCard icon={BarChart3} title="میانگین رضایت (CSAT)" value="4.6/5" sub="از 210 رأی" ring={92} />
              <StatCard icon={Gauge} title="سلامت سیستم" value={<HealthPill ok />} sub="وب‌هوک‌ها پایدارند" ring={88} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Setup progress + Connectors */}
              <div className="lg:col-span-2 space-y-6">
                <SetupProgress />

                <Card className="backdrop-blur-xl border-white/50 bg-white/70">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">کانال‌ها و اتصال‌ها</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <ConnectorCard icon={MessageSquare} title="تلگرام" connected onAction={goWizard} />
                      <ConnectorCard icon={Globe} title="وب‌چت" connected onAction={goWizard} />
                      <ConnectorCard icon={Instagram} title="اینستاگرام" connected={false} onAction={() => alert("Instagram: به زودی (Mock)")} />
                      <ConnectorCard icon={Phone} title="واتساپ" connected={false} onAction={() => alert("WhatsApp: به زودی (Mock)")} />
                      <ConnectorCard icon={Puzzle} title="افزونه وردپرس" connected={false} onAction={() => setOpenWP(true)} />
                    </div>
                    <div className="text-[12px] text-neutral-500">پس از اتصال، وضعیت سلامت هر کانال به‌صورت زنده گزارش می‌شود.</div>
                  </CardContent>
                </Card>
              </div>

              {/* Right: Quick actions */}
              <Card className="backdrop-blur-xl border-white/50 bg-white/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">اقدام‌های سریع</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-2">
                  <Button variant="secondary" className="justify-between" onClick={() => setOpenWP(true)}>
                    <div className="flex items-center gap-2">
                      <Puzzle size={16} /> افزونه وردپرس
                    </div>
                    <Send size={14} />
                  </Button>
                  <Button variant="secondary" className="justify-between" onClick={goWizard}>
                    <div className="flex items-center gap-2">
                      <LinkIcon size={16} /> اتصال تلگرام
                    </div>
                    <Send size={14} />
                  </Button>
                  <Button variant="secondary" className="justify-between" onClick={() => alert("Upload KB (Mock)")}>
                    <div className="flex items-center gap-2">
                      <Upload size={16} /> افزودن فایل دانش
                    </div>
                    <BookOpen size={14} />
                  </Button>
                  <Button variant="secondary" className="justify-between" onClick={() => setTab("chat")}>
                    <div className="flex items-center gap-2">
                      <MessageSquare size={16} /> تست سریع گفتگو
                    </div>
                    <Sparkles size={14} />
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="backdrop-blur-xl border-white/50 bg-white/70 lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">پایگاه‌های دانش</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <KBItem name="Default Knowledge Base" pct={86} docs={42} />
                  <KBItem name="قوانین مرجوعی فروشگاه" pct={100} docs={8} />
                  <KBItem name="سؤالات متداول لندینگ" pct={64} docs={15} />
                </CardContent>
              </Card>

              <Card className="backdrop-blur-xl border-white/50 bg-white/70">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">فعالیت اخیر</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="truncate">آپلود «FAQ.pdf»</div>
                    <Badge variant="outline">دانش</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="truncate">اتصال موفق وب‌هوک تلگرام</div>
                    <Badge className="bg-green-100 text-green-700" variant="secondary">
                      سیستم
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="truncate">افزودن پاسخ آماده: «پیگیری سفارش»</div>
                    <Badge variant="outline">پیکربندی</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Prompt Library inline — با اعمال خودکار */}
            <PromptLibrary
              userId={userId}
              botId={botId}
              onEnsure={async () => {
                const uid = userId || (await getUserIdUnified());
                if (!uid) throw new Error("ابتدا وارد شوید.");
                let currentBotId = botId || localStorage.getItem(BOT_ID_KEY) || "";
                if (!currentBotId) {
                  currentBotId = await ensureBotOnServer(uid, { name: "دستیار من" });
                  setBotId(currentBotId);
                  try {
                    localStorage.setItem(BOT_ID_KEY, currentBotId);
                  } catch {}
                }
                return { uid, botId: currentBotId };
              }}
            />
          </>
        )}

        {tab === "chat" && <ChatTest />}
        {tab === "kb" && <KnowledgeBase />}
        {tab === "settings" && <SettingsPanel />}
      </div>

      {/* Coach */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="fixed bottom-4 left-4 z-40" dir="rtl">
        <div className="flex items-center gap-3 p-3 rounded-2xl shadow-xl border bg-white/80 backdrop-blur-xl">
          <div className="w-9 h-9 rounded-2xl grid place-items-center text-white" style={{ background: COLORS.cta }}>
            <Bot size={18} />
          </div>
          <div className="text-xs leading-6 text-neutral-800">اگر هنوز تنظیمات کامل نیست، از «ادامه ویزارد» بالای صفحه شروع کن ✨</div>
        </div>
      </motion.div>

      {/* MODALS */}
      <Modal open={openWP} onClose={() => setOpenWP(false)} title="نصب افزونه وردپرس">
        <div className="flex items-center gap-2 text-[12px] text-neutral-600">
          <Puzzle size={16} /> بگوی — WordPress Plugin
        </div>
        <WPGuide onCopy={handleCopy} />
        {copied && (
          <div className="inline-flex items-center gap-1 text-[12px] text-green-700">
            <Check size={14} /> کپی شد.
          </div>
        )}
      </Modal>
    </div>
  );
}
