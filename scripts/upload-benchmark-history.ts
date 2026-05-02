/**
 * Upload historical benchmark data from a CSV file into production KV.
 *
 * Usage:
 *   npx tsx scripts/upload-benchmark-history.ts <csv-path> <benchmark-id>
 *
 * Example:
 *   npx tsx scripts/upload-benchmark-history.ts ./scripts/data/benchmark-ta125.csv bm-ta125
 *
 * CSV format (header optional, one row per month):
 *   month,return
 *   2024-05,1.23        ← percent format  (1.23 = 1.23%)
 *   2024-06,-0.45
 *   -- OR --
 *   2024-05,0.0123      ← decimal format  (0.0123 = 1.23%)
 *   2024-06,-0.0045
 *
 * Format is auto-detected from the values in the file.
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
const raw: Record<string, number> = {};  // raw parsed values, before format conversion
let csvErrors = 0;

for (let i = 0; i < csvLines.length; i++) {
  const line = csvLines[i].trim();
  if (!line || line.startsWith("#")) continue;

  // Support comma and semicolon separators; skip optional header row
  const parts = line.split(/[,;]/);
  if (parts.length < 2) {
    console.warn(`  Line ${i + 1}: skipping malformed row: "${line}"`);
    csvErrors++;
    continue;
  }

  const month = parts[0].trim();
  const val   = parseFloat(parts[1].trim());

  if (!MONTH_RE.test(month)) {
    if (i === 0) continue; // header row — skip silently
    console.warn(`  Line ${i + 1}: invalid month format "${month}", skipping`);
    csvErrors++;
    continue;
  }

  if (isNaN(val)) {
    console.warn(`  Line ${i + 1}: invalid return value "${parts[1].trim()}", skipping`);
    csvErrors++;
    continue;
  }

  raw[month] = val;
}

const rawValues = Object.values(raw);
if (rawValues.length === 0) {
  console.error("ERROR: No valid rows found in CSV.");
  process.exit(1);
}

// ── 4. Auto-detect percent vs decimal format ──────────────────────────────────
//
//   Percent : all values in [-50, 50]  but at least one |v| > 1
//   Decimal : all values in [-1, 1]
//   Mixed   : values outside [-50, 50], or mix of >1 and <1 that doesn't fit either bucket
//

const allDecimal = rawValues.every(v => Math.abs(v) <= 1);
const allPercent = rawValues.every(v => Math.abs(v) <= 50);
const anyAboveOne = rawValues.some(v => Math.abs(v) > 1);

let incoming: Record<string, number>;

if (allDecimal) {
  console.log(`\nDetected format: decimal (e.g. 0.0123 → stored as 0.0123)`);
  incoming = raw;
} else if (allPercent && anyAboveOne) {
  console.log(`\nDetected format: percent (e.g. 1.23 → stored as 0.0123)`);
  incoming = Object.fromEntries(Object.entries(raw).map(([m, v]) => [m, v / 100]));
} else {
  console.error(`\nERROR: Mixed format detected — some values are >1 (percent?) and some are <=1 (decimal?).`);
  console.error(`Refusing to upload. Please normalise to a single format and re-run.`);
  console.error(`Outlier values: ${rawValues.filter(v => Math.abs(v) > 1).slice(0, 5).join(", ")} ...`);
  process.exit(1);
}

console.log(`CSV parsed: ${rawValues.length} valid months${csvErrors > 0 ? `, ${csvErrors} rows skipped` : ""}`);

// ── 5. Load & merge KV data ───────────────────────────────────────────────────
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

// ── 6. Write back ─────────────────────────────────────────────────────────────
await storageWrite(KV_KEY, benchmarks);

// ── 7. Summary ────────────────────────────────────────────────────────────────
const allMonths = Object.keys(existing).sort();
console.log(`\n✓ Done`);
console.log(`  Added   : ${added} months`);
console.log(`  Skipped : ${skipped} months (already existed, not overwritten)`);
console.log(`  Total   : ${allMonths.length} months now in KV`);
if (allMonths.length > 0) {
  console.log(`  Range   : ${allMonths[0]} → ${allMonths[allMonths.length - 1]}`);
}
