// scripts/insert_kb.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---- ENV ----
const SB_URL = Deno.env.get("SB_URL")!;
const SB_SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE")!;
const OR_API_KEY = Deno.env.get("OR_API_KEY")!;
const OR_BASE = Deno.env.get("OR_BASE") ?? "https://openrouter.ai/api/v1";
const OR_EMBED_MODEL =
  Deno.env.get("OR_EMBED_MODEL") ?? "openai/text-embedding-3-small";

const supabase = createClient(SB_URL, SB_SERVICE_ROLE);

// ---- Function to get embeddings ----
async function getEmbedding(text: string): Promise<number[]> {
  console.log("📡 Sending request to OpenRouter embeddings API...");
  const res = await fetch(`${OR_BASE}/embeddings`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OR_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OR_EMBED_MODEL,
      input: text,
    }),
  });

  if (!res.ok) {
    console.error("❌ OpenRouter error:", res.status, await res.text());
    throw new Error(`OpenRouter request failed: ${res.status}`);
  }

  const data = await res.json();
  return data.data[0].embedding as number[];
}

// ---- Main ----
const text = "این یک تست برای ذخیره در جدول knowledge_base است";

try {
  const embedding = await getEmbedding(text);

  const { error } = await supabase.from("knowledge_base").insert({
    content: text,
    embedding,
  });

  if (error) {
    console.error("❌ Insert error:", error);
    Deno.exit(1);
  } else {
    console.log("✅ Inserted into knowledge_base successfully!");
  }
} catch (err) {
  console.error("❌ Fatal error:", err);
  Deno.exit(1);
}
