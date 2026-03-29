/**
 * Migration script: Load existing JSON files into Vercel KV.
 *
 * Usage:
 *   1. Set KV_REST_API_URL and KV_REST_API_TOKEN env vars
 *      (get from Vercel Dashboard → Storage → KV → .env.local)
 *   2. Run: npx tsx scripts/migrate-to-kv.ts
 *
 * This is a one-time operation. Safe to run multiple times (overwrites).
 */

import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const CLIENTS = ["green", "nox"];

interface KvEntry {
  key: string;
  filePath: string;
}

async function main() {
  const apiUrl = process.env.KV_REST_API_URL;
  const apiToken = process.env.KV_REST_API_TOKEN;

  if (!apiUrl || !apiToken) {
    console.error("❌ Missing KV_REST_API_URL or KV_REST_API_TOKEN");
    console.error("   Get these from Vercel Dashboard → Storage → KV → .env.local");
    process.exit(1);
  }

  const entries: KvEntry[] = [];

  for (const client of CLIENTS) {
    const dataDir = path.join(ROOT, "data", client);

    // funds.json
    const fundsFile = path.join(dataDir, "funds.json");
    if (fs.existsSync(fundsFile)) {
      entries.push({ key: `funds:${client}`, filePath: fundsFile });
    }

    // brand.json
    const brandFile = path.join(dataDir, "brand.json");
    if (fs.existsSync(brandFile)) {
      entries.push({ key: `brand:${client}`, filePath: brandFile });
    }

    // parse-drafts.json (may not exist yet)
    const draftsFile = path.join(dataDir, "parse-drafts.json");
    if (fs.existsSync(draftsFile)) {
      entries.push({ key: `parse-drafts:${client}`, filePath: draftsFile });
    }

    // parse-log.json (may not exist yet)
    const logFile = path.join(dataDir, "parse-log.json");
    if (fs.existsSync(logFile)) {
      entries.push({ key: `parse-log:${client}`, filePath: logFile });
    }
  }

  console.log(`\n📦 Migrating ${entries.length} entries to Vercel KV...\n`);

  for (const entry of entries) {
    try {
      const data = JSON.parse(fs.readFileSync(entry.filePath, "utf-8"));

      const res = await fetch(`${apiUrl}/set/${encodeURIComponent(entry.key)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        console.log(`  ✓ ${entry.key} ← ${path.relative(ROOT, entry.filePath)}`);
      } else {
        const err = await res.text();
        console.error(`  ✗ ${entry.key} — ${res.status}: ${err}`);
      }
    } catch (err) {
      console.error(`  ✗ ${entry.key} — Error: ${err}`);
    }
  }

  console.log("\n✅ Migration complete.\n");
}

main();
