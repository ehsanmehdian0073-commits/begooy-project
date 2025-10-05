// scripts/insert_kb.mjs
// Insert one KB row with OpenRouter embedding -> Supabase (pgvector) using Node.js

import { createClient } from '@supabase/supabase-js';

// ----- ENV -----
const SB_URL         = process.env.SB_URL;
const SB_SERVICE_ROLE= process.env.SB_SERVICE_ROLE;
const OR_API_KEY     = process.env.OR_API_KEY;
const OR_BASE        = process.env.OR_BASE || 'https://openrouter.ai/api/v1';
const OR_EMBED_MODEL = process.env.OR_EMBED_MODEL || 'openai/text-embedding-3-small';

if (!SB_URL || !SB_SERVICE_ROLE || !OR_API_KEY) {
  console.error('Missing envs: SB_URL / SB_SERVICE_ROLE / OR_API_KEY');
  process.exit(1);
}

// ----- INPUT (متن دانش) -----
const TEXT = `این یک نوت تستی است تا مطمئن شویم RAG کار می‌کند. نام بات: begooy.`;

// Node 18+ has global fetch. If you're on older Node, install node-fetch and import it.

// ----- OpenRouter embedding -----
async function embed(text) {
  const res = await fetch(`${OR_BASE}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OR_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OR_EMBED_MODEL,
      input: text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embed failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  const vec = data?.data?.[0]?.embedding;
  if (!Array.isArray(vec) || !vec.length) {
    throw new Error('Empty embedding');
  }
  return vec;
}

const supabase = createClient(SB_URL, SB_SERVICE_ROLE);

async function main() {
  console.log('-> Getting embedding from OpenRouter...');
  const v = await embed(TEXT); // ~1536 dims

  console.log('-> Inserting into knowledge_base...');
  const { error } = await supabase.from('knowledge_base').insert({
    content: TEXT,
    embedding: v,
  });

  if (error) {
    console.error('Insert error:', error);
    process.exit(1);
  }
  console.log('✅ Inserted successfully.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
