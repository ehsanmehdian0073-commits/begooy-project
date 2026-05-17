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
