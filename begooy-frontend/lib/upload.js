import { supabase } from "./supabase";

export async function uploadAttachment({ file, sessionId }) {
  const ext = file.name.split(".").pop() || "";
  const fname = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const path = `${sessionId}/${fname}`;

  const { data, error } = await supabase
    .storage
    .from("attachments")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || undefined,
    });

  if (error) throw error;

  // public URL
  const { data: pub } = supabase.storage.from("attachments").getPublicUrl(path);
  return { url: pub.publicUrl, path, name: file.name, type: file.type, size: file.size };
}
