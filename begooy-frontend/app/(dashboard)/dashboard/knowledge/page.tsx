"use client";

/**
 * Begooy — Knowledge (Neuro UX)
 * - جستجو + مرتب‌سازی + فیلتر وضعیت
 * - کارت‌های KB با منوی سه‌نقطه (ویرایش نام، ری‌ایندکس، حذف)
 * - دراور جزئیات پایگاه: آمار، منابع، عملیات
 * - مودال ساخت پایگاه جدید + «افزودن منبع» به‌صورت کارت‌های بزرگ
 * - empty state + skeleton برای تجربه روان
 */

import React, { useMemo, useState } from "react";
import {
  Database,
  Upload,
  Globe,
  MessageSquare,
  FileText,
  Check,
  Copy,
  Plus,
  Search,
  MoreVertical,
  Edit,
  RefreshCcw,
  Trash2,
  Info,
  ShieldCheck,
  Loader2,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";

const COLORS = { brand: "#145DEE", cta: "#FF8A00" };

/* ───────────────────────────── UI primitives (local) ───────────────────────── */

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border p-4"
        dir="rtl"
      >
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

function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`fixed inset-0 z-[55] ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-black/25 transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`absolute top-0 bottom-0 left-0 w-full max-w-md bg-white shadow-2xl border-r rounded-tr-2xl rounded-br-2xl transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        dir="rtl"
      >
        <div className="p-4 border-b flex items-center justify-between">
          <div className="text-sm font-bold">{title}</div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            بستن
          </Button>
        </div>
        <div className="p-4 overflow-auto h-full">{children}</div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Helpers / mock data ─────────────────────────── */

type KB = {
  id: string;
  name: string;
  docs: number;
  pct: number; // index progress
  status: "ready" | "indexing" | "error";
  updatedAt: string;
  sources: Array<{ type: "text" | "file" | "url" | "qa"; name: string }>;
};

const initialKBs: KB[] = [
  {
    id: "kb-1",
    name: "Default Knowledge Base",
    docs: 58,
    pct: 92,
    status: "ready",
    updatedAt: "۱۴۰۳/۰۷/۱۰",
    sources: [
      { type: "file", name: "FAQ.pdf" },
      { type: "url", name: "help.begoy.ir/*" },
      { type: "text", name: "راهنمای پاسخ‌های کوتاه" },
    ],
  },
  {
    id: "kb-2",
    name: "سیاست‌های مرجوعی",
    docs: 8,
    pct: 100,
    status: "ready",
    updatedAt: "۱۴۰۳/۰۷/۰۸",
    sources: [{ type: "text", name: "سیاست مرجوعی ۷ روزه" }],
  },
  {
    id: "kb-3",
    name: "FAQ لندینگ",
    docs: 15,
    pct: 64,
    status: "indexing",
    updatedAt: "۱۴۰۳/۰۷/۰۹",
    sources: [
      { type: "url", name: "landing.example.com/faq" },
      { type: "qa", name: "دسته‌ی پرسش/پاسخ‌ها" },
    ],
  },
];

/* ───────────────────────────── Small building blocks ───────────────────────── */

function StatusPill({ s }: { s: KB["status"] }) {
  const map: Record<KB["status"], { text: string; cls: string; icon?: any }> = {
    ready: { text: "آماده", cls: "bg-green-100 text-green-700", icon: ShieldCheck },
    indexing: { text: "در حال ایندکس", cls: "bg-amber-100 text-amber-700", icon: Loader2 },
    error: { text: "خطا", cls: "bg-red-100 text-red-700", icon: Info },
  };
  const Ico = map[s].icon;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full ${map[s].cls}`}
    >
      {Ico ? <Ico size={12} className={s === "indexing" ? "animate-spin" : ""} /> : null}
      {map[s].text}
    </span>
  );
}

function SourceBadge({ t }: { t: KB["sources"][number]["type"] }) {
  const map: Record<KB["sources"][number]["type"], { label: string; icon: any }> = {
    text: { label: "متن", icon: FileText },
    file: { label: "فایل", icon: Upload },
    url: { label: "وب‌سایت", icon: Globe },
    qa: { label: "Q&A", icon: MessageSquare },
  };
  const Icon = map[t].icon;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-neutral-100">
      <Icon size={12} /> {map[t].label}
    </span>
  );
}

/* ───────────────────────────────── Main Page ──────────────────────────────── */

export default function KnowledgePage() {
  const [list, setList] = useState<KB[]>(initialKBs);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "name" | "progress">("recent");
  const [status, setStatus] = useState<"all" | KB["status"]>("all");

  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [drawerKB, setDrawerKB] = useState<KB | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    let arr = [...list];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      arr = arr.filter((k) => k.name.toLowerCase().includes(q));
    }
    if (status !== "all") arr = arr.filter((k) => k.status === status);
    if (sort === "name") arr.sort((a, b) => a.name.localeCompare(b.name, "fa"));
    if (sort === "progress") arr.sort((a, b) => b.pct - a.pct);
    if (sort === "recent") arr.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return arr;
  }, [list, query, sort, status]);

  const handleCopy = async (txt: string) => {
    await navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const addKB = (name: string) => {
    const kb: KB = {
      id: crypto.randomUUID(),
      name,
      docs: 0,
      pct: 0,
      status: "indexing",
      updatedAt: new Date().toLocaleDateString("fa-IR"),
      sources: [],
    };
    setList((s) => [kb, ...s]);
    setShowCreate(false);
  };

  const renameKB = (id: string) => {
    const name = prompt("نام جدید پایگاه:", list.find((x) => x.id === id)?.name || "");
    if (!name) return;
    setList((s) => s.map((k) => (k.id === id ? { ...k, name } : k)));
  };

  const reindexKB = (id: string) => {
    setList((s) =>
      s.map((k) => (k.id === id ? { ...k, status: "indexing", pct: Math.max(5, k.pct) } : k)),
    );
    setTimeout(() => {
      setList((s) =>
        s.map((k) => (k.id === id ? { ...k, status: "ready", pct: 100 } : k)),
      );
    }, 1200);
  };

  const deleteKB = (id: string) => {
    if (!confirm("این پایگاه حذف شود؟")) return;
    setList((s) => s.filter((k) => k.id !== id));
    if (drawerKB?.id === id) setDrawerKB(null);
  };

  /* ───────────────────────────── Render ───────────────────────────── */

  return (
    <div className="relative min-h-screen" dir="rtl" style={{ fontFamily: "Vazir, sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl grid place-items-center text-white shadow-lg"
            style={{ background: COLORS.brand }}
          >
            <Database size={18} />
          </div>
          <div>
            <div className="text-lg font-extrabold">پایگاه دانش — مدیریت منابع</div>
            <div className="text-[12px] text-neutral-600">
              افزودن/ویرایش منابع و مشاهده وضعیت ایندکس
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            className="text-white"
            style={{ background: COLORS.brand }}
            onClick={() => setShowCreate(true)}
          >
            <Plus size={14} className="ml-1" />
            ساخت پایگاه جدید
          </Button>
        </div>
      </div>

      {/* Toolbar: search + sort + filter */}
      <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="relative">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو بین پایگاه‌ها..."
            className="pr-8"
          />
          <Search
            size={16}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
          />
        </div>

        <select
          className="border rounded-xl px-3 py-2 bg-white text-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
          aria-label="مرتب‌سازی"
        >
          <option value="recent">مرتب‌سازی: آخرین بروزرسانی</option>
          <option value="name">مرتب‌سازی: نام</option>
          <option value="progress">مرتب‌سازی: پیشرفت ایندکس</option>
        </select>

        <select
          className="border rounded-xl px-3 py-2 bg-white text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as any)}
          aria-label="فیلتر وضعیت"
        >
          <option value="all">همه وضعیت‌ها</option>
          <option value="ready">آماده</option>
          <option value="indexing">در حال ایندکس</option>
          <option value="error">خطا</option>
        </select>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List */}
        <Card className="backdrop-blur-xl border-white/50 bg-white/70 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">پایگاه‌های دانش</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {filtered.length === 0 ? (
              <div className="rounded-xl border p-6 text-sm text-neutral-600 bg-white/70">
                نتیجه‌ای پیدا نشد. معیار جستجو/فیلتر را تغییر دهید یا پایگاه جدید بسازید.
              </div>
            ) : (
              filtered.map((k) => (
                <div
                  key={k.id}
                  className="relative rounded-xl border p-3 bg-white/70 hover:shadow-sm transition cursor-pointer"
                  onClick={() => setDrawerKB(k)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-lg grid place-items-center text-white"
                          style={{ background: COLORS.cta }}
                        >
                          <Database size={14} />
                        </div>
                        <div className="font-semibold truncate" title={k.name}>
                          {k.name}
                        </div>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
                        <Badge variant="outline" className="text-[11px]">
                          {k.docs} سند
                        </Badge>
                        <StatusPill s={k.status} />
                        <span>آخرین بروزرسانی: {k.updatedAt}</span>
                      </div>
                    </div>

                    {/* kebab menu */}
                    <div
                      className="relative"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpen((m) => (m === k.id ? null : k.id));
                      }}
                    >
                      <Button variant="secondary" size="sm" className="px-2">
                        <MoreVertical size={16} />
                      </Button>
                      {menuOpen === k.id && (
                        <div
                          className="absolute left-0 mt-2 w-40 rounded-xl border bg-white shadow-lg z-10"
                          onMouseLeave={() => setMenuOpen(null)}
                        >
                          <button
                            className="w-full text-right px-3 py-2 text-sm hover:bg-neutral-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpen(null);
                              renameKB(k.id);
                            }}
                          >
                            <Edit size={14} className="ml-1 inline" />
                            تغییر نام
                          </button>
                          <button
                            className="w-full text-right px-3 py-2 text-sm hover:bg-neutral-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpen(null);
                              reindexKB(k.id);
                            }}
                          >
                            <RefreshCcw size={14} className="ml-1 inline" />
                            ایندکس مجدد
                          </button>
                          <button
                            className="w-full text-right px-3 py-2 text-sm hover:bg-neutral-50 text-red-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpen(null);
                              deleteKB(k.id);
                            }}
                          >
                            <Trash2 size={14} className="ml-1 inline" />
                            حذف
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3">
                    <Progress value={k.pct} />
                    <div className="text-[11px] text-neutral-500 mt-1">ایندکس: {k.pct}%</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Quick Add */}
        <Card className="backdrop-blur-xl border-white/50 bg-white/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">افزودن منبع دانش</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button
              variant="secondary"
              className="h-20 flex-col"
              onClick={() => alert("متن (Mock)")}
            >
              <FileText className="mb-1" />
              متن
            </Button>
            <Button
              variant="secondary"
              className="h-20 flex-col"
              onClick={() => alert("فایل (Mock)")}
            >
              <Upload className="mb-1" />
              فایل متنی / PDF
            </Button>
            <Button
              variant="secondary"
              className="h-20 flex-col"
              onClick={() => alert("وب‌سایت (Mock)")}
            >
              <Globe className="mb-1" />
              وب‌سایت
            </Button>
            <Button
              variant="secondary"
              className="h-20 flex-col"
              onClick={() => alert("Q&A (Mock)")}
            >
              <MessageSquare className="mb-1" />
              پرسش و پاسخ
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Helper card */}
      <Card className="mt-6 backdrop-blur-xl border-white/50 bg-white/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">راهنما</CardTitle>
        </CardHeader>
        <CardContent className="text-[13px] space-y-2">
          <div>– پس از افزودن منبع، ایندکس‌سازی به‌صورت خودکار شروع می‌شود.</div>
          <div>
            – برای استفاده در چت‌بات، مطمئن شوید KB‌ منتخب در «استودیو بات &gt; تنظیمات» فعال
            است.
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleCopy("https://docs.begoy.ir/knowledge")}
          >
            {copied ? <Check size={14} className="ml-1" /> : <Copy size={14} className="ml-1" />}
            مستندات (کپی لینک)
          </Button>
        </CardContent>
      </Card>

      {/* Drawer: KB details */}
      <Drawer
        open={!!drawerKB}
        onClose={() => setDrawerKB(null)}
        title={drawerKB?.name || ""}
      >
        {!drawerKB ? null : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-neutral-600">شناسه: {drawerKB.id.slice(0, 8)}…</div>
              <StatusPill s={drawerKB.status} />
            </div>

            <div className="rounded-xl border p-3 bg-white/70">
              <div className="text-sm font-semibold mb-2">آمار</div>
              <div className="grid grid-cols-3 text-center text-[12px]">
                <div>
                  <div className="font-bold text-base">{drawerKB.docs}</div>
                  <div className="text-neutral-500">سند</div>
                </div>
                <div>
                  <div className="font-bold text-base">{drawerKB.pct}%</div>
                  <div className="text-neutral-500">ایندکس</div>
                </div>
                <div>
                  <div className="font-bold text-base">{drawerKB.updatedAt}</div>
                  <div className="text-neutral-500">بروزرسانی</div>
                </div>
              </div>
              <div className="mt-3">
                <Progress value={drawerKB.pct} />
              </div>
            </div>

            <div className="rounded-xl border p-3 bg-white/70">
              <div className="text-sm font-semibold mb-2">منابع</div>
              {drawerKB.sources.length === 0 ? (
                <div className="text-[12px] text-neutral-500">
                  منبعی وجود ندارد — از کارت‌های «افزودن منبع» استفاده کنید.
                </div>
              ) : (
                <div className="space-y-2">
                  {drawerKB.sources.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <SourceBadge t={s.type} />
                        <span className="truncate max-w-[220px]">{s.name}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => alert("مدیریت منبع (Mock)")}
                      >
                        مدیریت
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                className="text-white"
                style={{ background: COLORS.cta }}
                onClick={() => reindexKB(drawerKB.id)}
              >
                <RefreshCcw size={14} className="ml-1" />
                ایندکس مجدد
              </Button>
              <Button variant="secondary" onClick={() => renameKB(drawerKB.id)}>
                <Edit size={14} className="ml-1" />
                تغییر نام
              </Button>
              <Button variant="secondary" onClick={() => alert("تنظیمات اتصال (Mock)")}>
                <Info size={14} className="ml-1" />
                تنظیمات اتصال
              </Button>
              <Button variant="secondary" className="text-red-600" onClick={() => deleteKB(drawerKB.id)}>
                <Trash2 size={14} className="ml-1" />
                حذف
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Modal: create KB */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="ساخت پایگاه دانش جدید">
        <CreateKBForm
          onCancel={() => setShowCreate(false)}
          onCreate={(n) => addKB(n)}
        />
      </Modal>
    </div>
  );
}

/* ───────────────────────────── Create KB Form ─────────────────────────────── */

function CreateKBForm({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("Default Knowledge Base");
  const [vis, setVis] = useState<"private" | "shared">("private");

  return (
    <div className="space-y-4" dir="rtl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="text-[12px] text-neutral-600 mb-1">نام پایگاه</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <div className="text-[12px] text-neutral-600 mb-1">دسترسی</div>
          <select
            className="border rounded-xl px-3 py-2 bg-white text-sm w-full"
            value={vis}
            onChange={(e) => setVis(e.target.value as any)}
          >
            <option value="private">خصوصی</option>
            <option value="shared">اشتراکی با تیم</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border bg-white/70 p-3">
        <div className="text-sm font-semibold mb-2">افزودن اولیه منبع</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Button variant="secondary" className="h-20 flex-col" onClick={() => alert("متن (Mock)")}>
            <FileText className="mb-1" />
            متن
          </Button>
          <Button variant="secondary" className="h-20 flex-col" onClick={() => alert("فایل (Mock)")}>
            <Upload className="mb-1" />
            فایل / PDF
          </Button>
          <Button variant="secondary" className="h-20 flex-col" onClick={() => alert("وب‌سایت (Mock)")}>
            <Globe className="mb-1" />
            وب‌سایت
          </Button>
          <Button variant="secondary" className="h-20 flex-col" onClick={() => alert("Q&A (Mock)")}>
            <MessageSquare className="mb-1" />
            Q&A
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          انصراف
        </Button>
        <Button
          className="text-white"
          style={{ background: COLORS.brand }}
          onClick={() => onCreate(name)}
        >
          <Plus size={14} className="ml-1" />
          ساخت پایگاه
        </Button>
      </div>
    </div>
  );
}
