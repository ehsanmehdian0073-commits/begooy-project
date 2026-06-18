export const runtime = "edge";

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/requireUser";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Cursor = { createdAt: string; id: string } | null;

function parseCursor(cur?: string | null): Cursor {
  if (!cur) return null;
  const [createdAt, id] = cur.split("::");
  if (!createdAt || !id) return null;
  return { createdAt, id };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser(req);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);
    const platform = searchParams.get("platform") || undefined; // telegram / instagram / ...
    const cursor = parseCursor(searchParams.get("cursor"));
    const dir = searchParams.get("dir") === "prev" ? "prev" : "next"; // پیش‌فرض: next (قدیمی‌تر)
    const q = (searchParams.get("q") || "").trim();

    let query = sb
      .from("conversations")
      .select("id, session_id, platform, message_text, is_bot_response, created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (platform) query = query.eq("platform", platform);
    if (q) query = query.ilike("message_text", `%${q}%`);

    // Keyset: حرکت به «قدیمی‌ترها»
    if (cursor && dir === "next") {
      query = query
        .lt("created_at", cursor.createdAt)
        .or(`created_at.eq.${cursor.createdAt},id.lt.${cursor.id}`);
    }

    // حرکت به «جدیدترها» (برگشت)
    if (cursor && dir === "prev") {
      query = query
        .gt("created_at", cursor.createdAt)
        .or(`created_at.eq.${cursor.createdAt},id.gt.${cursor.id}`)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
    }

    const { data, error } = await query.limit(limit + 1);
    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    let rows = data ?? [];
    if (dir === "prev") rows = rows.reverse();

    const hasMore = rows.length > limit;
    if (hasMore) rows = rows.slice(0, limit);

    const nextCursor =
      rows.length ? `${rows[rows.length - 1].created_at}::${rows[rows.length - 1].id}` : null;
    const prevCursor = rows.length ? `${rows[0].created_at}::${rows[0].id}` : null;

    return new Response(
      JSON.stringify({ ok: true, items: rows, nextCursor, prevCursor, hasMore }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (e: any) {
    console.error("inbox_list_error", e);
    return new Response(JSON.stringify({ ok: false, error: "server_error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
