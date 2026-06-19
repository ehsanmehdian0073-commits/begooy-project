import { NextResponse } from "next/server";
import { createClientForAction } from "@/utils/supabase/server";

type AuthResult =
  | { userId: string; response?: never }
  | { userId?: never; response: NextResponse };

export async function requireVerifiedUserId(): Promise<AuthResult> {
  const supabase = await createClientForAction();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    return {
      response: NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      ),
    };
  }

  return { userId: user.id };
}
