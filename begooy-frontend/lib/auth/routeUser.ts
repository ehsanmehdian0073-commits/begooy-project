import { NextResponse } from "next/server";
import { createClientForAction } from "@/utils/supabase/server";

export async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createClientForAction();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

export function unauthorizedJson() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
