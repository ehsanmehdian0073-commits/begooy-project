// utils/supabase/server.ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/** Next.js 15: cookies() ممکن است Promise برگرداند → این رَپِر همیشه یک cookieStore آماده برمی‌گرداند. */
async function getCookieStore() {
  const c = cookies() as any;
  return typeof c?.then === "function" ? await c : c;
}

/** فقط برای Server Componentها (خواندن فقط) */
export async function createClientReadOnly() {
  const cookieStore = await getCookieStore();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},        // no-op: در Server Component مجاز به نوشتن نیستیم
        remove() {},     // no-op
      },
    }
  );
}

/** فقط برای Server Actionها و Route Handlerها (مجاز به set/remove کوکی) */
export async function createClientForAction() {
  const cookieStore = await getCookieStore();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: "", ...options, maxAge: 0, path: "/" });
        },
      },
    }
  );
}

// سازگاری موقت با ایمپورت‌های قدیمی:
export { createClientReadOnly as createClient };
