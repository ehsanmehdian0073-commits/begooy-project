// app/(dashboard)/dashboard/bot-studio/page.tsx
"use client";

/**
 * BegoyWizardV2 — ویزارد تمیز و فشرده‌شده
 * - Skeleton هنگام هیدریشن (دیگه صفحه‌ی خالی نمی‌مونه)
 * - Layout فشرده + container وسط‌چین
 * - Coach پایینِ وسط، بیرون از مسیر دکمه‌های چسبان
 * - اسکرول به بالا در تغییر مرحله
 * - Auth یکپارچه + ensureBot خودکار
 */

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Sparkles, Play, Check, ChevronLeft, ChevronRight, Link as LinkIcon, Upload, FileText, BookOpen, Globe,
  Phone, MessageSquare, ShieldCheck, Zap, Image as ImageIcon, Copy, CheckCircle2, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

import { buildPrompt, validateVars, getRequiredVarsForTemplate } from "@/lib/promptLibrary";
import { createClient } from "@supabase/supabase-js";

const supabaseClient = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (typeof window !== "undefined" && url && anon) {
    return createClient(url, anon, { auth: { persistSession: true } });
  }
  return null;
})();

const COLORS = {
  cta: "#FF8A00",
  trust: "#2563EB",
  success: "#22C55E",
  bgFrom: "#FFF8F0",
  bgVia: "#F0FDF4",
  bgTo: "#EBF5FF",
};

// ───────────────────────────────────────────────────────────────────────────────
// Types / State
type Industry = "aesthetics" | "dentistry" | "ecommerce" | "industrial" | "education" | "general";
type TemplateKey = "support" | "sales" | "education" | "booking" | "hr";

interface KBRef { type: "file" | "url" | "text" | "csv"; value: string; }
interface WizardState {
  step: number; setStep: (n: number) => void;
  magicUrl: string; setMagicUrl: (v: string) => void;
  autoDetected: boolean;

  template: TemplateKey; setTemplate: (t: TemplateKey) => void;
  industry: Industry; setIndustry: (v: Industry) => void;

  name: string; setName: (v: string) => void;
  avatarUrl?: string; setAvatarUrl: (v?: string) => void;

  channels: string[]; setChannels: React.Dispatch<React.SetStateAction<string[]>>;
  kb: KBRef[]; setKb: React.Dispatch<React.SetStateAction<KBRef[]>>;

  tone: "retail" | "support" | "edu"; setTone: (v: "retail"|"support"|"edu") => void;
  vars: Record<string, string>; setVars: React.Dispatch<React.SetStateAction<Record<string,string>>>;

  userId: string | null; setUserId: (v: string | null) => void;
  botId: string; setBotId: (v: string) => void;

  saving: boolean; setSaving: (b: boolean) => void;
  loadingMagic: boolean; setLoadingMagic: (b: boolean) => void;
}

const WizardCtx = createContext<WizardState | null>(null);
const useWizard = () => useContext(WizardCtx)!;

const STORAGE_KEY = "begoy_wizard_draft_v2";
const BOT_ID_KEY = "begoy_active_bot_id";

function debounce<T extends (...args: any[]) => void>(fn: T, wait = 400) {
  let t: any; return (...args: Parameters<T>) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

// ───────────────────────────────────────────────────────────────────────────────
// Utilities

async function getUserIdUnified(): Promise<string|null> {
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
  try { json = await res.json(); } catch {}
  if (!res.ok || !json?.ok) {
    const msg = json?.details ? `${json?.error ?? "request_failed"} — ${json.details}` : (json?.error ?? `request_failed_${res.status}`);
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

// ───────────────────────────────────────────────────────────────────────────────
// Small building blocks

const StepShell: React.FC<React.PropsWithChildren<{ title: string; icon?: React.ReactNode }>> = ({ title, icon, children }) => (
  <Card className="backdrop-blur-xl bg-white/70 border-white/40 shadow-xl rounded-2xl">
    <CardHeader className="py-3">
      <CardTitle className="flex items-center gap-2 text-right text-base md:text-lg">
        {icon}<span className="font-bold">{title}</span>
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4 pb-4">{children}</CardContent>
  </Card>
);

const CircleStep = ({ n, active, done, label }: { n: number; active: boolean; done: boolean; label: string }) => (
  <div className="flex flex-col items-center w-16">
    <div className={`relative grid place-items-center w-9 h-9 rounded-full border transition-all ${done ? "bg-green-500 text-white border-green-500" : active ? "bg-[var(--cta,#FF8A00)] text-white border-transparent" : "bg-white text-neutral-700 border-white/60"}`}>
      {done ? <Check size={14} /> : n}
      <div className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-7 h-[3px] rounded-full ${active ? "bg-[var(--cta,#FF8A00)]" : "bg-transparent"}`} />
    </div>
    <div className={`mt-2 text-[10px] text-center ${active ? "text-neutral-900" : "text-neutral-600"}`}>{label}</div>
  </div>
);

const HealthPill = ({ ok = true }: { ok?: boolean }) => (
  <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full ${ok ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
    {ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} {ok ? "سالم" : "نیازمند اقدام"}
  </span>
);

const PhonePreview = ({ msgs }: { msgs: Array<{ who: "user" | "bot"; text: string }> }) => (
  <div className="relative w-full max-w-xs mx-auto rounded-[2rem] p-4 border bg-white/80 backdrop-blur-xl shadow-lg">
    <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-28 h-6 rounded-b-3xl bg-neutral-200" />
    <div className="space-y-3 min-h-[320px]">
      {msgs.map((m, i) => (
        <div key={i} className={`max-w-[80%] text-[12px] p-3 rounded-2xl ${m.who === "user" ? "ml-auto bg-white border" : "mr-auto bg-green-50 border border-green-200"}`}>{m.text}</div>
      ))}
    </div>
  </div>
);

const ChannelCard = ({ icon: Icon, title, selected, onToggle }: any) => (
  <button onClick={onToggle}
    className={`text-right rounded-xl p-4 border transition shadow-sm hover:shadow-md backdrop-blur-xl
    ${selected ? "bg-white/90 border-[var(--cta,#FF8A00)]" : "bg-white/70 border-white/50"}`}>
    <div className="flex items-center gap-3">
      <div className={`w-8 h-8 grid place-items-center rounded-lg ${selected ? "bg-[var(--cta,#FF8A00)] text-white" : "bg-orange-50 text-[var(--cta,#FF8A00)]"}`}><Icon size={16} /></div>
      <div className="font-semibold text-sm">{title}</div>
    </div>
  </button>
);

// Skeletons (برای جلوگیری از صفحه خالی)
const Skeleton = ({ h = 14 }: { h?: number }) => (
  <div className="animate-pulse rounded-xl bg-neutral-200/60" style={{ height: h }} />
);

const PageSkeleton = () => (
  <div className="max-w-[1100px] mx-auto px-3 md:px-4 py-4 space-y-3">
    <Skeleton h={36} />
    <Skeleton h={140} />
    <Skeleton h={240} />
    <Skeleton h={80} />
  </div>
);

// ───────────────────────────────────────────────────────────────────────────────
// Steps (0..8)

const Step0Magic = () => {
  const { magicUrl, setMagicUrl, setTemplate, setIndustry, setVars, setName, setChannels, setStep, loadingMagic, setLoadingMagic } = useWizard();

  const runMagic = async () => {
    if (!magicUrl.trim()) return;
    try {
      setLoadingMagic(true);
      const res = await fetch("/api/magic/auto-detect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: magicUrl }) });
      let data: any = null;
      try { data = await res.json(); } catch {}

      const guessIndustry: Industry =
        data?.industry ??
        ((magicUrl.includes("clinic") || magicUrl.includes("beauty")) ? "aesthetics"
          : magicUrl.includes("dent") ? "dentistry"
          : magicUrl.includes("shop") || magicUrl.includes("store") ? "ecommerce"
          : magicUrl.includes("industrial") || magicUrl.includes("factory") ? "industrial"
          : "general");

      const brand = data?.brand || (magicUrl.replace(/https?:\/\/(www\.)?/, "").split(/[\/?#]/)[0] || "بگوی").replace(/\.\w+$/, "");
      setName(data?.brand ?? brand);
      setIndustry(guessIndustry);
      setTemplate((guessIndustry === "ecommerce") ? "sales" : (guessIndustry === "education" ? "education" : "support"));
      setChannels((prev) => Array.from(new Set([...(prev||[]), "webchat", ...(magicUrl.includes("instagram.com") ? ["instagram"] : [])])));
      setVars((prev) => ({
        ...prev,
        brand: data?.vars?.brand ?? brand,
        support_link: data?.vars?.support_link ?? (magicUrl.includes("http") ? magicUrl : `https://${brand}.ir/contact`),
        working_hours: data?.vars?.working_hours ?? "9 تا 18",
        clinic_address: data?.vars?.clinic_address ?? "",
        whatsapp_number: data?.vars?.whatsapp_number ?? "",
        price_list_url: data?.vars?.price_list_url ?? "",
        catalog_url: data?.vars?.catalog_url ?? ""
      }));
      setStep(1);
    } finally {
      setLoadingMagic(false);
    }
  };

  return (
    <StepShell title="شروع سریع (Magic ✨)" icon={<Sparkles size={18} className="text-[var(--cta,#FF8A00)]" />}>
      <div className="grid md:grid-cols-2 gap-6" dir="rtl">
        <div className="space-y-2">
          <Label className="text-sm">آدرس وب‌سایت یا شبکه اجتماعی</Label>
          <div className="flex gap-2">
            <Input value={magicUrl} onChange={(e) => setMagicUrl(e.target.value)} placeholder="https://example.com یا https://instagram.com/brand" className="flex-1" />
            <Button className="text-white" style={{ background: COLORS.cta }} onClick={runMagic} disabled={loadingMagic}>
              {loadingMagic ? "در حال بررسی..." : "تشخیص خودکار"}
            </Button>
          </div>
          <div className="text-[12px] text-neutral-600">
            با وارد کردن آدرس، نام برند، صنعت، لینک‌های مفید و بخشی از تنظیمات به‌صورت خودکار پر می‌شود. (همه‌چیز قابل ویرایش است)
          </div>
        </div>
        <PhonePreview msgs={[
          { who: "bot", text: "سلام! برای شروع آدرس سایت یا پیجت رو بده تا تنظیمات اولیه رو برات پر کنم ✨" },
          { who: "user", text: "clinicbeauty.ir" },
          { who: "bot", text: "به نظر میاد حوزه‌ات «کلینیک زیبایی» هست. ادامه بدیم؟" }
        ]} />
      </div>
    </StepShell>
  );
};

const Step1 = () => {
  const { template, setTemplate, industry, setIndustry } = useWizard();
  return (
    <StepShell title="هدف و قالب دستیار + صنعت" icon={<Sparkles size={18} className="text-[var(--cta,#FF8A00)]" />}>
      <div className="grid md:grid-cols-2 gap-6" dir="rtl">
        <div className="space-y-3">
          <Label className="text-sm">قالب دستیار</Label>
          <div className="grid grid-cols-5 gap-1">
            {(["support","sales","education","booking","hr"] as TemplateKey[]).map((v) => (
              <Button key={v} variant={template===v?"default":"secondary"} className={template===v?"text-white":""} style={template===v?{background:COLORS.cta}:{}} onClick={()=>setTemplate(v)}>
                {v==="support"?"پشتیبانی":v==="sales"?"فروش":v==="education"?"آموزشی":v==="booking"?"رزرو":"منابع انسانی"}
              </Button>
            ))}
          </div>

          <Label className="text-sm mt-2">حوزه فعالیت (صنعت)</Label>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {([
              ["aesthetics","کلینیک زیبایی"],["dentistry","دندان‌پزشکی"],["ecommerce","فروشگاه آنلاین"],["industrial","صنعتی/B2B"],["education","آموزشی"],["general","عمومی/شرکتی"]
            ] as Array<[Industry,string]>).map(([k, t]) => (
              <Button key={k} variant={industry===k?"default":"secondary"} className={industry===k?"text-white":""} style={industry===k?{background:COLORS.cta}:{}} onClick={()=>setIndustry(k as Industry)}>{t}</Button>
            ))}
          </div>
        </div>
        <PhonePreview msgs={[{ who:"bot", text:"قالب و صنعت را انتخاب کن تا پیشنهادها بر اساس کسب‌وکارت تنظیم شوند." }]} />
      </div>
    </StepShell>
  );
};

const Step2 = () => {
  const { name, setName, avatarUrl, setAvatarUrl } = useWizard();
  return (
    <StepShell title="نام و آواتار دستیار" icon={<Bot size={18} className="text-[var(--cta,#FF8A00)]" />}>
      <div className="grid md:grid-cols-2 gap-6" dir="rtl">
        <div className="space-y-2">
          <Label className="text-sm">نام دستیار</Label>
          <Input value={name} onChange={(e)=>setName(e.target.value)} placeholder="مثلاً: دستیار فروش بگوی" className="focus:ring-2 focus:ring-[var(--cta,#FF8A00)]/30"/>
          <Label className="text-sm mt-1">آواتار</Label>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-neutral-100 rounded-xl grid place-items-center overflow-hidden">
              {avatarUrl ? <img src={avatarUrl} alt="avatar" className="w-12 h-12 object-cover rounded-xl"/> : <ImageIcon size={18}/>}
            </div>
            <Button variant="secondary" onClick={()=>alert("Upload: POST /api/bots/upload-avatar (Mock)")}>آپلود</Button>
          </div>
        </div>
        <PhonePreview msgs={[{ who:"user", text:"سلام!" }, { who:"bot", text:`من ${name || "دستیار هوشمند"} هستم؛ آماده‌ام 🤖✨`}]} />
      </div>
    </StepShell>
  );
};

const Step3 = () => {
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [ok, setOk] = useState(false);

  const setWebhook = async () => {
    try {
      const res = await fetch("/api/webhooks/telegram/set", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ token, secret })});
      setOk(res.ok);
      alert(res.ok ? "✅ وب‌هوک ثبت شد" : "❌ خطا در ثبت وب‌هوک");
    } catch { alert("❌ ارتباط برقرار نشد (Mock)"); }
  };

  return (
    <StepShell title="اتصال تلگرام" icon={<MessageSquare size={18} className="text-[var(--cta,#FF8A00)]" />}>
      <div className="grid md:grid-cols-2 gap-6" dir="rtl">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm"><span>وضعیت:</span> <HealthPill ok={ok}/></div>
          <Label className="text-sm">توکن BotFather</Label>
          <Input value={token} onChange={(e)=>setToken(e.target.value)} placeholder="123456:ABC-DEF..." />
          <Label className="text-sm">Webhook Secret</Label>
          <Input value={secret} onChange={(e)=>setSecret(e.target.value)} placeholder="توکن محرمانه برای تایید وب‌هوک" />
          <div className="flex gap-2">
            <Button className="text-white" style={{background:COLORS.cta}} onClick={setWebhook}>ثبت وب‌هوک</Button>
            <Button variant="secondary" onClick={()=>alert("پیام تست ارسال شد (Mock)")}>ارسال تست</Button>
          </div>
          <div className="text-[11px] text-neutral-600">Webhook URL: <code className="select-all">/api/webhooks/telegram?secret=****</code></div>
        </div>
        <PhonePreview msgs={[{ who:"bot", text:"به تلگرام خوش آمدید! پیام تست را برای بررسی اتصال می‌فرستم." }]}/>
      </div>
    </StepShell>
  );
};

const Step4 = () => {
  const { channels, setChannels } = useWizard();
  const toggle = (c: string) => setChannels(channels.includes(c) ? channels.filter(x => x !== c) : [...channels, c]);

  return (
    <StepShell title="سایر کانال‌ها" icon={<LinkIcon size={18} className="text-[var(--cta,#FF8A00)]" />}>
      <div className="grid md:grid-cols-3 gap-3" dir="rtl">
        <ChannelCard icon={Globe} title="وب‌چت" selected={channels.includes("webchat")} onToggle={()=>toggle("webchat")} />
        <ChannelCard icon={Phone} title="واتساپ" selected={channels.includes("whatsapp")} onToggle={()=>toggle("whatsapp")} />
        <ChannelCard icon={MessageSquare} title="اینستاگرام" selected={channels.includes("instagram")} onToggle={()=>toggle("instagram")} />
      </div>
      <div className="text-[12px] text-neutral-600 mt-2">راهنمای اتصال هر کانال بعد از انتشار در داشبورد در دسترس است.</div>
    </StepShell>
  );
};

const Step5 = () => {
  const { kb, setKb, industry } = useWizard();
  const add = (type: KBRef["type"]) => {
    const value = type === "url" ? "https://example.com/faq" : type === "text" ? "سؤالات متداول" : type === "csv" ? "products.csv" : "FAQ.pdf";
    setKb([...kb, { type, value }]);
  };
  const industrySuggestions: Record<Industry, string[]> = {
    ecommerce: ["سیاست مرجوعی", "ارسال و پرداخت", "CSV محصولات"],
    industrial: ["کاتالوگ فنی", "MOQ / Lead Time", "شرایط فروش"],
    aesthetics: ["لیست خدمات و تعرفه", "مراقبت قبل/بعد", "رزرو"],
    dentistry: ["خدمات دندان‌پزشکی", "تعرفه تقریبی", "نکات مراجعه"],
    education: ["سیلابس دوره", "قوانین ثبت‌نام", "راهنمای دانشجو"],
    general: ["درباره ما", "راه‌های تماس", "سؤالات متداول"]
  };

  return (
    <StepShell title="پایگاه دانش" icon={<BookOpen size={18} className="text-[var(--cta,#FF8A00)]" />}>
      <div className="grid md:grid-cols-2 gap-6" dir="rtl">
        <div className="space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Button variant="secondary" className="h-10 gap-2" onClick={()=>add("file")}><Upload size={16}/>فایل</Button>
            <Button variant="secondary" className="h-10 gap-2" onClick={()=>add("url")}><Globe size={16}/>لینک</Button>
            <Button variant="secondary" className="h-10 gap-2" onClick={()=>add("text")}><FileText size={16}/>متن</Button>
            <Button variant="secondary" className="h-10 gap-2" onClick={()=>add("csv")}><Zap size={16}/>CSV</Button>
          </div>
          <div className="rounded-xl border bg-white/70 p-3 space-y-2">
            {kb.length === 0 && <div className="text-[12px] text-neutral-500">منبعی اضافه نشده است.</div>}
            {kb.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="truncate max-w-[70%]">
                  <span className="px-2 py-0.5 mr-2 text-[10px] rounded-full bg-neutral-100 border">{r.type}</span>{r.value}
                </div>
                <Button size="sm" variant="ghost" onClick={()=>setKb(kb.filter((_, idx)=> idx !== i))}>حذف</Button>
              </div>
            ))}
          </div>
          <div className="text-[12px] text-neutral-600">
            پیشنهادها برای {industry}: {" "}{(industrySuggestions[industry] ?? []).join("، ")}
          </div>
        </div>
        <PhonePreview msgs={[{ who:"user", text:"شرایط مرجوعی چیه؟" }, { who:"bot", text:"پاسخ از KB: مرجوعی تا ۷ روز ممکن است." }]} />
      </div>
    </StepShell>
  );
};

const Step6 = () => {
  const { template, vars, setVars, industry, userId, botId, setBotId, name } = useWizard();
  const [applying, setApplying] = useState(false);

  const requiredVars = useMemo(() => getRequiredVarsForTemplate(template), [template]);
  const missing = useMemo(() => validateVars(template as any, vars as any), [template, vars]);
  const filled = useMemo(() => buildPrompt(industry as any, template as any, vars), [industry, template, vars]);

  const ensureBot = async () => {
    let uid = userId || await getUserIdUnified();
    if (!uid) throw new Error("ابتدا وارد شوید.");
    if (!botId) {
      const ensuredId = await ensureBotOnServer(uid, { name, template, industry });
      setBotId(ensuredId);
      try { localStorage.setItem(BOT_ID_KEY, ensuredId); } catch {}
    }
    return { uid, finalBotId: localStorage.getItem(BOT_ID_KEY) || botId };
  };

  const applyToBot = async () => {
    try {
      setApplying(true);
      const { uid, finalBotId } = await ensureBot();
      if (!finalBotId) throw new Error("botId نامشخص است.");
      if (missing.length > 0) return alert("برخی متغیرهای ضروری پر نشده‌اند:\n- " + missing.join("\n- "));
      await postJson("/api/bots/apply-prompt", { botId: finalBotId, prompt: filled }, uid!);
      alert("✅ پرامپت روی بات اعمال شد");
    } catch (e: any) {
      alert("❌ خطا در اعمال پرامپت: " + (e?.message ?? e));
    } finally { setApplying(false); }
  };

  useEffect(() => {
    setVars((prev) => ({
      brand: prev.brand ?? "بگوی",
      support_link: prev.support_link ?? "https://example.com/support",
      working_hours: prev.working_hours ?? "9 تا 18",
      checkout_link: prev.checkout_link ?? (industry === "ecommerce" ? "https://example.com/checkout" : ""),
      booking_link: prev.booking_link ?? ((industry === "aesthetics" || industry==="dentistry") ? "https://example.com/booking" : ""),
      hr_form: prev.hr_form ?? "",
      ...prev,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [industry]);

  return (
    <StepShell title="دستورالعمل و متغیرها (Prompt)" icon={<ShieldCheck size={18} className="text-[var(--cta,#FF8A00)]" />}>
      <div className="space-y-3" dir="rtl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[12px]">
          {Object.entries({
            brand: "نام برند", support_link: "لینک پشتیبانی", working_hours: "ساعات کاری",
            checkout_link: "لینک پرداخت/ثبت سفارش", booking_link: "لینک رزرو", hr_form: "فرم HR"
          }).map(([k, ph]) => (
            <input key={k} className="border rounded-xl px-2 py-2" placeholder={ph} value={vars[k] || ""} onChange={(e)=>setVars(p=>({ ...p, [k]: e.target.value }))}/>
          ))}
        </div>

        <div className="text-[12px]">
          <span className="font-semibold">متغیرهای ضروری برای قالب انتخاب‌شده:</span>{" "}
          {requiredVars.length>0 ? requiredVars.join("، ") : "—"}
          {missing.length>0 && (
            <div className="mt-1 text-red-600">
              لازم است قبل از اعمال، این موارد را پر کنید: {missing.join("، ")}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white/70 p-3 text-[12px] leading-7 text-neutral-800 whitespace-pre-wrap min-h-[120px]">
          {filled}
        </div>
        <div className="flex items-center gap-2">
          <Button className="text-white" style={{background:COLORS.cta}} onClick={()=>navigator.clipboard.writeText(filled)}><Copy size={14} className="ml-1"/>کپی متن</Button>
          <Button variant="secondary" disabled={applying} onClick={applyToBot}>{applying ? "در حال اعمال..." : "اعمال به بات"}</Button>
        </div>
      </div>
    </StepShell>
  );
};

const Step7 = () => {
  const [msgs, setMsgs] = useState<Array<{ me?: boolean; text: string }>>([
    { text: "سلام! من چت‌بات هوشمند بگوی هستم." },{ text: "چطور می‌تونم کمک کنم؟" },
  ]);
  const [input, setInput] = useState("");
  const send = () => {
    if (!input.trim()) return;
    setMsgs(m=>[...m, { me:true, text: input }]);
    setInput("");
    setTimeout(()=> setMsgs(m=>[...m, { text: "پاسخ نمونه بر اساس KB/Prompt ✅" }]), 400);
  };
  return (
    <StepShell title="تست گفتگو" icon={<MessageSquare size={18} className="text-[var(--cta,#FF8A00)]" />}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border bg-white/70 p-3 h-[380px] overflow-auto">
          <div className="text-sm font-semibold mb-2">پایگاه‌های دانش متصل</div>
          <div className="space-y-2">
            <div className="rounded-xl border p-3 bg-white/70">
              <div className="text-sm font-medium">Default KB</div>
              <Progress value={100}/><div className="text-[11px] mt-1 text-neutral-500">ایندکس: 100%</div>
            </div>
          </div>
        </div>
        <div className="lg:col-span-2 rounded-2xl border bg-white/70 p-3 flex flex-col h-[380px]">
          <div className="text-sm font-semibold mb-2">گفتگو و تست</div>
          <div className="flex-1 rounded-xl border bg-white p-3 overflow-auto space-y-2">
            {msgs.map((m, i) => (
              <div key={i} className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${m.me ? "ml-auto bg-[var(--brand,#145DEE)] text-white" : "bg-neutral-100"}`}>{m.text}</div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input value={input} onChange={(e)=>setInput(e.target.value)} placeholder="اینجا تایپ کنید" className="flex-1 border rounded-xl px-3 py-2 focus:ring-2 focus:ring-[var(--cta,#FF8A00)]/30" />
            <Button onClick={send} className="text-white" style={{background:COLORS.trust}}>ارسال</Button>
          </div>
        </div>
      </div>
    </StepShell>
  );
};

const Step8 = () => {
  const { name, channels, kb, userId, botId, template, industry, vars, tone, setSaving, setUserId, setBotId } = useWizard();
  const ready = channels.length>0 && kb.length>0;

  const publish = async () => {
    try {
      setSaving(true);
      let uid = userId || await getUserIdUnified();
      if (!uid) throw new Error("ابتدا وارد شوید.");
      setUserId(uid);

      let currentBotId = botId || localStorage.getItem(BOT_ID_KEY) || "";
      if (!currentBotId) {
        currentBotId = await ensureBotOnServer(uid, { name, template, industry });
        setBotId(currentBotId);
        try { localStorage.setItem(BOT_ID_KEY, currentBotId); } catch {}
      }

      const settings = { template, industry, name, tone, channels, kb, vars };
      await postJson("/api/bots/save-settings", { botId: currentBotId, settings }, uid);
      alert("✅ تنظیمات ذخیره شد و دستیار آماده است");
    } catch (e: any) {
      alert("❌ خطا در ذخیره تنظیمات: " + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <StepShell title="خلاصه و انتشار" icon={<Play size={18} className="text-[var(--cta,#FF8A00)]" />}>
      <div className="grid md:grid-cols-2 gap-6" dir="rtl">
        <PhonePreview msgs={[{ who:"user", text:"سلام!" }, { who:"bot", text:`من ${name} هستم؛ آماده‌ام 🤖✨`}]} />
        <div className="space-y-3">
          <div className="rounded-2xl border bg-white/70 p-4">
            <div className="text-sm font-semibold mb-2">چک‌لیست انتشار</div>
            <ul className="text-[12px] leading-7">
              <li>کانال‌ها: <b>{channels.length}</b> انتخاب شده</li>
              <li>منابع دانش: <b>{kb.length}</b> مورد</li>
              <li>وب‌چت: کد نصب آماده کپی</li>
            </ul>
          </div>
          <div className="text-[11px] text-neutral-600">کد وب‌چت را در سایت خود قرار دهید:</div>
          <div className="p-2 rounded-xl bg-neutral-100 text-[11px] select-all overflow-x-auto">{`<script src="https://cdn.begoy.ir/widget.js" data-bot="${encodeURIComponent(name)}" defer></script>`}</div>
          <Button className="w-full h-10 text-white" style={{background:COLORS.cta}} disabled={!ready} onClick={publish}>انتشار / ذخیره تنظیمات</Button>
          {!ready && <div className="text-[11px] text-red-600">برای انتشار، حداقل یک کانال و یک منبع دانش لازم است.</div>}
        </div>
      </div>
    </StepShell>
  );
};

// ───────────────────────────────────────────────────────────────────────────────
// Main component
export default function BegoyWizardV2() {
  const [hydrated, setHydrated] = useState(false); // جلوگیری از صفحه خالی
  const [step, setStep] = useState(0);
  const [magicUrl, setMagicUrl] = useState("");
  const [template, setTemplate] = useState<TemplateKey>("support");
  const [industry, setIndustry] = useState<Industry>("general");

  const [name, setName] = useState("دستیار هوشمند");
  const [avatarUrl, setAvatarUrl] = useState<string|undefined>(undefined);

  const [channels, setChannels] = useState<string[]>(["webchat"]);
  const [kb, setKb] = useState<KBRef[]>([]);
  const [tone, setTone] = useState<"retail"|"support"|"edu">("support");

  const [vars, setVars] = useState<Record<string,string>>({});
  const [saving, setSaving] = useState(false);
  const [loadingMagic, setLoadingMagic] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [botId, setBotId] = useState<string>("");

  const ensuredOnce = useRef(false);

  // Hydration guard + اسکرول به بالا روی تغییر مرحله
  useEffect(() => { setHydrated(true); }, []);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [step]);

  // Draft load
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        setStep(d.step ?? 0); setMagicUrl(d.magicUrl ?? "");
        setTemplate(d.template ?? "support"); setIndustry(d.industry ?? "general");
        setName(d.name ?? "دستیار هوشمند"); setAvatarUrl(d.avatarUrl ?? undefined);
        setChannels(d.channels ?? ["webchat"]); setKb(d.kb ?? []);
        setTone(d.tone ?? "support"); setVars(d.vars ?? {});
      }
    } catch {}
    try {
      const b = localStorage.getItem(BOT_ID_KEY);
      if (b) setBotId(b);
    } catch {}
  }, []);

  // Auth unified
  useEffect(() => {
    (async () => { setUserId(await getUserIdUnified()); })();
  }, []);

  // ensureBot یک‌بار پس از ورود
  useEffect(() => {
    (async () => {
      if (ensuredOnce.current) return;
      if (!userId) return;
      if (botId) { ensuredOnce.current = true; return; }
      try {
        const ensuredId = await ensureBotOnServer(userId, { name, template, industry });
        setBotId(ensuredId);
        try { localStorage.setItem(BOT_ID_KEY, ensuredId); } catch {}
      } catch {
        // سکوت؛ بعداً هم می‌شود ensure کرد
      } finally {
        ensuredOnce.current = true;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Draft save
  const saveDraft = useMemo(() => debounce((state: any) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, 450), []);
  useEffect(() => { saveDraft({ step, magicUrl, template, industry, name, avatarUrl, channels, kb, tone, vars }); },
    [step, magicUrl, template, industry, name, avatarUrl, channels, kb, tone, vars, saveDraft]);

  const context: WizardState = {
    step, setStep,
    magicUrl, setMagicUrl, autoDetected: !!magicUrl,
    template, setTemplate, industry, setIndustry,
    name, setName, avatarUrl, setAvatarUrl,
    channels, setChannels, kb, setKb,
    tone, setTone,
    vars, setVars,
    userId, setUserId,
    botId, setBotId,
    saving, setSaving, loadingMagic, setLoadingMagic
  };

  const labels = ["شروع جادویی", "قالب/صنعت", "نام/آواتار", "تلگرام", "کانال‌ها", "دانش", "پرامپت", "تست", "انتشار"];
  const totalSteps = labels.length;
  const progress = useMemo(() => step * (100 / (totalSteps - 1)), [step, totalSteps]);

  const canNext =
    (step === 0 && true) ||
    (step === 1 && !!template) ||
    (step === 2 && name.trim().length >= 3) ||
    (step === 3 && true) ||
    (step === 4 && channels.length > 0) ||
    (step === 5 && kb.length >= 0) ||
    (step === 6 && true) ||
    (step === 7 && true) ||
    (step === 8);

  return (
    <WizardCtx.Provider value={context}>
      <div className="relative min-h-screen" dir="rtl" style={{ fontFamily: "Vazir, sans-serif" }}>
        {/* Background */}
        <div className="pointer-events-none absolute inset-0 -z-10 animate-[wave_14s_ease-in-out_infinite]" style={{
          background: `radial-gradient(900px 450px at 110% -10%, ${COLORS.bgTo} 0%, transparent 60%),
                       radial-gradient(900px 450px at -10% 110%, ${COLORS.bgVia} 0%, transparent 60%),
                       linear-gradient(120deg, ${COLORS.bgFrom}, ${COLORS.bgVia}, ${COLORS.bgTo})`,
        }} />
        <style jsx global>{`
          @keyframes wave { 0%{ filter:hue-rotate(0deg) } 50%{ filter:hue-rotate(12deg) } 100%{ filter:hue-rotate(0deg) } }
        `}</style>

        {/* Content Container (فشرده و وسط‌چین) */}
        {!hydrated ? (
          <PageSkeleton />
        ) : (
          <div className="max-w-[1100px] mx-auto px-3 md:px-4 py-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl grid place-items-center text-white shadow-lg" style={{ background: COLORS.trust }}>
                  <Bot size={16} />
                </div>
                <div>
                  <div className="text-base md:text-lg font-extrabold">استودیو بات بگوی — ویزارد ۸ مرحله‌ای</div>
                  <div className="text-[11px] md:text-[12px] text-neutral-600 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"></span>
                    <span className="px-2 py-0.5 rounded-full border bg-slate-50">
                      {userId ? "ورود تأیید شد ✔︎" : "وارد نشده"}
                    </span>
                    {botId && <span className="px-2 py-0.5 rounded-full border bg-slate-50">Bot: {botId.slice(0,8)}…</span>}
                  </div>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-2">
                {labels.map((l, i) => (
                  <CircleStep key={i} n={i + 1} label={l} active={step===i} done={step>i} />
                ))}
              </div>
            </div>

            {/* Mobile progress */}
            <div className="md:hidden"><Progress value={progress} className="h-2" /></div>

            {/* Steps */}
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>
                {step === 0 && <Step0Magic />}
                {step === 1 && <Step1 />}
                {step === 2 && <Step2 />}
                {step === 3 && <Step3 />}
                {step === 4 && <Step4 />}
                {step === 5 && <Step5 />}
                {step === 6 && <Step6 />}
                {step === 7 && <Step7 />}
                {step === 8 && <Step8 />}
              </motion.div>
            </AnimatePresence>

            {/* Sticky controls */}
            <div className="sticky bottom-3 z-30">
              <div className="rounded-2xl shadow-xl border bg-white/85 backdrop-blur-xl p-2.5 flex items-center justify-between">
                <div className="text-[12px] text-neutral-700">
                  مرحله <b>{step + 1}</b> از {totalSteps} — <span className="hidden sm:inline">{labels[step]}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="secondary" onClick={()=>setStep(Math.max(0, step-1))} disabled={step === 0} className="gap-1 h-9 px-3"><ChevronRight size={16}/> قبلی</Button>
                  <Button variant="secondary" onClick={()=>localStorage.setItem(STORAGE_KEY, JSON.stringify({ step, magicUrl, template, industry, name, avatarUrl, channels, kb, tone, vars }))} className="gap-1 h-9 px-3">
                    <Check size={16}/> ذخیره پیشرفت
                  </Button>
                  {step < totalSteps - 1 ? (
                    <Button onClick={()=>setStep(Math.min(totalSteps - 1, step+1))} className="text-white gap-1 h-9 px-3" style={{ background: canNext ? COLORS.cta : "#f5a255" }} disabled={!canNext}>
                      بعدی <ChevronLeft size={16}/>
                    </Button>
                  ) : (
                    <Button className="text-white h-9 px-3" style={{ background: COLORS.cta }} disabled={saving}><Play size={16} className="ml-2"/> {saving ? "در حال ذخیره..." : "انتشار / ذخیره تنظیمات"}</Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Coach پایینِ وسط */}
        {hydrated && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed left-1/2 -translate-x-1/2 z-40"
            style={{ bottom: "90px" }}
            dir="rtl"
          >
            <div className="flex items-center gap-3 p-3 rounded-2xl shadow-xl border bg-white/95 backdrop-blur-xl">
              <div className="w-8 h-8 rounded-xl grid place-items-center text-white" style={{ background: COLORS.cta }}>
                <Bot size={16} />
              </div>
              <div className="text-xs leading-6 text-neutral-800">
                {step===0 ? "آدرس سایت/شبکه اجتماعی را بده؛ بقیه را من پر می‌کنم ✨"
                  : step===1 ? "قالب و صنعت را انتخاب کن تا پیشنهادها دقیق شوند."
                  : step===2 ? "نام و آواتار را تنظیم کن."
                  : step===3 ? "تلگرام را وصل کن؛ بعداً می‌توانی سایر کانال‌ها را اضافه کنی."
                  : step===4 ? "حداقل یک کانال فعال لازم است."
                  : step===5 ? "منابع دانش را اضافه کن تا پاسخ‌ها دقیق شوند."
                  : step===6 ? "پرامپت را با متغیرهای برندت هماهنگ کن و اعمال کن."
                  : step===7 ? "یک پیام تست بفرست تا جریان پاسخ را ببینی."
                  : "همه‌چیز آمادهٔ انتشار!"}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </WizardCtx.Provider>
  );
}
