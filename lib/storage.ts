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

let kv: { get: (key: string) => Promise<unknown>; set: (key: string, value: unknown) => Promise<unknown> } | null = null;

function isProduction(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

async function getKv() {
  if (kv) return kv;
  // Dynamic import to avoid errors when @vercel/kv env vars are not set locally
  try {
    const mod = await import("@vercel/kv");
    kv = mod.kv;
    return kv;
  } catch {
    return null;
  }
}

/**
 * Map a storage key to its local filesystem path.
 * Keys follow the pattern: "type:clientKey"
 */
function keyToFilePath(key: string): string {
  const [type, clientKey] = key.split(":");
  const fileMap: Record<string, string> = {
    funds: "funds.json",
    brand: "brand.json",
    "parse-drafts": "parse-drafts.json",
    "parse-log": "parse-log.json",
  };
  const fileName = fileMap[type];
  if (!fileName || !clientKey) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  // brand.json lives in data/{clientKey}/ like everything else
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
