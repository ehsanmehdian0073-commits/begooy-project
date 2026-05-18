import { NextResponse } from "next/server";
import { createClientForAction } from "@/utils/supabase/server";

export async function requireUserId(req?: Request) {
  const supabase = await createClientForAction();
  const auth = req?.headers.get("authorization") ?? "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  const result = bearer
    ? await supabase.auth.getUser(bearer)
    : await supabase.auth.getUser();

  const user = result.data.user;
  if (result.error || !user?.id) {
    return {
      userId: null,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    };
  }

  return { userId: user.id, response: null };
}
