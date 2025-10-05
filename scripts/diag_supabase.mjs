import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SRV_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function mask(s, keep = 6) {
  if (!s) return "";
  return s.slice(0, keep) + "..." + s.slice(-4);
}

console.log("URL:", SUPABASE_URL || "(empty)");
console.log("SRV_KEY:", SRV_KEY ? mask(SRV_KEY) : "(empty)");

if (!SUPABASE_URL || !SRV_KEY) {
  console.error("❌ Env missing. Check .env.local");
  process.exit(1);
}

try {
  // تست خام HTTPS بدون کلاینت؛ اگر به 401/404 برسیم یعنی شبکه OK است
  const head = await fetch(`${SUPABASE_URL}/rest/v1/`, { method: "HEAD" });
  console.log("Raw HTTPS to /rest/v1/ →", head.status, head.statusText);
} catch (e) {
  const c = e?.cause || {};
  console.error("❌ Raw HTTPS failed:", e?.name, e?.message, "|", c.code, c.errno, c.syscall, c.hostname);
}

const supa = createClient(SUPABASE_URL, SRV_KEY, { auth: { persistSession: false } });

try {
  const { data, error } = await supa.from("knowledge_base").select("id").limit(1);
  if (error) throw error;
  console.log("✅ Supabase client query OK. Row count:", (data || []).length);
} catch (e) {
  const c = e?.cause || {};
  console.error("❌ Supabase client query failed:", e?.message || e, "|", c.code, c.errno, c.syscall, c.hostname);
}
