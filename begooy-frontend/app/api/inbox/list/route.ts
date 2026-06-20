export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as sb } from "@/lib/supabaseAdmin";
import { requireAuthenticatedUserId } from "@/app/api/_utils/auth";

type Cursor = { createdAt: string; id: string } | null;

function parseCursor(cur?: string | null): Cursor {
  if (!cur) return null;
  const [createdAt, id] = cur.split("::");
  if (!createdAt || !id) return null;
  return { createdAt, id };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuthenticatedUserId();
    if (auth.response) return auth.response;
    const userId = auth.userId;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);
    const platform = searchParams.get("platform") || undefined; // telegram / instagram / ...
    const cursor = parseCursor(searchParams.get("cursor"));
    const dir = searchParams.get("dir") === "prev" ? "prev" : "next"; // پیش‌فرض: next (قدیمی‌تر)
    const q = (searchParams.get("q") || "").trim();

    let query = sb
      .from("conversations")
      .select("id, session_id, platform, message_text, is_bot_response, created_at")
      .eq("user_id", userId)
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
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    let rows = data ?? [];
    if (dir === "prev") rows = rows.reverse();

    const hasMore = rows.length > limit;
    if (hasMore) rows = rows.slice(0, limit);

    const nextCursor =
      rows.length ? `${rows[rows.length - 1].created_at}::${rows[rows.length - 1].id}` : null;
    const prevCursor = rows.length ? `${rows[0].created_at}::${rows[0].id}` : null;

    return NextResponse.json({ ok: true, items: rows, nextCursor, prevCursor, hasMore });
  } catch (e: any) {
    console.error("inbox_list_error", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
