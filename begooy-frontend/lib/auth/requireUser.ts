import { NextResponse } from "next/server";
import { createClientForAction } from "@/utils/supabase/server";

type RequireUserResult =
  | { userId: string }
  | { response: NextResponse };

export async function requireUser(req?: Request): Promise<RequireUserResult> {
  const supabase = await createClientForAction();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }

  const claimedUserId = req?.headers.get("x-user-id")?.trim();
  if (claimedUserId && claimedUserId !== user.id) {
    return { response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  }

  return { userId: user.id };
}
