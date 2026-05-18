// lib/supabaseAdmin.js
// ⚠️ Server-only Supabase admin client (bypasses RLS). Do NOT import in the browser.

import { createClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") {
  throw new Error("supabaseAdmin must only be imported on the server.");
}

/** @type {import("@supabase/supabase-js").SupabaseClient | null} */
let cachedAdmin = null;

function getSupabaseAdmin() {
  if (cachedAdmin) return cachedAdmin;

  const SUPABASE_URL =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const SERVICE_ROLE =
    process.env.SUPABASE_SERVICE_ROLE_KEY || // canonical
    process.env.SUPABASE_SERVICE_ROLE;       // fallback

  if (!SUPABASE_URL) {
    throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL).");
  }
  if (!SERVICE_ROLE) {
    throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE).");
  }

  // RLS is bypassed with service role. Use ONLY in server routes / jobs.
  cachedAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch, // use Next/Node fetch
      headers: {
        "X-Client-Info": "begooy-admin",
        "X-RLS-Bypass": "service-role",
      },
    },
  });
  return cachedAdmin;
}

export const supabaseAdmin = /** @type {import("@supabase/supabase-js").SupabaseClient} */ (new Proxy({}, {
  get(_target, prop) {
    return getSupabaseAdmin()[prop];
  },
}));
