/**
 * Storage abstraction layer.
 *
 * Production (Vercel): reads/writes to Vercel KV (Redis).
 * Local development:   reads/writes to filesystem (JSON files).
 *
 * KV key convention:
 *   funds:{clientKey}         → FundsData
 *   brand:{clientKey}         → BrandConfig
 *   parse-drafts:{clientKey}  → ParseDraft[]
 *   parse-log:{clientKey}     → ParseLogEntry[]
 *
 * Logo upload: OUT OF SCOPE — remains filesystem/static only.
 */

import fs from "fs";
import path from "path";
import { clientDataDir } from "./clientPaths";

let kvInstance: { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown) => Promise<unknown> } | null = null;
let kvChecked = false;

function isProduction(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

function hasKvEnvVars(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function getKv() {
  if (kvChecked) return kvInstance;
  kvChecked = true;

  // Don't even try if env vars are missing
  if (!hasKvEnvVars()) {
    console.warn("KV env vars not set — using filesystem fallback");
    return null;
  }

  try {
    const mod = await import("@vercel/kv");
    kvInstance = mod.kv;
    return kvInstance;
  } catch {
    return null;
  }
}

/**
 * Map a storage key to its local filesystem path.
 * Keys follow the pattern: "type:clientKey"
 */
function keyToFilePath(key: string): string {
  const parts = key.split(":");
  const type = parts[0];
  const clientKey = parts[1];
  const fileMap: Record<string, string> = {
    funds: "funds.json",
    brand: "brand.json",
    "parse-drafts": "parse-drafts.json",
    "parse-log": "parse-log.json",
    benchmarks: "benchmarks.json",
    "undo-state": "undo-state.json",
    "token-usage": "token-usage.json",
    indications: "indications.json",
  };
  // parse-cache has 3 segments: parse-cache:{clientKey}:{hash}
  if (type === "parse-cache") {
    const hash = parts[2] || "default";
    const safeHash = hash.replace(/[^a-zA-Z0-9_-]/g, "_");
    if (!clientKey) throw new Error(`Invalid storage key: ${key}`);
    if (isProduction()) {
      return path.join(process.cwd(), "data", clientKey, `parse-cache-${safeHash}.json`);
    }
    return path.join(clientDataDir(clientKey), `parse-cache-${safeHash}.json`);
  }
  const fileName = fileMap[type];
  if (!fileName || !clientKey) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  // On Vercel (read-only), don't use clientDataDir (which calls ensureDir/mkdirSync).
  // Just construct the path directly — the data/ folder exists from build.
  if (isProduction()) {
    return path.join(process.cwd(), "data", clientKey, fileName);
  }
  return path.join(clientDataDir(clientKey), fileName);
}

/**
 * Read JSON data from storage.
 * Returns fallback if key doesn't exist.
 */
export async function storageRead<T>(key: string, fallback: T): Promise<T> {
  // Try KV first in production
  if (isProduction()) {
    const store = await getKv();
    if (store) {
      try {
        const data = await store.get(key);
        if (data !== null && data !== undefined) {
          return data as T;
        }
      } catch (err) {
        console.error(`KV read error for key "${key}":`, err);
      }
    }
  }

  // Filesystem fallback (always works locally, serves as seed data source)
  try {
    const filePath = keyToFilePath(key);
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Write JSON data to storage.
 */
export async function storageWrite<T>(key: string, data: T): Promise<void> {
  // Write to KV in production
  if (isProduction()) {
    const store = await getKv();
    if (store) {
      try {
        await store.set(key, data);
        return; // Success — don't write to filesystem on Vercel (read-only)
      } catch (err) {
        console.error(`KV write error for key "${key}":`, err);
        throw new Error(`Failed to save data (KV write error)`);
      }
    }
  }

  // Filesystem write (local development)
  const filePath = keyToFilePath(key);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Append to an array stored in KV/filesystem.
 * Useful for append-only logs.
 */
export async function storageAppend<T>(key: string, entry: T): Promise<void> {
  const arr = await storageRead<T[]>(key, []);
  arr.push(entry);
  await storageWrite(key, arr);
}
