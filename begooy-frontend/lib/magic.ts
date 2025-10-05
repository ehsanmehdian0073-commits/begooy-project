// lib/magic.ts

// ───────────────────────────────────────────────────────────────────────────────
// Types
type Meta = {
  title?: string;
  description?: string;
  keywords?: string[];
  siteName?: string;
  ogTitle?: string;
  ogSiteName?: string;
};

type Contacts = {
  phones: string[];
  emails: string[];
  social: { telegram?: string[]; instagram?: string[]; whatsapp?: string[] };
};

type KBHint =
  | { type: "url"; value: string; title?: string }
  | { type: "text"; value: string; title?: string };

// ───────────────────────────────────────────────────────────────────────────────
// URL helpers

const DISALLOWED_SCHEMES = new Set(["javascript:", "data:", "vbscript:"]);

function normalizeUrl(input: string): URL {
  let raw = (input || "").trim();

  if (!raw) throw new Error("invalid_url");

  // quick reject of javascript/data/…
  const lowered = raw.toLowerCase();
  for (const bad of DISALLOWED_SCHEMES) {
    if (lowered.startsWith(bad)) throw new Error("invalid_url");
  }

  // prepend protocol if missing
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("invalid_url");
  }

  if (!["http:", "https:"].includes(u.protocol)) throw new Error("invalid_url");

  return u;
}

// ───────────────────────────────────────────────────────────────────────────────
// Network

async function fetchWithTimeout(resource: RequestInfo | URL, opts: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 12000, ...rest } = opts;
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(resource, {
      ...rest,
      signal: ctrl.signal,
      headers: {
        "User-Agent": "BegoyBotScanner/1.0 (+https://begoy.ir)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...(rest.headers || {}),
      },
    });
  } finally {
    clearTimeout(id);
  }
}

export async function fetchHTML(url: string): Promise<{ html: string; finalUrl: string }> {
  const u = normalizeUrl(url);
  const res = await fetchWithTimeout(u.toString(), { redirect: "follow" });

  // Some sites return non-200 but still with body. We keep it lenient but check content-type.
  const ct = res.headers.get("content-type") || "";
  if (!/text\/html|application\/xhtml\+xml/i.test(ct)) {
    // Not an HTML page — return small stub to avoid breaking pipeline.
    return { html: "<!-- non-html -->", finalUrl: res.url || u.toString() };
  }

  let html = await res.text();

  // Limit to ~1.5MB to avoid huge memory/regex costs
  const MAX = 1_500_000;
  if (html.length > MAX) html = html.slice(0, MAX);

  return { html, finalUrl: res.url || u.toString() };
}

// ───────────────────────────────────────────────────────────────────────────────
// Parsers

export function extractMeta(html: string): Meta {
  const pick = (re: RegExp) => (html.match(re)?.[1] || "").trim() || undefined;

  const metaTag = (name: string) =>
    pick(
      new RegExp(
        `<meta[^>]+(?:name|property)=(?:"|')${name}(?:"|')[^>]+content=(?:"|')([^"']+)(?:"|')[^>]*>`,
        "i",
      ),
    );

  const title = pick(/<title[^>]*>([^<]+)<\/title>/i);
  const description = metaTag("description") || metaTag("og:description");
  const ogTitle = metaTag("og:title");
  const siteName = metaTag("application-name") || metaTag("og:site_name");
  const ogSiteName = metaTag("og:site_name");
  const keywordsStr = metaTag("keywords");
  const keywords = keywordsStr
    ? keywordsStr
        .split(/[,\s]+/g)
        .map((k) => k.trim())
        .filter(Boolean)
    : [];

  return { title, description, keywords, siteName, ogTitle, ogSiteName };
}

export function extractContacts(html: string): Contacts {
  // Emails
  const emails = Array.from(
    new Set(
      (html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((e) =>
        e.toLowerCase(),
      ),
    ),
  );

  // Phones (generic, lenient, filters by >=7 digits)
  const phones = Array.from(
    new Set(
      (html.match(
        /(?:\+?\d{1,3}[\s\-]?)?(?:\(?\d{2,4}\)?[\s\-]?)?\d{3,4}[\s\-]?\d{3,4}/g,
      ) || [])
        .map((x) => x.replace(/\s+/g, " ").trim())
        .filter((x) => x.replace(/\D/g, "").length >= 7),
    ),
  );

  const tg = Array.from(new Set((html.match(/t\.me\/[A-Za-z0-9_]+/g) || []).map((x) => "https://" + x)));
  const ig = Array.from(
    new Set((html.match(/instagram\.com\/[A-Za-z0-9._]+/gi) || []).map((x) => "https://" + x)),
  );
  const wa = Array.from(new Set((html.match(/wa\.me\/\d+/gi) || []).map((x) => "https://" + x)));

  return { phones, emails, social: { telegram: tg, instagram: ig, whatsapp: wa } };
}

// ───────────────────────────────────────────────────────────────────────────────
// Heuristics

const KEYWORDS: Record<string, string[]> = {
  dentistry: ["دندان", "دندان‌پزشک", "کلینیک دندان", "ارتودنسی", "لمینت", "جرمگیری"],
  beauty: ["زیبایی", "کلینیک", "پوست", "مو", "لیزر", "بوتاکس", "فیلر"],
  ecommerce: ["خرید", "فروشگاه", "سبد", "محصول", "پرداخت", "ارسال", "تضمین"],
  education: ["آموزش", "دوره", "ثبت‌نام", "سرفصل", "کلاس", "کارگاه"],
  industrial: ["صنعتی", "کارخانه", "تولید", "قطعه", "ماشین‌آلات", "پروسه"],
  services: ["خدمات", "سفارش", "پشتیبانی", "رزرو", "تماس", "گارانتی"],
  restaurant: ["رستوران", "منو", "رزرو میز", "پیک", "غذا", "کافه"],
};

export function guessIndustry(text: string): { industry: string; score: number } {
  const t = (text || "").toLowerCase();
  let best = { industry: "services", score: 0 };
  for (const [ind, kws] of Object.entries(KEYWORDS)) {
    let s = 0;
    for (const k of kws) if (t.includes(k.toLowerCase())) s += 1;
    if (s > best.score) best = { industry: ind, score: s };
  }
  return best;
}

export function proposeChannels(industry: string, contacts: Contacts): string[] {
  const hasIG = (contacts.social.instagram?.length || 0) > 0;
  const hasTG = (contacts.social.telegram?.length || 0) > 0;
  const hasWA = (contacts.social.whatsapp?.length || 0) > 0;

  const base = ["webchat"];
  if (hasTG) base.push("telegram");
  if (hasWA) base.push("whatsapp");
  if (hasIG) base.push("instagram");

  if (industry === "ecommerce") return Array.from(new Set([...base, "instagram"]));
  if (industry === "dentistry" || industry === "beauty")
    return Array.from(new Set([...base, "whatsapp"]));
  if (industry === "education") return Array.from(new Set([...base, "telegram"]));
  return Array.from(new Set(base));
}

export function proposeTone(industry: string): "support" | "retail" | "edu" {
  if (industry === "ecommerce") return "retail";
  if (industry === "education") return "edu";
  return "support";
}

export function proposeKB(url: string, meta: Meta, html: string): KBHint[] {
  const out: KBHint[] = [];
  const origin = (() => {
    try {
      return new URL(url).origin;
    } catch {
      return "";
    }
  })();

  const norm = (u: string) => {
    if (!u) return u;
    if (!/^https?:\/\//i.test(u)) {
      try {
        return new URL(u, origin || url).href;
      } catch {
        return u;
      }
    }
    return u;
  };

  const candidates = [
    "/faq",
    "/faqs",
    "/questions",
    "/policy",
    "/policies",
    "/terms",
    "/about",
    "/returns",
    "/privacy",
    "/help",
    "/support",
    "/contact",
  ];

  // Collect anchors
  const anchors = Array.from(
    new Set(
      (html.match(/href\s*=\s*"(.*?)"/gi) || [])
        .map((m) => m.replace(/^[^"]*"/, "").replace(/".*$/, "")) // extract value
        .filter(Boolean),
    ),
  );

  for (const a of anchors) {
    const low = a.toLowerCase();
    if (candidates.some((c) => low.includes(c))) {
      out.push({ type: "url", value: norm(a) });
    }
  }

  if (out.length === 0) out.push({ type: "url", value: norm("/faq") });

  if (meta?.description) {
    out.push({ type: "text", value: meta.description, title: "meta-description" });
  }

  return out;
}

// ───────────────────────────────────────────────────────────────────────────────
// Main

export async function scanUrl(url: string) {
  // Validate & fetch
  const { html, finalUrl } = await fetchHTML(url);

  // Parse & heuristics
  const meta = extractMeta(html);
  const contacts = extractContacts(html);

  const bigText = [
    finalUrl,
    meta.title,
    meta.description,
    meta.keywords?.join(" "),
    html.slice(0, 120000),
  ]
    .filter(Boolean)
    .join(" ");

  const { industry } = guessIndustry(bigText);
  const channels = proposeChannels(industry, contacts);
  const tone = proposeTone(industry);
  const kbHints = proposeKB(finalUrl, meta, html);

  // Brand name: prefer og:site_name → siteName → og:title → <title> → hostname
  let brand =
    meta.ogSiteName ||
    meta.siteName ||
    meta.ogTitle ||
    meta.title ||
    (() => {
      try {
        return new URL(finalUrl).hostname;
      } catch {
        return finalUrl;
      }
    })();

  // Trim brand
  brand = (brand || "").toString().trim();

  return {
    url: finalUrl,
    brand,
    industry,
    tone,
    meta,
    contacts,
    channels,
    kbHints,
  };
}
