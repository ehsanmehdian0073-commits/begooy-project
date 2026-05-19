import { NextResponse } from "next/server";
import { createClientForAction } from "@/utils/supabase/server";

type AuthSuccess = { userId: string };
type AuthFailure = { response: NextResponse };
export type AuthResult = AuthSuccess | AuthFailure;

export function isAuthFailure(result: AuthResult): result is AuthFailure {
  return "response" in result;
}

export async function requireVerifiedUser(req?: Request): Promise<AuthResult> {
  const supabase = await createClientForAction();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return {
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    };
  }

  const claimedUserId = req?.headers.get("x-user-id")?.trim();
  if (claimedUserId && claimedUserId !== user.id) {
    return {
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    };
  }

  return { userId: user.id };
}
