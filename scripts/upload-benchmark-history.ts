/**
 * Upload historical benchmark data from a CSV file into production KV.
 *
 * Usage:
 *   npx tsx scripts/upload-benchmark-history.ts <csv-path> <benchmark-id>
 *
 * Example:
 *   npx tsx scripts/upload-benchmark-history.ts ./scripts/data/benchmark-ta125.csv bm-ta125
 *
 * CSV format (no header, one row per month):
 *   2024-05,0.0123
 *   2024-06,-0.0045
 *   ...
 *
 * Behaviour:
 *   - Loads production KV credentials from .env.production.local
 *   - Reads the existing Benchmark[] array from KV key benchmarks:green
 *   - Merges new month entries into the target benchmark (no overwrite of existing months)
 *   - Writes the updated array back to KV
 *   - Prints a clear summary: added / skipped / benchmark name
 */

import * as fs from "fs";
import * as path from "path";

// ── 1. Load production env vars before any import that reads process.env ──────
const envFile = path.join(process.cwd(), ".env.production.local");
if (!fs.existsSync(envFile)) {
  console.error("ERROR: .env.production.local not found.");
  console.error("Run: vercel env pull .env.production.local --environment production");
  process.exit(1);
}
for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 0) continue;
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
}
process.env.VERCEL = "1";

// ── 2. Parse CLI args ─────────────────────────────────────────────────────────
const [, , csvArg, benchmarkId] = process.argv;

if (!csvArg || !benchmarkId) {
  console.error("Usage: npx tsx scripts/upload-benchmark-history.ts <csv-path> <benchmark-id>");
  console.error("Example: npx tsx scripts/upload-benchmark-history.ts ./scripts/data/benchmark-ta125.csv bm-ta125");
  process.exit(1);
}

const csvPath = path.resolve(csvArg);
if (!fs.existsSync(csvPath)) {
  console.error(`ERROR: CSV file not found: ${csvPath}`);
  process.exit(1);
}

// ── 3. Parse CSV ──────────────────────────────────────────────────────────────
const MONTH_RE = /^\d{4}-\d{2}$/;

const csvLines = fs.readFileSync(csvPath, "utf-8").split("\n");
const incoming: Record<string, number> = {};
let csvErrors = 0;

for (let i = 0; i < csvLines.length; i++) {
  const raw = csvLines[i].trim();
  if (!raw || raw.startsWith("#")) continue;

  // Support both comma and semicolon separators; strip optional header
  const parts = raw.split(/[,;]/);
  if (parts.length < 2) {
    console.warn(`  Line ${i + 1}: skipping malformed row: "${raw}"`);
    csvErrors++;
    continue;
  }

  const month = parts[0].trim();
  const val   = parseFloat(parts[1].trim());

  if (!MONTH_RE.test(month)) {
    // Likely the header row "month,return" — skip silently
    if (i === 0) continue;
    console.warn(`  Line ${i + 1}: invalid month format "${month}", skipping`);
    csvErrors++;
    continue;
  }

  if (isNaN(val)) {
    console.warn(`  Line ${i + 1}: invalid return value "${parts[1].trim()}", skipping`);
    csvErrors++;
    continue;
  }

  incoming[month] = val;
}

const incomingCount = Object.keys(incoming).length;
if (incomingCount === 0) {
  console.error("ERROR: No valid rows found in CSV.");
  process.exit(1);
}

console.log(`\nCSV parsed: ${incomingCount} valid months${csvErrors > 0 ? `, ${csvErrors} rows skipped` : ""}`);

// ── 4. Load & merge KV data ───────────────────────────────────────────────────
import { storageRead, storageWrite } from "../lib/storage";
import { Benchmark } from "../lib/types";

const CLIENT = "green";
const KV_KEY = `benchmarks:${CLIENT}`;

const benchmarks = await storageRead<Benchmark[]>(KV_KEY, []);

const target = benchmarks.find(b => b.id === benchmarkId);
if (!target) {
  console.error(`\nERROR: Benchmark "${benchmarkId}" not found in KV.`);
  console.error(`Available benchmarks: ${benchmarks.map(b => b.id).join(", ")}`);
  process.exit(1);
}

console.log(`\nTarget   : ${target.id} — ${target.name}`);
console.log(`Existing : ${Object.keys(target.monthlyReturns ?? {}).length} months in KV`);

// Merge — never overwrite existing months
const existing = target.monthlyReturns ?? {};
let added   = 0;
let skipped = 0;

for (const [month, val] of Object.entries(incoming).sort()) {
  if (month in existing) {
    skipped++;
  } else {
    existing[month] = val;
    added++;
  }
}

target.monthlyReturns = existing;

// ── 5. Write back ─────────────────────────────────────────────────────────────
await storageWrite(KV_KEY, benchmarks);

// ── 6. Summary ────────────────────────────────────────────────────────────────
const allMonths = Object.keys(existing).sort();
console.log(`\n✓ Done`);
console.log(`  Added   : ${added} months`);
console.log(`  Skipped : ${skipped} months (already existed, not overwritten)`);
console.log(`  Total   : ${allMonths.length} months now in KV`);
if (allMonths.length > 0) {
  console.log(`  Range   : ${allMonths[0]} → ${allMonths[allMonths.length - 1]}`);
}
