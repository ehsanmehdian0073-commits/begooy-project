"use client";

import { createBrowserClient } from "@supabase/ssr";

type CookieOptions = {
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
  sameSite?: "lax" | "strict" | "none";
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
    const s = options.sameSite === "none" ? "None" : options.sameSite[0].toUpperCase() + options.sameSite.slice(1);
    cookie += `; SameSite=${s}`;
  }
  if (options.secure) cookie += `; Secure`;
  document.cookie = cookie;
}

function deleteCookie(name: string, options: CookieOptions = {}) {
  writeCookie(name, "", { ...options, maxAge: 0, expires: new Date(0) });
}

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp(`(?:^|; )${encodeURIComponent(name)}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
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
        // روش جدید ترجیحی (داشتن هر دو متد)
        getAll() {
          return parseAll().map(({ name, value }) => ({ name, value }));
        },
        setAll(cookies: Array<{ name: string; value: string; options?: any }>) {
          cookies.forEach(({ name, value, options }) => writeCookie(name, value, options));
        },

      },
    }
  );
}
