// app/(dashboard)/inbox/_client.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

/** Inbox v2.4 — balanced 4/6/2 layout, focus-mode toggle, density switch, soft-glow glass cards */
type Channel = "webchat" | "telegram" | "instagram" | "whatsapp";
type Priority = "low" | "medium" | "high" | null;

type InboxItem = {
  id: string;
  channel: string | null;
  session_id: string | null;
  user_id: string | null;
  message_text: string | null;
  attachments: any | null;
  delivery_status: string | null;
  external_ref: string | null;
  created_at: string;
  profile_name?: string | null;
  direction?: "inbound" | "outbound" | null;

  is_read?: boolean | null;
  is_resolved?: boolean | null;
  needs_human?: boolean | null;
  priority?: Priority;
};

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const COLORS = { brand: "#145DEE", cta: "#FF8A00" };

/* Channel meta */
const channelMeta: Record<
  Channel,
  { label: string; badge: string; accent: string; icon: string }
> = {
  webchat:   { label: "وب‌چت",     badge: "bg-blue-50 text-blue-800",     accent: "border-s-blue-300/60",   icon: "🌐" },
  telegram:  { label: "تلگرام",    badge: "bg-cyan-50 text-cyan-800",     accent: "border-s-cyan-300/60",   icon: "✈️" },
  instagram: { label: "اینستاگرام", badge: "bg-pink-50 text-pink-800",    accent: "border-s-pink-300/60",   icon: "📸" },
  whatsapp:  { label: "واتس‌اپ",    badge: "bg-green-50 text-green-800",  accent: "border-s-green-300/60",  icon: "🟢" },
};
const defaultMeta = { label: "کانال نامشخص", badge: "bg-neutral-50 text-neutral-600", accent: "border-s-neutral-200/70", icon: "💬" };

function normalizeChannel(raw?: string | null): Channel | "unknown" {
  const v = (raw || "").toLowerCase().trim();
  switch (v) {
    case "web": case "web_chat": case "webchat": return "webchat";
    case "telegram": case "tg": return "telegram";
    case "instagram": case "ig": return "instagram";
    case "whatsapp": case "wa": case "whats_app": return "whatsapp";
    default: return "unknown";
  }
}
function resolveMeta(raw?: string | null) {
  const norm = normalizeChannel(raw);
  if (norm !== "unknown") return channelMeta[norm];
  return { ...defaultMeta, label: raw || defaultMeta.label };
}

/* Persian dates */
function groupKey(ts: string) {
  const d = new Date(ts);
  const today = new Date();
  const d0 = new Date(d); d0.setHours(0,0,0,0);
  const t0 = new Date(today); t0.setHours(0,0,0,0);
  const diff = Math.floor((t0.getTime() - d0.getTime()) / 86400000);
  if (diff === 0) return "امروز";
  if (diff === 1) return "دیروز";
  try {
    return new Date(ts).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return new Date(ts).toLocaleDateString();
  }
}
function formatFa(ts: string) {
  try {
    return new Date(ts).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return new Date(ts).toLocaleString();
  }
}

/* Virtualization constants */
const ROW_H_HEADER = 30;
const OVERSCAN_PX = 600;
type Row =
  | { t: "header"; key: string; group: string; h: number }
  | { t: "item"; key: string; item: InboxItem; h: number };

function binarySearchPrefix(prefix: number[], value: number) {
  let lo = 0, hi = prefix.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (prefix[mid] <= value) lo = mid + 1; else hi = mid;
  }
  return lo;
}

export default function InboxClient({ initialItems }: { initialItems: InboxItem[] }) {
  const [items, setItems] = useState<InboxItem[]>(initialItems);

  // Filters
  const [q, setQ] = useState("");
  const [ch, setCh] = useState<"all" | Channel>("all");
  const [statusTab, setStatusTab] = useState<"all" | "unread" | "read" | "unresolved" | "resolved" | "human">("all");
  const [prio, setPrio] = useState<"all" | "low" | "medium" | "high">("all");
  const [dense, setDense] = useState(true);           // تراکم کارت‌های لیست
  const [showDetails, setShowDetails] = useState(true); // نمایش/مخفی‌سازی ستون جزئیات (Focus Mode)

  const [lastUpdated, setLastUpdated] = useState<Date | null>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Selection + active
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  /* Realtime */
  useEffect(() => {
    const channel = sb
      .channel("rt-inbox-v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, (p: any) => {
        if (p.eventType === "INSERT") {
          setItems((prev) => [p.new as InboxItem, ...prev]);
        } else if (p.eventType === "UPDATE") {
          setItems((prev) => prev.map((x) => (x.id === p.new.id ? (p.new as InboxItem) : x)));
        }
        setLastUpdated(new Date());
      })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, []);

  async function refreshNow() {
    const { data } = await sb
      .from("conversations")
      .select(`
        id, channel, session_id, user_id, message_text, attachments,
        delivery_status, external_ref, created_at, profile_name, direction,
        is_read, is_resolved, needs_human, priority
      `)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data) { setItems(data as any); setLastUpdated(new Date()); }
  }
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => refreshNow(), 10_000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  /* Shortcuts */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === "/" || e.code === "Slash")) { e.preventDefault(); searchRef.current?.focus(); }
      if ((e.key === "j" || e.key === "J")) moveActive(1);
      if ((e.key === "k" || e.key === "K")) moveActive(-1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeId]);

  function moveActive(delta: 1 | -1) {
    const ids = filtered.map((x) => x.id);
    if (ids.length === 0) return;
    const idx = Math.max(0, ids.indexOf(activeId || ids[0]));
    const next = Math.min(ids.length - 1, Math.max(0, idx + delta));
    setActiveId(ids[next]);
  }

  /* Filtered */
  const filtered = useMemo(() => {
    return items.filter((it) => {
      const norm = normalizeChannel(it.channel);
      if (ch !== "all" && norm !== ch) return false;
      if (statusTab === "unread" && it.is_read) return false;
      if (statusTab === "read" && !it.is_read) return false;
      if (statusTab === "unresolved" && it.is_resolved) return false;
      if (statusTab === "resolved" && !it.is_resolved) return false;
      if (statusTab === "human" && !it.needs_human) return false;
      if (prio !== "all" && it.priority !== prio) return false;
      if (q && !(it.message_text || "").toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [items, q, ch, statusTab, prio]);

  /* Group + rows */
  const grouped = useMemo(() => {
    const map = new Map<string, InboxItem[]>();
    for (const m of filtered) {
      const key = groupKey(m.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries());
  }, [filtered]);

  // ارتفاع آیتم بر اساس تراکم
  const rowHItem = dense ? 88 : 96;

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const [group, list] of grouped) {
      out.push({ t: "header", key: `h_${group}`, group, h: ROW_H_HEADER });
      for (const m of list) out.push({ t: "item", key: m.id, item: m, h: rowHItem });
    }
    return out;
  }, [grouped, rowHItem]);

  const prefix = useMemo(() => {
    const p = new Array(rows.length + 1).fill(0);
    for (let i = 0; i < rows.length; i++) p[i + 1] = p[i] + rows[i].h;
    return p;
  }, [rows]);
  const totalHeight = prefix[prefix.length - 1];

  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  useEffect(() => {
    const el = viewportRef.current!;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener("scroll", onScroll);
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    setViewportH(el.clientHeight);
    return () => { el.removeEventListener("scroll", onScroll); ro.disconnect(); };
  }, []);
  useEffect(() => { viewportRef.current?.scrollTo({ top: 0 }); }, [ch, q, statusTab, prio, dense]);

  const startIndex = useMemo(() => {
    const s = Math.max(0, binarySearchPrefix(prefix, Math.max(0, scrollTop - OVERSCAN_PX)) - 1);
    return s;
  }, [prefix, scrollTop]);
  const endIndex = useMemo(() => {
    const limit = scrollTop + viewportH + OVERSCAN_PX;
    let e = binarySearchPrefix(prefix, limit);
    if (e < prefix.length - 1) e += 1;
    return Math.min(rows.length - 1, e);
  }, [prefix, scrollTop, viewportH, rows.length]);

  const faCount = useMemo(() => filtered.length.toLocaleString("fa-IR"), [filtered.length]);

  /* Optimistic updates */
  function patchLocal(id: string, data: Partial<InboxItem>) {
    setItems((prev) => prev.map((x) => (x.id === id ? ({ ...x, ...data }) : x)));
  }
  async function updateRow(id: string, data: Partial<InboxItem>) {
    patchLocal(id, data);
    await sb.from("conversations").update(data).eq("id", id);
  }
  async function updateMany(ids: string[], data: Partial<InboxItem>) {
    setItems((prev) => prev.map((x) => (ids.includes(x.id) ? ({ ...x, ...data }) : x)));
    await sb.from("conversations").update(data).in("id", ids);
  }

  function toggleRead(id: string, value?: boolean) {
    const it = items.find((x) => x.id === id);
    updateRow(id, { is_read: value ?? !it?.is_read });
  }
  function toggleResolved(id: string, value?: boolean) {
    const it = items.find((x) => x.id === id);
    updateRow(id, { is_resolved: value ?? !it?.is_resolved });
  }
  function toggleHuman(id: string, value?: boolean) {
    const it = items.find((x) => x.id === id);
    updateRow(id, { needs_human: value ?? !it?.needs_human });
  }
  function setPriority(id: string, priority: Priority) { updateRow(id, { priority }); }

  const hasSelection = selectedIds.size > 0;
  const selectedArray = Array.from(selectedIds);
  const bulk = {
    read: () => updateMany(selectedArray, { is_read: true }),
    unread: () => updateMany(selectedArray, { is_read: false }),
    resolved: () => updateMany(selectedArray, { is_resolved: true }),
    unresolved: () => updateMany(selectedArray, { is_resolved: false }),
    humanOn: () => updateMany(selectedArray, { needs_human: true }),
    humanOff: () => updateMany(selectedArray, { needs_human: false }),
    prio: (p: Priority) => updateMany(selectedArray, { priority: p }),
    clear: () => setSelectedIds(new Set()),
  };

  const counts = useMemo(() => {
    let unread = 0, read = 0, unresolved = 0, resolved = 0, human = 0;
    for (const it of items) {
      if (it.is_read) read++; else unread++;
      if (it.is_resolved) resolved++; else unresolved++;
      if (it.needs_human) human++;
    }
    return { unread, read, unresolved, resolved, human, all: items.length };
  }, [items]);

  const searchPlaceholder = "جستجو در متن پیام… (میانبر: \u200ECtrl+/)";

  return (
    <div className="relative space-y-4" dir="rtl">
      {/* Decorative glows */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute -top-24 -left-24 h-72 w-72 rounded-full blur-3xl opacity-30"
          style={{ background: "radial-gradient(closest-side, #FFEAD5 0%, transparent 70%)" }}
        />
        <div
          className="absolute -bottom-28 -right-24 h-80 w-80 rounded-full blur-3xl opacity-30"
          style={{ background: "radial-gradient(closest-side, #DBEAFE 0%, transparent 70%)" }}
        />
      </div>

      {/* Filters (sticky) */}
      <div className="sticky top-0 z-20 bg-white/80 backdrop-blur border border-neutral-200/60 rounded-2xl p-2 shadow-sm">
        <div className="h-1 rounded-xl mb-2 bg-gradient-to-l from-orange-100 via-white to-blue-100" />
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["all","همه",counts.all],
            ["unread","نخوانده",counts.unread],
            ["read","خوانده",counts.read],
            ["unresolved","حل‌نشده",counts.unresolved],
            ["resolved","حل‌شده",counts.resolved],
            ["human","اپراتور انسانی",counts.human],
          ].map(([k, t, c]) => (
            <button
              key={k}
              onClick={() => setStatusTab(k as any)}
              className={`text-sm rounded-full px-3 py-1 border transition ${
                statusTab===k
                  ? "bg-orange-50/90 border-orange-200 text-orange-700"
                  : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {t} <span className="text-xs opacity-70">({c as number})</span>
            </button>
          ))}

          <div className="w-px h-6 bg-neutral-200/70 mx-1" />

          <select className="border border-neutral-200/70 rounded-xl px-3 py-1.5" value={ch} onChange={(e) => setCh(e.target.value as any)}>
            <option value="all">همهٔ کانال‌ها</option>
            <option value="webchat">وب‌چت</option>
            <option value="telegram">تلگرام</option>
            <option value="instagram">اینستاگرام</option>
            <option value="whatsapp">واتس‌اپ</option>
          </select>

          <select className="border border-neutral-200/70 rounded-xl px-3 py-1.5" value={prio} onChange={(e) => setPrio(e.target.value as any)}>
            <option value="all">همهٔ اولویت‌ها</option>
            <option value="high">🔴 زیاد</option>
            <option value="medium">🟡 متوسط</option>
            <option value="low">🟢 کم</option>
          </select>

          <input
            ref={searchRef}
            className="border border-neutral-200/70 rounded-xl px-3 py-1.5 w-72"
            placeholder={searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          {/* Density switch */}
          <label className="flex items-center gap-2 text-sm text-neutral-600 select-none">
            <input type="checkbox" className="accent-orange-600" checked={dense} onChange={(e) => setDense(e.target.checked)} />
            تراکم
          </label>

          {/* Focus-mode toggle */}
          <button
            onClick={() => setShowDetails(v => !v)}
            className="inline-flex items-center gap-1 rounded-xl border border-neutral-200/70 px-3 py-1.5 text-sm hover:bg-neutral-50"
            title="گسترش گفتگو / نمایش جزئیات"
          >
            ↔︎ {showDetails ? "تمرکز روی گفتگو" : "نمایش جزئیات"}
          </button>

          <button onClick={refreshNow} className="ml-auto inline-flex items-center gap-1 rounded-xl border border-neutral-200/70 px-3 py-1.5 text-sm hover:bg-neutral-50" title="تازه‌سازی">
            ↻ <span>تازه‌سازی</span>
          </button>
          <label className="flex items-center gap-2 text-sm text-neutral-600 select-none">
            <input type="checkbox" className="accent-orange-600" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            خودکار (۱۰ ثانیه)
          </label>
          <span className="text-xs text-neutral-500">آخرین بروزرسانی: {lastUpdated ? formatFa(lastUpdated.toISOString()) : "—"} • {faCount} نتیجه</span>
        </div>
      </div>

      {/* Balanced columns: 4 / 6 / 2 → focus-mode 4 / 8 */}
      <div
        className="grid gap-4 lg:[grid-template-columns:var(--cols)]"
        style={{ ["--cols" as any]: showDetails ? "4fr 6fr 2fr" : "4fr 8fr" }}
        dir="ltr"
      >
        {/* List */}
        <div className="order-1" dir="rtl">
          <div
            ref={viewportRef}
            className="relative border border-neutral-200/60 rounded-2xl bg-white/70 backdrop-blur overflow-auto shadow-sm"
            style={{ height: "72vh" }}
          >
            <div style={{ height: totalHeight }} />
            <div className="absolute inset-0">
              {rows.slice(startIndex, endIndex + 1).map((row, idx) => {
                const i = startIndex + idx;
                const top = prefix[i];

                if (row.t === "header") {
                  return (
                    <div key={row.key} className="px-3" style={{ position: "absolute", top, left: 0, right: 0, height: row.h }}>
                      {i > 0 && <div className="border-t border-neutral-200/70 my-1" />}
                      <div className="text-xs font-bold text-neutral-500 mt-1">{row.group}</div>
                    </div>
                  );
                }

                const m = row.item;
                const meta = resolveMeta(m.channel);
                const isInbound = m.direction === "inbound";
                const cardTint =
                  isInbound ? "bg-green-50/50 ring-1 ring-green-100"
                  : m.direction === "outbound" ? "bg-orange-50/50 ring-1 ring-orange-100"
                  : "bg-white";
                const selected = selectedIds.has(m.id);
                const active = activeId === m.id;

                return (
                  <div key={row.key} style={{ position: "absolute", top, left: 10, right: 10, height: rowHItem }}>
                    <div
                      className={[
                        "group relative h-full border border-neutral-200/60 rounded-2xl px-3 py-2 flex items-start gap-3",
                        "shadow-[0_8px_24px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_28px_rgba(0,0,0,0.07)]",
                        "hover:-translate-y-[1px] transition",
                        "bg-white/85 backdrop-blur-md",
                        "border-s-4", meta.accent, cardTint,
                        active ? "ring-2 ring-orange-200" : "",
                      ].join(" ")}
                      onClick={() => setActiveId(m.id)}
                    >
                      {/* bulk checkbox */}
                      <div className="pt-1">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => {
                            const s = new Set(selectedIds);
                            if (e.target.checked) s.add(m.id); else s.delete(m.id);
                            setSelectedIds(s);
                          }}
                        />
                      </div>

                      {/* channel badge */}
                      <div className="shrink-0 mt-0.5">
                        <span className={`text-[11px] rounded-full px-2 py-0.5 border border-white/60 ${meta.badge}`}>
                          <span className="ml-1">{meta.icon}</span>{meta.label}
                        </span>
                      </div>

                      {/* content */}
                      <div className="grow min-w-0">
                        <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                          <span className={`truncate ${!m.is_read ? "font-bold text-neutral-800" : ""}`}>
                            {m.profile_name || m.user_id || "کاربر"}
                          </span>
                          {m.priority && <span title="اولویت">{m.priority === "high" ? "🔴" : m.priority === "medium" ? "🟡" : "🟢"}</span>}
                          {m.needs_human && <span className="text-rose-600">• اپراتور انسانی</span>}
                          {m.is_resolved && <span className="text-green-600">• حل‌شده</span>}
                          <span className="ms-auto shrink-0">{formatFa(m.created_at)}</span>
                        </div>

                        <div className={`mt-0.5 leading-6 text-[15px] text-neutral-800 line-clamp-2 break-words ${!m.is_read ? "font-medium" : ""}`}>
                          {m.message_text}
                        </div>
                      </div>

                      {/* quick actions - compact icons */}
                      <div className="pointer-events-auto absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button
                          className="h-7 w-7 grid place-items-center rounded-lg border bg-white/90 hover:bg-white"
                          title={m.is_read ? "علامت نخوانده" : "علامت خوانده"}
                          onClick={(e) => { e.stopPropagation(); toggleRead(m.id); }}
                        >
                          {m.is_read ? "👁️‍🗨️" : "👁️"}
                        </button>
                        <button
                          className="h-7 w-7 grid place-items-center rounded-lg border bg-white/90 hover:bg-white"
                          title={m.is_resolved ? "حل‌نشده" : "حل‌شده"}
                          onClick={(e) => { e.stopPropagation(); toggleResolved(m.id); }}
                        >
                          {m.is_resolved ? "↩︎" : "✅"}
                        </button>
                        <button
                          className={`h-7 w-7 grid place-items-center rounded-lg border bg-white/90 hover:bg-white ${m.needs_human ? "border-rose-300 text-rose-700" : ""}`}
                          title="اپراتور انسانی"
                          onClick={(e) => { e.stopPropagation(); toggleHuman(m.id); }}
                        >
                          🤝
                        </button>
                        {(["high","medium","low"] as Priority[]).map((p) => (
                          <button
                            key={p!}
                            className={`h-7 px-2 rounded-full border bg-white/90 hover:bg-white text-[11px] ${m.priority===p?"border-orange-300":""}`}
                            title={`اولویت ${p}`}
                            onClick={(e) => { e.stopPropagation(); setPriority(m.id, p); }}
                          >
                            {p==="high"?"🔴":p==="medium"?"🟡":"🟢"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {rows.length === 0 && (
            <div className="text-sm text-neutral-500 border rounded-2xl p-6 text-center bg-white/70 backdrop-blur border-neutral-200/60 mt-3">
              پیامی با این فیلترها یافت نشد{" "}
              <button className="underline" onClick={() => { setQ(""); setStatusTab("all"); setPrio("all"); setCh("all"); }}>
                ریست فیلترها
              </button>
            </div>
          )}
        </div>

        {/* Chat – 6 / 8 cols */}
        <div className="order-2" dir="rtl">
          <div className="border rounded-2xl bg-white/70 backdrop-blur p-3 h-[72vh] flex flex-col shadow-sm">
            <div className="text-sm font-semibold mb-2">گفتگو</div>
            {!activeId ? (
              <div className="text-sm text-neutral-500 grid place-items-center flex-1">یک پیام از لیست انتخاب کنید…</div>
            ) : (
              <>
                <div className="flex-1 rounded-xl border bg-white p-4 overflow-auto space-y-4">
                  {(() => {
                    const m = items.find(x => x.id === activeId)!;
                    const meta = resolveMeta(m.channel);
                    return (
                      <div className="space-y-3">
                        <div className="text-xs text-neutral-500 flex items-center gap-2">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-white" style={{background: COLORS.brand}}>
                            {meta.icon}
                          </span>
                          <span>{meta.label}</span>
                          <span>•</span>
                          <span>{formatFa(m.created_at)}</span>
                        </div>
                        <div className="rounded-2xl px-4 py-3 leading-8 text-[15px] tracking-[0.1px] break-words whitespace-pre-wrap bg-white/90 border border-neutral-200 shadow-[0_4px_20px_rgba(20,93,238,0.06)]">
                          {m.message_text}
                        </div>
                        {m.attachments && (
                          <pre className="mt-2 text-xs bg-neutral-50/80 border border-neutral-200/60 p-2 rounded overflow-auto">
                            {JSON.stringify(m.attachments, null, 2)}
                          </pre>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input className="flex-1 border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-200/70" placeholder="پاسخ سریع (نمونه/UI)" />
                  <button className="rounded-xl px-3 py-2 text-white" style={{background: COLORS.brand}}>ارسال</button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Details – 2 cols (conditional) */}
        {showDetails && (
          <div className="order-3" dir="rtl">
            <div className="border rounded-2xl bg-white/70 backdrop-blur p-3 h-[72vh] overflow-auto shadow-sm">
              <div className="text-sm font-semibold mb-2">جزئیات</div>
              {!activeId ? (
                <div className="text-sm text-neutral-500">—</div>
              ) : (
                (() => {
                  const m = items.find(x => x.id === activeId)!;
                  const meta = resolveMeta(m.channel);
                  return (
                    <div className="space-y-2 text-sm">
                      <div><b>شناسه:</b> <code className="select-all">{m.id}</code></div>
                      <div><b>کانال:</b> {meta.icon} {meta.label}</div>
                      <div><b>کاربر:</b> {m.profile_name || m.user_id || "-"}</div>
                      <div><b>زمان:</b> {formatFa(m.created_at)}</div>
                      <div><b>خواندن:</b> {m.is_read ? "خوانده" : "نخوانده"}</div>
                      <div><b>وضعیت:</b> {m.is_resolved ? "حل‌شده" : "حل‌نشده"}</div>
                      <div><b>اپراتور:</b> {m.needs_human ? "درخواست شده" : "—"}</div>
                      <div><b>اولویت:</b> {m.priority ? (m.priority === "high" ? "🔴 زیاد" : m.priority === "medium" ? "🟡 متوسط" : "🟢 کم") : "—"}</div>
                      <div className="pt-2 flex gap-2 flex-wrap">
                        <button className="rounded-xl border px-3 py-1 text-xs hover:bg-neutral-50" onClick={() => toggleRead(m.id)}>{m.is_read ? "علامت نخوانده" : "علامت خوانده"}</button>
                        <button className="rounded-xl border px-3 py-1 text-xs hover:bg-neutral-50" onClick={() => toggleResolved(m.id)}>{m.is_resolved ? "حل‌نشده" : "حل‌شده"}</button>
                        <button className="rounded-xl border px-3 py-1 text-xs hover:bg-neutral-50" onClick={() => toggleHuman(m.id)}>{m.needs_human ? "لغو اپراتور" : "اپراتور انسانی"}</button>
                      </div>
                      <div className="pt-1 flex gap-1">
                        {(["high","medium","low"] as Priority[]).map((p) => (
                          <button key={p!} className={`rounded-full border px-2 py-0.5 text-xs hover:bg-neutral-50 ${m.priority===p?"border-orange-300":"border-neutral-200"}`} onClick={() => setPriority(m.id, p)}>
                            {p==="high"?"🔴 زیاد":"medium"===p?"🟡 متوسط":"🟢 کم"}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bulk bar */}
      {hasSelection && (
        <div className="sticky bottom-4 z-30">
          <div className="rounded-2xl shadow-2xl border bg-white/90 backdrop-blur-xl p-3 flex items-center gap-2">
            <div className="text-sm">انتخاب‌ها: <b>{selectedIds.size}</b></div>
            <div className="w-px h-6 bg-neutral-200/70" />
            <button className="rounded-xl border px-3 py-1 text-sm hover:bg-neutral-50" onClick={bulk.read}>علامت خوانده</button>
            <button className="rounded-xl border px-3 py-1 text-sm hover:bg-neutral-50" onClick={bulk.unread}>علامت نخوانده</button>
            <button className="rounded-xl border px-3 py-1 text-sm hover:bg-neutral-50" onClick={bulk.resolved}>حل‌شده</button>
            <button className="rounded-xl border px-3 py-1 text-sm hover:bg-neutral-50" onClick={bulk.unresolved}>حل‌نشده</button>
            <button className="rounded-xl border px-3 py-1 text-sm hover:bg-neutral-50" onClick={bulk.humanOn}>اپراتور</button>
            <button className="rounded-xl border px-3 py-1 text-sm hover:bg-neutral-50" onClick={bulk.humanOff}>بدون اپراتور</button>
            <div className="w-px h-6 bg-neutral-200/70" />
            <button className="rounded-xl border px-3 py-1 text-sm hover:bg-neutral-50" onClick={() => bulk.prio("high")}>🔴 زیاد</button>
            <button className="rounded-xl border px-3 py-1 text-sm hover:bg-neutral-50" onClick={() => bulk.prio("medium")}>🟡 متوسط</button>
            <button className="rounded-xl border px-3 py-1 text-sm hover:bg-neutral-50" onClick={() => bulk.prio("low")}>🟢 کم</button>
            <div className="ml-auto" />
            <button className="rounded-xl border px-3 py-1 text-sm hover:bg-neutral-50" onClick={bulk.clear}>انصراف</button>
          </div>
        </div>
      )}
    </div>
  );
}
