/**
 * lib/consistency-v2/ai-cache.ts
 *
 * KV-backed 1-hour cache for AI analysis results.
 * Cache key = sha256 of the serialized input.
 * Falls back silently — cache miss / write failure is never fatal.
 */

import crypto from "crypto";

function isProduction(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

export function makeAICacheKey(prefix: "fund" | "fund-v25" | "compare", input: unknown): string {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 32);
  return `ai-cache:v2:${prefix}:${hash}`;
}

export async function getAICache<T>(key: string): Promise<T | null> {
  if (!isProduction()) return null;
  try {
    const { kv } = await import("@vercel/kv");
    const data = await kv.get<T>(key);
    return data ?? null;
  } catch {
    return null;
  }
}

export async function setAICache(key: string, data: unknown): Promise<void> {
  if (!isProduction()) return;
  try {
    const { kv } = await import("@vercel/kv");
    await kv.set(key, data, { ex: 3600 });
  } catch {
    // non-fatal
  }
}
