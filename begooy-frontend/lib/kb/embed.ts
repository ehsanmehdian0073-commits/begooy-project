// lib/kb/embed.ts

/**
 * امبدینگ چندبعدی با OpenAI (بهینه‌شده برای 1024/1536)
 * - اگر API Key نباشد: صفر-وکتور برمی‌گرداند (برای تست‌های بدون اینترنت)
 * - از پارامتر `dimensions` خود OpenAI استفاده می‌کند (اگر پشتیبانی نشد، محلی trim/pad می‌کند)
 * - در حالت چندبُعدی (مثلاً [1024,1536]) فقط یکبار امبد می‌گیرد و بقیه را با trim/pad می‌سازد
 */

const DEFAULT_DIM = Number(process.env.EMBEDDING_DIM ?? "1024");
const DEFAULT_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

// ابعاد بومی مدل‌ها (در صورت تغییر مدل، این مپ را به‌روزرسانی کن)
const MODEL_DIM_MAP: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
};

function nativeDimOf(model: string): number {
  return MODEL_DIM_MAP[model] ?? 1536;
}

function fitToDim(vec: number[], dim: number): number[] {
  if (vec.length === dim) return vec;
  if (vec.length > dim) return vec.slice(0, dim); // trim
  // pad
  const out = vec.slice();
  while (out.length < dim) out.push(0);
  return out;
}

function normalizeVec(vec: any[], dim?: number): number[] {
  const arr = Array.isArray(vec) ? vec.map((v) => (Number.isFinite(+v) ? +v : 0)) : [];
  return typeof dim === "number" ? fitToDim(arr, dim) : arr;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function callOpenAIEmbeddings(
  texts: string[],
  model: string,
  targetDim?: number,
  maxBatch = 128
): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // بدون کلید: صفر-وکتور
    const dim = targetDim ?? nativeDimOf(model);
    return texts.map(() => Array(dim).fill(0));
  }

  const base = process.env.OPENAI_BASE_URL?.replace(/\/+$/, "") || "https://api.openai.com";
  const url = `${base}/v1/embeddings`;

  const batches = chunk(texts, maxBatch);
  const all: number[][] = [];

  for (const inputs of batches) {
    // ۳ بار retry روی 429/5xx
    let attempt = 0;
    let lastErr: any = null;
    while (attempt < 3) {
      try {
        const body: any = { input: inputs, model };
        if (typeof targetDim === "number") body.dimensions = targetDim; // اگر پشتیبانی شد، سرور بُعد را کم می‌کند
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const txt = await res.text();
          // قابل retry
          if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
            attempt++;
            lastErr = new Error(`Embedding failed ${res.status}: ${txt}`);
            await new Promise((r) => setTimeout(r, 300 * attempt));
            continue;
          }
          throw new Error(`Embedding failed ${res.status}: ${txt}`);
        }
        const data = await res.json();
        for (const d of data.data ?? []) {
          all.push(normalizeVec(d.embedding, targetDim));
        }
        break; // این batch اوکی شد
      } catch (err) {
        attempt++;
        lastErr = err;
        await new Promise((r) => setTimeout(r, 300 * attempt));
        if (attempt >= 3) throw lastErr;
      }
    }
  }

  return all;
}

/**
 * امبدینگ با بُعد دلخواه (اگر سرور ابعاد سفارشی را نپذیرد، محلی trim/pad می‌کنیم)
 */
export async function embedBatchToDim(
  texts: string[],
  dim: number,
  model = DEFAULT_MODEL
): Promise<number[][]> {
  // تلاش می‌کنیم سرور همان dim را بسازد؛ اگر مدل خروجی بزرگ‌تر داد، محلی فیت می‌کنیم
  const vecs = await callOpenAIEmbeddings(texts, model, dim);
  return vecs.map((v) => fitToDim(v, dim));
}

/**
 * برگرداندن امبدینگ برای چند بُعد همزمان (یکبار تماس، چند خروجی)
 * - برای dims مثل [1024, 1536] یکبار 1536 می‌گیریم، 1024 را محلی trim می‌کنیم
 */
export async function embedBatchWithDims(
  texts: string[],
  dims: number[],
  model = DEFAULT_MODEL
): Promise<Record<number, number[][]>> {
  const uniqDims = Array.from(new Set(dims.filter((d) => d > 0))).sort((a, b) => a - b);
  if (uniqDims.length === 0) return {};

  const maxDim = uniqDims[uniqDims.length - 1];
  // یکبار بیشینه‌بُعد را از سرور می‌گیریم
  const baseVecs = await callOpenAIEmbeddings(texts, model, maxDim);

  const out: Record<number, number[][]> = {};
  for (const d of uniqDims) {
    out[d] = baseVecs.map((v) => fitToDim(v, d));
  }
  return out;
}

/** سازگاری قدیمی (یک بُعدی) */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  return embedBatchToDim(texts, DEFAULT_DIM, DEFAULT_MODEL);
}
