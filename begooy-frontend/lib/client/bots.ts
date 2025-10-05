// lib/client/bots.ts
// Helper funcs for calling /api/bots/* from the browser UI.
// NOTE: باید userId واقعی را به این توابع بدهی (مثلاً از supabase.auth.getUser()).

type SaveSettingsArgs = {
  botId: string;
  userId: string;
  settings: Record<string, any>;
};

type ApplyPromptArgs = {
  botId: string;
  userId: string;
  prompt: string;
};

export async function saveBotSettings({ botId, userId, settings }: SaveSettingsArgs) {
  const res = await fetch("/api/bots/save-settings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": userId,
    },
    body: JSON.stringify({ botId, settings }),
  });
  const json = await res.json();
  if (!res.ok || !json?.ok) throw new Error(json?.error ?? "save_settings_failed");
  return json.bot as { id: string; settings_json: Record<string, any> };
}

export async function applyBotPrompt({ botId, userId, prompt }: ApplyPromptArgs) {
  const res = await fetch("/api/bots/apply-prompt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": userId,
    },
    body: JSON.stringify({ botId, prompt }),
  });
  const json = await res.json();
  if (!res.ok || !json?.ok) throw new Error(json?.error ?? "apply_prompt_failed");
  return json.bot as { id: string; prompt: string; updated_at: string };
}
