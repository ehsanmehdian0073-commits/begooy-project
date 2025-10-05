import "dotenv/config";

const MODEL = process.env.AI_EMBED_MODEL || "jina-ai/jina-embeddings-v3";
const key = process.env.OPENROUTER_API_KEY;

const headers = {
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Accept: "application/json",
  "HTTP-Referer": process.env.OPENROUTER_REFERER || "http://localhost:3000",
  "X-Title": process.env.OPENROUTER_TITLE || "Begooy Embedding Script",
  "User-Agent": "begooy-embed-ping/1.0"
};

const body = {
  model: MODEL,
  input: ["salam! in yek test embedding ast."]
};

const resp = await fetch("https://openrouter.ai/api/v1/embeddings", {
  method: "POST",
  headers,
  body: JSON.stringify(body),
});

const text = await resp.text();
console.log("STATUS:", resp.status);
console.log("MODEL :", MODEL);
console.log("RAW   :", text.slice(0, 200));
