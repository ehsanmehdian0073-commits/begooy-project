// deno-lint-ignore-file no-explicit-any
// Edge Function: KB Seed (creates embeddings with OpenRouter and inserts into knowledge_base)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Required envs (use your existing secrets) ---
const SB_URL = Deno.env.get("SB_URL")!;
const SB_SERVICE_ROLE = Deno.env.get("SB_SERVICE_ROLE")!;
const OR_API_KEY = Deno.env.get("OR_API_KEY")!;
const OR_BASE = Deno.env.get("OR_BASE") ?? "https://openrouter.ai/api/v1";
const OR_EMBED_MODEL = Deno.env.get("OR_EMBED_MODEL") ?? "openai/text-embedding-3-small";

// A small auth token just for this seeding endpoint
const KB_SEED_TOKEN = Deno.env.get("KB_SEED_TOKEN")!;

// Supabase admin client
const supabase = createClient(SB_URL, SB_SERVICE_ROLE);

// OpenRouter headers
function orHeaders() {
  return {
    "Authorization": `Bearer ${OR_API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${OR_BASE}/embeddings`, {
    method: "POST",
    headers: orHeaders(),
    body: JSON.stringify({ model: OR_EMBED_MODEL, input: text }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Embed failed: ${res.status} ${errText}`);
  }
  const data = await res.json();
  if (!data?.data?.[0]?.embedding) {
    throw new Error(`Unexpected embedding response: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data.data[0].embedding as number[];
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const token = req.headers.get("x-seed-token");
    if (!token || token !== KB_SEED_TOKEN) {
      return new Response("Forbidden", { status: 403 });
    }

    const body = await req.json() as { content?: string; metadata?: any };
    const content = (body.content ?? "").trim();
    const metadata = body.metadata ?? {};

    if (!content) {
      return new Response(JSON.stringify({ ok: false, error: "content is required" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    // Build embedding
    const vec = await embed(content);
    const literal = `[${vec.join(",")}]`; // vector literal

    // Insert into KB
    const { data, error } = await supabase
      .from("knowledge_base")
      .insert({ content, embedding: literal as unknown as any, metadata })
      .select("id")
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
