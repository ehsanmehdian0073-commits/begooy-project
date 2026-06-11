import { NextResponse } from "next/server";
import { createClientForAction } from "@/utils/supabase/server";

export async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createClientForAction();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) return null;
  return user.id;
}

export function unauthorizedResponse(error = "unauthorized") {
  return NextResponse.json({ ok: false, error }, { status: 401 });
}

export function sameOriginJsonHeaders(req: Request): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const cookie = req.headers.get("cookie");
  if (cookie) headers.Cookie = cookie;
  return headers;
}
