"use client";

import React, { useEffect, useState, useCallback, useRef, type KeyboardEvent } from "react";

type Msg = {
  id: string;
  session_id: string | null;
  platform: string | null;
  message_text: string | null;
  is_bot_response: boolean | null;
  created_at: string;
};

// ---------- Tiny Toast ----------
function Toast({
  message,
  type = "info",
  onClose,
}: {
  message: string;
  type?: "info" | "error";
  onClose: () => void;
}) {
  return (
    <div
      className={`fixed bottom-4 right-4 z-50 rounded-xl border shadow-lg px-4 py-3 text-sm
        ${type === "error" ? "bg-red-50 border-red-300 text-red-800" : "bg-white border-gray-200 text-gray-800"}
      `}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-6 h-6 rounded-full grid place-items-center text-white text-xs
            ${type === "error" ? "bg-red-500" : "bg-gray-600"}
          `}
        >
          {type === "error" ? "!" : "i"}
        </div>
        <div className="flex-1">{message}</div>
        <button
          onClick={onClose}
          className="ml-2 text-xs text-gray-500 hover:text-gray-800"
          aria-label="بستن"
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ---------- Skeleton row ----------
function SkeletonRow() {
  return (
    <li className="p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-200" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-5 w-16 rounded-full border bg-gray-100" />
            <span className="h-4 w-28 bg-gray-100 rounded" />
          </div>
          <div className="h-4 bg-gray-100 rounded w-11/12 mb-2" />
          <div className="h-4 bg-gray-100 rounded w-8/12" />
        </div>
      </div>
    </li>
  );
}

export default function OmniInboxPanelSimple() {
  // فیلترها و وضعیت‌ها
  const [platform, setPlatform] = useState<string>("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // صفحه‌بندی (Keyset)
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [prevCursor, setPrevCursor] = useState<string | null>(null);

  // بهینه‌سازی‌ها
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<number | null>(null);

  // اسکرول نرم به ابتدای لیست
  const listTopRef = useRef<HTMLDivElement | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: "info" | "error" } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = (msg: string, type: "info" | "error" = "info") => {
    setToast({ msg, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
  };

  const limit = 10;

  // گرفتن صفحه از API
  const fetchPage = useCallback(
    async (opts: { cursor?: string | null; dir?: "next" | "prev" } = {}) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("limit", String(limit));
        if (platform) params.set("platform", platform);
        if (q.trim()) params.set("q", q.trim());
        if (opts.cursor) params.set("cursor", opts.cursor);
        if (opts.dir) params.set("dir", opts.dir);

        const res = await fetch(`/api/inbox/list?${params.toString()}`);
        const j = await res.json();

        if (j.ok) {
          setItems(j.items || []);
          setNextCursor(j.nextCursor || null);
          setPrevCursor(j.prevCursor || null);
          setLastUpdated(new Date());
          // اسکرول نرم به بالا
          listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          setError(j.error || "server_error");
          showToast(j.error || "خطای سرور", "error");
        }
      } catch (e: any) {
        const msg = e?.message || "network_error";
        setError(msg);
        showToast("خطای شبکه — اتصال یا سرور را بررسی کن.", "error");
      } finally {
        setLoading(false);
      }
    },
    [platform, q]
  );

  // بار اول و وقتی پلتفرم عوض می‌شود
  useEffect(() => {
    fetchPage();
  }, [platform, fetchPage]);

  // Auto-refresh هر 10 ثانیه (وقتی تیک خورده باشد)
  useEffect(() => {
    if (!autoRefresh) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    fetchPage(); // فوراً هم تازه‌سازی کن
    timerRef.current = window.setInterval(() => {
      fetchPage();
    }, 10000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [autoRefresh, fetchPage]);

  // هندلرهای صفحه‌بندی
  const goNewer = () => {
    if (!prevCursor || loading) return;
    fetchPage({ cursor: prevCursor, dir: "prev" });
  };
  const goOlder = () => {
    if (!nextCursor || loading) return;
    fetchPage({ cursor: nextCursor, dir: "next" });
  };

  // Enter برای جستجو
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") fetchPage();
  };

  // ریست فیلترها
  const resetFilters = () => {
    setPlatform("");
    setQ("");
    fetchPage({}); // صفحه اول
    showToast("فیلترها ریست شد.", "info");
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      {/* نوار کنترل‌ها */}
      <div className="rounded-xl border p-4 bg-white shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="border rounded-lg p-2"
            disabled={loading}
          >
            <option value="">تمام پلتفرم‌ها</option>
            <option value="telegram">Telegram</option>
            <option value="instagram">Instagram</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="web">Web</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="voip">VoIP</option>
          </select>

          <div className="md:col-span-2 flex flex-wrap items-center gap-2">
            <input
              className="border rounded-lg p-2 flex-1 min-w-[200px]"
              placeholder="جستجو در متن پیام…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onSearchKey}
              disabled={loading}
            />
            <button
              onClick={() => fetchPage()}
              className="px-4 py-2 rounded-lg border bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? "در حال بارگذاری…" : "جستجو"}
            </button>
            <button
              onClick={() => fetchPage()}
              className="px-4 py-2 rounded-lg border bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
              disabled={loading}
              aria-busy={loading}
            >
              Refresh
            </button>
            <button
              onClick={resetFilters}
              className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50"
              disabled={loading || (!platform && !q)}
              title="پاک‌کردن فیلترها"
            >
              پاک‌کردن فیلترها
            </button>

            <label className="text-sm flex items-center gap-2 select-none ml-auto">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                disabled={loading}
              />
              Auto-Refresh (هر 10 ثانیه)
            </label>
          </div>
        </div>

        {/* وضعیت آخرین بروزرسانی */}
        <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
          <span>تعداد آیتم‌های صفحه: {items.length}</span>
          {lastUpdated && (
            <span dir="ltr">آخرین بروزرسانی: {lastUpdated.toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      {/* نقطه اسکرول برای برگشت به ابتدای لیست */}
      <div ref={listTopRef} />

      {/* خطا به‌صورت بلوک + Toast بالاپر */}
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 text-red-800 p-3 text-sm">
          خطا: {error}
        </div>
      )}
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* لیست پیام‌ها */}
      <div className="rounded-xl border bg-white shadow-sm">
        {loading ? (
          <ul className="divide-y">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-gray-600">
            <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-gray-100 grid place-items-center">
              <svg width="20" height="20" viewBox="0 0 24 24" className="text-gray-500">
                <path
                  fill="currentColor"
                  d="M4 6h16v2H4zm2 5h12v2H6zm-2 5h16v2H4z"
                />
              </svg>
            </div>
            <div className="mb-2 font-medium">نتیجه‌ای پیدا نشد</div>
            <div className="text-xs text-gray-500 mb-4">فیلترها را تغییر بده یا پاک کن.</div>
            <button
              onClick={resetFilters}
              className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 disabled:opacity-50"
              disabled={loading || (!platform && !q)}
            >
              پاک‌کردن فیلترها
            </button>
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((m) => (
              <li key={m.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-8 h-8 rounded-full grid place-items-center text-white ${
                      m.is_bot_response ? "bg-emerald-500" : "bg-orange-500"
                    }`}
                    title={m.is_bot_response ? "Bot" : "User"}
                  >
                    {m.is_bot_response ? "B" : "U"}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full border">{m.platform || "-"}</span>
                      <span dir="ltr">{new Date(m.created_at).toLocaleString()}</span>
                    </div>

                    <div
                      className={`mt-2 rounded-2xl p-3 text-sm leading-7 ${
                        m.is_bot_response
                          ? "bg-emerald-50 text-emerald-900"
                          : "bg-orange-50 text-orange-900"
                      }`}
                    >
                      {m.message_text || <span className="opacity-50">(بدون متن)</span>}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* صفحه‌بندی */}
        <div className="p-4 border-t flex items-center justify-between">
          <button
            onClick={goNewer}
            className="px-3 py-2 rounded-lg border bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
            disabled={!prevCursor || loading}
          >
            جدیدتر
          </button>
          <button
            onClick={goOlder}
            className="px-3 py-2 rounded-lg border bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
            disabled={!nextCursor || loading}
          >
            قدیمی‌تر
          </button>
        </div>
      </div>
    </div>
  );
}
