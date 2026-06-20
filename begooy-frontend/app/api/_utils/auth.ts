import { NextResponse } from "next/server";
import { createClientForAction } from "@/utils/supabase/server";

type AuthResult =
  | { userId: string; response: null }
  | { userId: null; response: NextResponse };

export async function requireAuthenticatedUserId(): Promise<AuthResult> {
  const supabase = await createClientForAction();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      userId: null,
      response: NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      ),
    };
  }

  return { userId: user.id, response: null };
}
