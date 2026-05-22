import { createClientForAction } from "@/utils/supabase/server";

export async function requireUserId() {
  const supabase = await createClientForAction();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}
