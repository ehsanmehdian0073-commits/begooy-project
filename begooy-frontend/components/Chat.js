"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

/* ===== تنظیمات ===== */
const BUCKET = "attachments";
const MAX_FILE_MB = 12;
const OUT_COLOR = "from-orange-500 to-orange-600";
const IN_BG = "bg-emerald-50";
const IN_TEXT = "text-emerald-900";

/* UUID helper */
const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** یک sid همیشه UUID تولید/برمی‌گرداند */
function getOrCreateSessionUUID() {
  if (typeof window === "undefined") return null;
  let sid = localStorage.getItem("begooy_sid");
  if (!sid || !uuidRegex.test(sid)) {
    sid =
      crypto?.randomUUID?.() ||
      `${Date.now()}-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    localStorage.setItem("begooy_sid", sid);
  }
  return sid;
}

/** نشانه وضعیت تحویل */
function StatusTicks({ status, isMine }) {
  if (!isMine) return null;
  const base = "ml-2 align-middle";
  if (status === "seen") return <span className={`${base} text-sky-500`} title="Seen">🗸🗸</span>;
  if (status === "delivered") return <span className={`${base} text-gray-400`} title="Delivered">🗸🗸</span>;
  return <span className={`${base} text-gray-400`} title="Sent">🗸</span>;
}

/** چیپ روز */
function DayChip({ label }) {
  return (
    <div className="flex items-center gap-3 my-2">
      <div className="grow h-px bg-black/10" />
      <div className="text-[11px] px-3 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200 shadow-sm">
        {label}
      </div>
      <div className="grow h-px bg-black/10" />
    </div>
  );
}

/** پیش‌نمایش ضمیمه داخل بابل */
function AttachmentPreview({ url, type }) {
  if (!url) return null;
  if (type?.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img
          src={url}
          alt="attachment"
          className="rounded-xl border border-black/5 max-h-56 object-cover mt-1"
        />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 mt-1 text-[13px] px-2 py-1 rounded bg-white/70 border border-black/10"
    >
      <span>📎</span>
      <span className="truncate max-w-[220px]">{url.split("/").pop()}</span>
    </a>
  );
}

/** اکشن‌های روی بابل (Reply/Quote) */
function BubbleActions({ onReply }) {
  return (
    <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 text-[12px] text-gray-400">
      <button onClick={onReply} className="px-2 py-1 rounded hover:bg-black/5" title="Reply">
        ↩︎ پاسخ
      </button>
    </div>
  );
}

export default function Chat() {
  /** State */
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [file, setFile] = useState(null);
  const [isDark, setIsDark] = useState(false);

  const endRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  // همیشه UUID معتبر
  const sessionId = useMemo(() => getOrCreateSessionUUID(), []);
  const idsRef = useRef(new Set());
  const tempMapRef = useRef(new Map());

  // auto-scroll
  const autoScrollRef = useRef(true);

  const scrollToBottom = useCallback((smooth = true) => {
    if (!autoScrollRef.current) return;
    endRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    scrollToBottom(true);
  }, [messages, isTyping, scrollToBottom]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    autoScrollRef.current = nearBottom;
  };

  /** قبل از هر چیز، سشن را در جدول sessions upsert کن */
  useEffect(() => {
    async function ensureSession() {
      if (!sessionId) return;
      try {
        await supabase
          .from("sessions")
          .upsert({ id: sessionId, channel: "web", platform: "web" }, { onConflict: "id" });
      } catch (e) {
        console.warn("upsert session failed:", e);
      }
    }
    ensureSession();
  }, [sessionId]);

  /** --- Load + Realtime (فقط همین session_id) --- */
  useEffect(() => {
    if (!sessionId) return;
    let mounted = true;

    (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(`
          id, platform, is_bot_response, message_text, created_at,
          reply_to, delivery_status, attachment_url, attachment_type, session_id
        `)
        .eq("platform", "web")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(600);

      if (error) {
        console.error("Load error:", error);
        return;
      }
      if (!mounted) return;

      const seen = new Set();
      const uniq = [];
      for (const m of data || []) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          uniq.push(m);
        }
      }
      idsRef.current = seen;
      setMessages(uniq);
    })();

    const ch = supabase
      .channel("conv-realtime-by-session")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversations",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new;
          // جایگزینی optimistic
          for (const [tempId, realId] of tempMapRef.current.entries()) {
            if (realId === row.id) {
              replaceTemp(tempId, row);
              tempMapRef.current.delete(tempId);
              return;
            }
          }
          if (!idsRef.current.has(row.id)) {
            idsRef.current.add(row.id);
            setMessages((p) => [...p, row]);
            if (row.is_bot_response && autoScrollRef.current) markSeen(row.id);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new;
          setMessages((prev) => prev.map((x) => (x.id === row.id ? { ...x, ...row } : x)));
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [sessionId]);

  const replaceTemp = (tempId, realRow) => {
    setMessages((prev) => prev.map((x) => (x.id === tempId ? realRow : x)));
    idsRef.current.add(realRow.id);
  };

  const timeOf = (iso) =>
    new Date(iso).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });

  /** گروه روز */
  const grouped = useMemo(() => {
    const byDay = {};
    for (const m of messages) {
      const day = new Date(m.created_at).toLocaleDateString("fa-IR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      (byDay[day] ||= []).push(m);
    }
    return byDay;
  }, [messages]);

  /** آپلود فایل به Storage */
  const uploadFile = async (f) => {
    if (!f) return { url: null, type: null };
    if (f.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`حداکثر حجم فایل ${MAX_FILE_MB}MB`);

    const ext = f.name.split(".").pop();
    const filename = `${sessionId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage.from(BUCKET).upload(filename, f, { upsert: false });
    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
    return { url: data.publicUrl, type: f.type || "application/octet-stream" };
  };

  /* ===== استریم تایپ زندهٔ بات ===== */
  const startBotStream = async (userText) => {
    const tempId = `temp-bot-${Date.now()}`;

    // 1) یک حباب موقت بات اضافه کن
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        platform: "web",
        is_bot_response: true,
        message_text: "",
        created_at: new Date().toISOString(),
        delivery_status: "typing",
        session_id: sessionId,
      },
    ]);
    setIsTyping(true);

    try {
      const res = await fetch("/api/bot/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, text: userText, tempId }),
      });

      if (!res.ok || !res.body) {
        // اگر استریم نشد، rely on realtime (پیام نهایی بعداً می‌آید)
        setIsTyping(false);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let leftover = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        leftover += decoder.decode(value, { stream: true });
        // هر پیام SSE با "\n\n" جداست
        let idx;
        while ((idx = leftover.indexOf("\n\n")) !== -1) {
          const raw = leftover.slice(0, idx).trim();
          leftover = leftover.slice(idx + 2);

          if (!raw.startsWith("data:")) continue;
          const jsonStr = raw.slice(5).trim();
          try {
            const ev = JSON.parse(jsonStr);
            if (ev.type === "delta" && ev.tempId === tempId && ev.token) {
              // متن حباب موقت را آپدیت کن
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempId ? { ...m, message_text: (m.message_text || "") + ev.token } : m
                )
              );
            } else if (ev.type === "done" && ev.tempId === tempId) {
              // استریم تمام شد: حباب موقت را بردار؛ پیام واقعی از Realtime می‌رسد
              setIsTyping(false);
              setMessages((prev) => prev.filter((m) => m.id !== tempId));
            } else if (ev.type === "error") {
              console.warn("stream error:", ev.message);
              setIsTyping(false);
              setMessages((prev) => prev.filter((m) => m.id !== tempId));
            }
          } catch {
            // ignore parse error
          }
        }
      }
    } catch (e) {
      console.warn("stream failed:", e);
      setIsTyping(false);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
  };

  /** ارسال پیام */
  const sendMessage = async () => {
    const value = input.trim();
    if (!value && !file) return;
    if (!sessionId) return;

    // قبل از ارسال، مطمئن شو سشن وجود دارد
    try {
      await supabase.from("sessions").upsert(
        { id: sessionId, channel: "web", platform: "web" },
        { onConflict: "id" }
      );
    } catch {}

    const tempId = `temp-${Date.now()}`;
    const nowIso = new Date().toISOString();

    const optimistic = {
      id: tempId,
      platform: "web",
      is_bot_response: false,
      message_text: value || (file ? "📎 فایل پیوست‌شده" : ""),
      created_at: nowIso,
      reply_to: replyTo?.id || null,
      delivery_status: "sent",
      attachment_url: null,
      attachment_type: null,
      session_id: sessionId,
    };

    setMessages((p) => [...p, optimistic]);
    setInput("");
    setReplyTo(null);

    try {
      let attach = { url: null, type: null };
      if (file) {
        attach = await uploadFile(file);
        setFile(null);
      }

      const insertPayload = {
        platform: "web",
        is_bot_response: false,
        message_text: value || (attach.url ? "📎 فایل پیوست‌شده" : ""),
        reply_to: replyTo?.id || null,
        delivery_status: "delivered",
        attachment_url: attach.url,
        attachment_type: attach.type,
        session_id: sessionId,
      };

      const { data, error } = await supabase
        .from("conversations")
        .insert(insertPayload)
        .select(`
          id, platform, is_bot_response, message_text, created_at,
          reply_to, delivery_status, attachment_url, attachment_type, session_id
        `)
        .single();

      if (error) throw error;

      tempMapRef.current.set(tempId, data.id);
      replaceTemp(tempId, data);

      // 🔧 استارت استریم پاسخ بات — فقط اگر چیزی برای مدل داریم
      const aiText =
        value ||
        (attach.url
          ? `یک فایل پیوست شد (${attach.type || "file"}): ${attach.url}\nاگر لازم است، درباره‌اش سوال بپرس یا راهنمایی بده.`
          : "");

      if (aiText) {
        startBotStream(aiText);
      }
    } catch (e) {
      console.error("Insert error:", e);
      setMessages((prev) => prev.filter((x) => x.id !== tempId));
      alert("ارسال پیام ناموفق بود.");
    }
  };

  /** mark seen (دمو) */
  const markSeen = async (id) => {
    try {
      await supabase.from("conversations").update({ delivery_status: "seen" }).eq("id", id);
    } catch {}
  };

  /** کی‌بورد */
  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  /** کانتکست منو: Reply */
  const onBubbleContext = (e, m) => {
    e.preventDefault();
    setReplyTo(m);
  };
  const clearReply = () => setReplyTo(null);
  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const RootBG = isDark ? "bg-[#0f0f10]" : "bg-[#f7f5f0]";
  const PanelBG = isDark ? "bg-[#151517]/90" : "bg-white/90";

  return (
    <div className={`flex flex-col items-center min-h-[100vh] ${RootBG} py-10`}>
      <div className={`w-full max-w-[520px] rounded-[28px] shadow-[0_25px_70px_-30px_rgba(0,0,0,0.35)] overflow-hidden ${PanelBG} backdrop-blur border border-white/40`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 via-orange-500 to-orange-600 text-white px-5 py-3 flex items-center justify-between">
          <button
            onClick={() => setIsDark((v) => !v)}
            className="text-[12px] px-3 py-1 rounded-full bg-black/20 hover:bg-black/30 transition"
            title={isDark ? "روشن" : "تیره"}
          >
            {isDark ? "روشن 🌞" : "تیره 🌙"}
          </button>
          <div className="text-center">
            <h1 className="text-[17px] font-extrabold tracking-tight">Begooy • وب‌چت</h1>
            <p className="text-[12px] opacity-90">Omni-inbox • Web / Telegram / Instagram</p>
          </div>
          <div className="w-9 h-9 rounded-2xl bg-white/25 flex items-center justify-center font-bold">B</div>
        </div>

        {/* Messages */}
        <div
          ref={listRef}
          onScroll={onScroll}
          className={`h-[60vh] overflow-y-auto px-4 py-3 ${isDark ? "bg-[#0c0c0d]" : "bg-gradient-to-br from-white/85 to-white/70"}`}
        >
          {Object.entries(grouped).map(([day, arr]) => (
            <div key={day}>
              <DayChip label={day} />
              {arr.map((m) => {
                const isMine = !m.is_bot_response;
                return (
                  <div
                    key={m.id}
                    id={`msg-${m.id}`}
                    className={`group flex ${isMine ? "justify-end" : "justify-start"} mb-3`}
                    onContextMenu={(e) => onBubbleContext(e, m)}
                    onTouchStart={(e) => {
                      const t = setTimeout(() => setReplyTo(m), 500);
                      e.currentTarget.addEventListener("touchend", () => clearTimeout(t), { once: true });
                    }}
                  >
                    {!isMine && (
                      <div className="mr-2 mt-1 w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[12px] select-none">
                        I
                      </div>
                    )}

                    <div
                      className={`max-w-[78%] px-4 py-2 rounded-2xl shadow-md text-[15px] leading-7 transition-transform duration-150
                      ${isMine ? `text-white bg-gradient-to-l ${OUT_COLOR} rounded-br-md hover:scale-[1.01]` : `${IN_BG} ${IN_TEXT} border border-emerald-100 rounded-bl-md hover:scale-[1.01]`}
                    `}
                    >
                      {m.reply_to && <Quoted messages={messages} id={m.reply_to} dark={isDark} />}

                      <div className="whitespace-pre-wrap">{m.message_text}</div>
                      {m.attachment_url && <AttachmentPreview url={m.attachment_url} type={m.attachment_type} />}

                      <div className={`mt-1 text-[11px] flex items-center ${isMine ? "text-white/85" : "text-emerald-600/70"}`}>
                        <span>{timeOf(m.created_at)}</span>
                        <StatusTicks status={m.delivery_status} isMine={isMine} />
                      </div>
                    </div>

                    {isMine && (
                      <div className="ml-2 mt-1 w-7 h-7 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[12px] select-none">
                        U
                      </div>
                    )}

                    <BubbleActions onReply={() => setReplyTo(m)} />
                  </div>
                );
              })}
            </div>
          ))}

          {/* Indicator تایپینگ برای ورودی (اختیاری) */}
          {isTyping && (
            <div className="flex justify-start mb-3">
              <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-4 py-2 rounded-2xl shadow-sm rounded-bl-md">
                <span className="inline-flex gap-1 items-center">
                  <i className="w-2 h-2 rounded-full inline-block bg-emerald-400 animate-bounce" />
                  <i className="w-2 h-2 rounded-full inline-block bg-emerald-400 animate-bounce [animation-delay:150ms]" />
                  <i className="w-2 h-2 rounded-full inline-block bg-emerald-400 animate-bounce [animation-delay:300ms]" />
                  <span className="text-[12px] ml-2 opacity-70">در حال نوشتن…</span>
                </span>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Reply bar + Composer */}
        <div className={`${isDark ? "bg-[#141416]" : "bg-gray-50/70"} border-t`}>
          {replyTo && (
            <div className="px-4 pt-2">
              <div className="flex items-center justify-between text-[12px] px-3 py-2 rounded-xl border border-black/10 bg-white/70">
                <div className="truncate">
                  پاسخ به:{" "}
                  <span className="opacity-80">
                    {replyTo.message_text?.slice(0, 60) || (replyTo.attachment_url ? "ضمیمه" : "پیام")}
                  </span>
                </div>
                <button onClick={clearReply} className="text-gray-500 hover:text-gray-700" title="بستن">
                  ✕
                </button>
              </div>
            </div>
          )}

          {file && (
            <div className="px-4 pt-2">
              <div className="flex items-center justify-between text-[12px] px-3 py-2 rounded-xl border border-black/10 bg-white/70">
                <div className="truncate flex items-center gap-2">
                  <span>📎</span>
                  <span>{file.name}</span>
                  <span className="opacity-60">({(file.size / 1024 / 1024).toFixed(1)}MB)</span>
                </div>
                <button onClick={() => setFile(null)} className="text-gray-500 hover:text-gray-700" title="حذف">
                  ✕
                </button>
              </div>
            </div>
          )}

          <div className="px-4 py-3">
            <div className="flex items-center gap-2">
              <label
                className="h-12 w-12 rounded-full bg-white/80 border border-black/10 flex items-center justify-center hover:bg-white cursor-pointer"
                title="ضمیمه"
              >
                <input type="file" className="hidden" onChange={onPickFile} />
                <span className="text-lg">📎</span>
              </label>

              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="پیامت رو بنویس… (Enter برای ارسال، Shift+Enter = خط جدید)"
                className="flex-1 h-12 resize-none rounded-[22px] border border-black/10 bg-white/85 backdrop-blur px-4 py-2 placeholder-gray-400 outline-none focus:ring-2 focus:ring-orange-400/60"
              />

              <button
                onClick={sendMessage}
                disabled={!input.trim() && !file}
                className="h-12 px-6 rounded-full text-white bg-gradient-to-l from-orange-500 via-orange-500 to-orange-600 shadow-[0_10px_25px_-10px_rgba(245,158,11,0.8)] hover:brightness-105 active:brightness-95 transition disabled:opacity-50"
              >
                ارسال ↗
              </button>
            </div>
            <div className="mt-1 pr-[86px] text-[11px] text-gray-400 select-none">
              Shift+Enter = خط جدید
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Quote */
function Quoted({ messages, id, dark }) {
  const ref = messages.find((m) => m.id === id);
  if (!ref) {
    return (
      <div
        className={`mb-2 text-[12px] px-3 py-2 rounded-xl border ${
          dark ? "bg-black/20 border-white/10" : "bg-black/5 border-black/10"
        }`}
      >
        پیام مرجع پیدا نشد.
      </div>
    );
  }

  return (
    <a
      href={`#msg-${id}`}
      onClick={(e) => {
        e.preventDefault();
        const el = document.querySelector(`#msg-${CSS.escape(id)}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-2", "ring-orange-400");
          setTimeout(() => el.classList.remove("ring-2", "ring-orange-400"), 900);
        }
      }}
      className={`block mb-2 text-[12px] px-3 py-2 rounded-xl border ${
        dark ? "bg-black/20 border-white/10" : "bg-black/5 border-black/10"
      }`}
      title="رفتن به پیام مرجع"
    >
      <span className="opacity-70">پاسخ به: </span>
      <span className="opacity-90">
        {ref.message_text?.slice(0, 80) || (ref.attachment_url ? "ضمیمه" : "پیام")}
      </span>
    </a>
  );
}
