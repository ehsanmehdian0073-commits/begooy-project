import { createClientForAction } from "@/utils/supabase/server";

export async function getAuthenticatedUserId() {
  const supabase = await createClientForAction();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user.id;
}
