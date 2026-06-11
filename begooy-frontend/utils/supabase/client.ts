"use client";

import { createBrowserClient } from "@supabase/ssr";

type CookieOptions = {
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
  sameSite?: boolean | "lax" | "strict" | "none";
  secure?: boolean;
};

function writeCookie(name: string, value: string, options: CookieOptions = {}) {
  if (typeof document === "undefined") return;
  let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
  if (options.maxAge != null) cookie += `; Max-Age=${options.maxAge}`;
  if (options.expires) cookie += `; Expires=${options.expires.toUTCString()}`;
  cookie += `; Path=${options.path ?? "/"}`;
  if (options.domain) cookie += `; Domain=${options.domain}`;
  if (options.sameSite) {
    const sameSite = options.sameSite === true ? "strict" : options.sameSite;
    const s = sameSite === "none" ? "None" : sameSite[0].toUpperCase() + sameSite.slice(1);
    cookie += `; SameSite=${s}`;
  }
  if (options.secure) cookie += `; Secure`;
  document.cookie = cookie;
}

function parseAll(): Array<{ name: string; value: string }> {
  if (typeof document === "undefined") return [];
  const items = document.cookie ? document.cookie.split("; ") : [];
  return items
    .map((p) => {
      const eq = p.indexOf("=");
      const name = decodeURIComponent(p.substring(0, eq));
      const value = decodeURIComponent(p.substring(eq + 1));
      return { name, value };
    })
    .filter(Boolean);
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return parseAll().map(({ name, value }) => ({ name, value }));
        },
        setAll(cookies: Array<{ name: string; value: string; options?: CookieOptions }>) {
          cookies.forEach(({ name, value, options }) => writeCookie(name, value, options));
        },
      },
    }
  );
}
