import { NextResponse } from "next/server";
import { createClientForAction } from "@/utils/supabase/server";

export async function requireAuthenticatedUserId() {
  const supabase = await createClientForAction();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user?.id) {
    return {
      userId: null,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    };
  }

  return { userId: user.id, response: null };
}
