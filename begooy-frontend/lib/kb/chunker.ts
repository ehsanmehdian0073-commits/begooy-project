// lib/kb/chunker.ts
export type Chunk = { index: number; text: string };

/** تنظیمات پیش‌فرض امن */
const DEFAULT_TARGET_TOKENS = 700;
const DEFAULT_OVERLAP_TOKENS = 80;
const DEFAULT_MAX_CHARS = 2800;

/** تخمین تعداد توکن‌ها (تقریبی و سریع) */
function estTokens(s: string): number {
  return Math.ceil((s?.length ?? 0) / 4);
}

/** نرمال‌سازی متن خام */
function normalize(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\u00AD/g, "")               // soft hyphen
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** جداکردن متن به پاراگراف‌های معنی‌دار */
function splitParagraphs(s: string): string[] {
  const text = normalize(s);
  const paras = text.split(/\n{2,}/g).map(p => p.trim()).filter(Boolean);
  return paras.length ? paras : (text ? [text] : []);
}

/** جداکردن پاراگراف به جمله‌ها (پشتیبانی فارسی/انگلیسی) */
function splitSentences(p: string): string[] {
  const out: string[] = [];
  let buf = "";
  const endPunct = /[\.!\?؟؛…]/;

  for (const ch of p) {
    buf += ch;
    if (endPunct.test(ch)) {
      const trimmed = buf.trim();
      if (trimmed) out.push(trimmed);
      buf = "";
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.length ? out : [p.trim()];
}

/** خرد کردن قطعات بسیار بلند به تکه‌های کوچکتر (~N کاراکتر) */
function forceBreakByChars(s: string, maxChars: number): string[] {
  if (s.length <= maxChars) return [s];
  const parts: string[] = [];
  const step = Math.max(200, Math.floor(maxChars * 0.45));
  for (let i = 0; i < s.length; i += step) {
    parts.push(s.slice(i, i + step));
  }
  return parts;
}

/**
 * چانکینگ جمله‌محور با همپوشانی توکنی و سقف کاراکتر
 * خروجی: آرایه‌ای از { index, text }
 */
export function chunkText(
  input: string,
  targetTokens: number = DEFAULT_TARGET_TOKENS,
  overlapRatio: number = DEFAULT_OVERLAP_TOKENS / DEFAULT_TARGET_TOKENS
): Chunk[] {
  const maxChars = DEFAULT_MAX_CHARS;
  const overlapTokens = Math.max(
    0,
    Math.floor(
      Number.isFinite(overlapRatio) && overlapRatio > 0 && overlapRatio < 1
        ? targetTokens * overlapRatio
        : DEFAULT_OVERLAP_TOKENS
    )
  );

  const paragraphs = splitParagraphs(input);

  const chunks: string[] = [];
  let cur: string[] = [];
  let curTok = 0;

  const flush = (force = false) => {
    if (!cur.length) return;

    let joined = cur.join(" ").replace(/\s{2,}/g, " ").trim();

    // اگر خیلی بلند شد، به اجزای کوچکتر بشکن
    if (joined.length > maxChars) {
      const hard = forceBreakByChars(joined, maxChars);
      for (const h of hard) {
        chunks.push(h.trim());
      }
      // بعد از شکست، برای همپوشانی از ته آخرین قطعه نگه داریم
      if (!force && overlapTokens > 0) {
        const tail = chunks[chunks.length - 1] || "";
        const words = tail.split(/\s+/);
        let backTok = 0;
        const keep: string[] = [];
        for (let i = words.length - 1; i >= 0 && backTok < overlapTokens; i--) {
          keep.unshift(words[i]);
          backTok += estTokens(words[i] + " ");
        }
        cur = keep;
        curTok = estTokens(keep.join(" "));
        return;
      }
      cur = [];
      curTok = 0;
      return;
    }

    chunks.push(joined);

    // همپوشانی توکنی برای تداوم معنا بین چانک‌ها
    if (!force && overlapTokens > 0) {
      const words = joined.split(/\s+/);
      let backTok = 0;
      const keep: string[] = [];
      for (let i = words.length - 1; i >= 0 && backTok < overlapTokens; i--) {
        keep.unshift(words[i]);
        backTok += estTokens(words[i] + " ");
      }
      cur = keep;
      curTok = estTokens(keep.join(" "));
    } else {
      cur = [];
      curTok = 0;
    }
  };

  for (const para of paragraphs) {
    const sents = splitSentences(para);

    for (const sent of sents) {
      const t = estTokens(sent + " ");

      // جملهٔ خیلی خیلی بلند → ابتدا بافر فعلی را ببند، بعد جمله را قطعه‌قطعه کن
      if (t > targetTokens * 1.2) {
        if (curTok > 0) flush(false);
        const hard = forceBreakByChars(sent, maxChars);
        for (const h of hard) {
          cur = [h];
          curTok = estTokens(h + " ");
          flush(false);
        }
        continue;
      }

      if (curTok + t > targetTokens) {
        flush(false);
      }
      cur.push(sent);
      curTok += t;
    }
  }

  flush(true);

  // اگر آخرین چانک خیلی ریز بود، به قبلی بچسبان
  if (chunks.length >= 2) {
    const last = chunks[chunks.length - 1];
    if (estTokens(last) < Math.floor(targetTokens / 3)) {
      chunks[chunks.length - 2] = (chunks[chunks.length - 2] + " " + last).trim();
      chunks.pop();
    }
  }

  return chunks.map((text, i) => ({ index: i, text }));
}
