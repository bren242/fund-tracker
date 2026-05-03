/**
 * import-benchmarks-from-files.ts
 *
 * Reads monthly benchmark returns from source CSV files and writes them to
 * Upstash KV (benchmarks:green). Idempotent — safe to re-run.
 *
 * Usage:
 *   npx ts-node scripts/import-benchmarks-from-files.ts [SOURCE_DIR]
 *
 * SOURCE_DIR defaults to:
 *   C:\Users\Agam\Desktop\מעקב קרנות\מדדים היסטורים
 *
 * Required files in SOURCE_DIR:
 *   TA125_monthly_2014_2026.csv   — columns: Date, Close, ... (compute return from Close)
 *   מאגר_monthly.csv              — columns: Date, Close, Monthly_Return
 *   קונצרני_כללי_monthly.csv      — columns: Date, Close, Monthly_Return
 *   SME60_monthly.csv             — columns: Date, Close, Monthly_Return
 *
 * Manual entries (hardcoded, update each month):
 *   2026-04 values added as constants below (field: MANUAL_2026_04)
 *
 * KV structure:
 *   Key: benchmarks:green
 *   Value: JSON array of Benchmark objects
 *   Each Benchmark: { id, name, currency, returns, monthlyReturns, active }
 *   monthlyReturns: { "YYYY-MM": <decimal return>, ... }
 *
 * Protected: bm-sp500 is never overwritten.
 */

import fs from "fs";
import path from "path";
import readline from "readline";

// ─── Configuration ────────────────────────────────────────────────────────────

const KV_URL   = process.env.KV_REST_API_URL!;
const KV_TOKEN = process.env.KV_REST_API_TOKEN!;

const DEFAULT_SOURCE_DIR = "C:\\Users\\Agam\\Desktop\\מעקב קרנות\\מדדים היסטורים";

// Manual entries for the most recent month not yet in source files.
// Update this object each month before running.
const MANUAL_ENTRIES: Record<string, Record<string, number>> = {
  "2026-04": {
    "bm-ta125":          0.074,   // 7.40% — manual entry 2026-05-03
    "bm-telbond-maagar": 0.0116,  // 1.16% — manual entry 2026-05-03
    "bm-agach-klali":    0.0098,  // 0.98% — manual entry 2026-05-03
    "bm-sme60":          0.0661,  // 6.61% — manual entry 2026-05-03
  },
};

const FILE_MAP: Record<string, { file: string; hasMonthlyReturn: boolean }> = {
  "bm-ta125":          { file: "TA125_monthly_2014_2026.csv", hasMonthlyReturn: false },
  "bm-telbond-maagar": { file: "מאגר_monthly.csv",            hasMonthlyReturn: true  },
  "bm-agach-klali":    { file: "קונצרני_כללי_monthly.csv",    hasMonthlyReturn: true  },
  "bm-sme60":          { file: "SME60_monthly.csv",            hasMonthlyReturn: true  },
};

const PROTECTED_IDS = new Set(["bm-sp500"]);
const VALIDATION_THRESHOLD = 0.001;

// ─── CSV Parser ───────────────────────────────────────────────────────────────

async function parseCSV(filePath: string): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(filePath, "utf8") });
  let headers: string[] = [];

  for await (const line of rl) {
    const trimmed = line.replace(/^﻿/, "").trim();
    if (!trimmed) continue;
    const cols = trimmed.split(",");
    if (headers.length === 0) {
      headers = cols.map((h) => h.trim());
    } else {
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = (cols[i] ?? "").trim(); });
      rows.push(row);
    }
  }
  return rows;
}

// ─── Build monthly returns from CSV ──────────────────────────────────────────

function buildMonthlyReturns(
  rows: Record<string, string>[],
  hasMonthlyReturn: boolean
): Record<string, number> {
  const mr: Record<string, number> = {};

  if (hasMonthlyReturn) {
    for (const row of rows) {
      const monthKey = row["Date"]?.slice(0, 7); // YYYY-MM
      const val = row["Monthly_Return"]?.trim();
      if (monthKey && val) {
        mr[monthKey] = parseFloat(val);
      }
    }
  } else {
    // Compute from Close: return[i] = Close[i] / Close[i-1] - 1
    let prevClose: number | null = null;
    for (const row of rows) {
      const monthKey = row["Date"]?.slice(0, 7);
      const close = parseFloat(row["Close"] ?? "");
      if (!monthKey || isNaN(close)) continue;
      if (prevClose !== null) {
        mr[monthKey] = parseFloat((close / prevClose - 1).toFixed(6));
      }
      prevClose = close;
    }
  }

  return mr;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateRange(bmId: string, mr: Record<string, number>): void {
  const out = Object.entries(mr).filter(([, v]) => v < -0.5 || v > 0.5);
  if (out.length > 0) {
    throw new Error(
      `Range validation failed for ${bmId}: ${out.slice(0, 3).map(([m, v]) => `${m}=${v}`).join(", ")}`
    );
  }
}

function validateAgainstKV(
  bmId: string,
  source: Record<string, number>,
  kvMr: Record<string, number>
): { deviations: Array<{ month: string; source: number; kv: number; diff: number }> } {
  const deviations = [];
  const common = Object.keys(source).filter((m) => m in kvMr);
  for (const m of common) {
    const diff = Math.abs(source[m] - kvMr[m]);
    if (diff > VALIDATION_THRESHOLD) {
      deviations.push({ month: m, source: source[m], kv: kvMr[m], diff });
    }
  }
  return { deviations };
}

// ─── KV helpers ───────────────────────────────────────────────────────────────

async function kvGet(key: string): Promise<unknown> {
  const res = await fetch(`${KV_URL}/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(["GET", key]),
  });
  const json = await res.json() as { result: string | null };
  return json.result ? JSON.parse(json.result) : null;
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const res = await fetch(`${KV_URL}/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(["SET", key, JSON.stringify(value)]),
  });
  const json = await res.json() as { result: string };
  if (json.result !== "OK") throw new Error(`KV SET failed: ${JSON.stringify(json)}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const sourceDir = process.argv[2] ?? DEFAULT_SOURCE_DIR;

  if (!KV_URL || !KV_TOKEN) {
    throw new Error("KV_REST_API_URL and KV_REST_API_TOKEN env vars required");
  }

  console.log("=== Benchmark Import Script ===\n");
  console.log(`Source dir: ${sourceDir}`);
  console.log();

  // ── Step 1: Read source files ──────────────────────────────────────────────
  const sourceData: Record<string, Record<string, number>> = {};

  for (const [bmId, { file, hasMonthlyReturn }] of Object.entries(FILE_MAP)) {
    const filePath = path.join(sourceDir, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Source file not found: ${filePath}`);
    }
    const rows = await parseCSV(filePath);
    const mr = buildMonthlyReturns(rows, hasMonthlyReturn);
    validateRange(bmId, mr);
    sourceData[bmId] = mr;
    const months = Object.keys(mr).sort();
    console.log(`READ ${bmId}: ${months.length} months (${months[0]} → ${months[months.length - 1]})`);
  }

  // ── Apply manual entries ───────────────────────────────────────────────────
  console.log("\nApplying manual entries:");
  for (const [month, entries] of Object.entries(MANUAL_ENTRIES)) {
    for (const [bmId, val] of Object.entries(entries)) {
      if (sourceData[bmId]) {
        sourceData[bmId][month] = val;
        console.log(`  ${bmId} ${month} = ${val}`);
      }
    }
  }

  // ── Step 2: Read current KV ────────────────────────────────────────────────
  console.log("\nReading KV...");
  const kvBms = await kvGet("benchmarks:green") as Array<{
    id: string;
    name: string;
    currency: string;
    returns: Record<string, number | null>;
    monthlyReturns?: Record<string, number>;
    active: boolean;
  }>;

  if (!Array.isArray(kvBms)) throw new Error("KV benchmarks:green is not an array");
  console.log(`KV has ${kvBms.length} benchmarks: ${kvBms.map((b) => b.id).join(", ")}`);

  // ── Step 3: Validate ───────────────────────────────────────────────────────
  console.log("\n=== Validation ===");
  let validationFailures = 0;

  for (const kvBm of kvBms) {
    if (PROTECTED_IDS.has(kvBm.id)) continue;
    const src = sourceData[kvBm.id];
    if (!src) continue;
    const kvMr = kvBm.monthlyReturns ?? {};
    const { deviations } = validateAgainstKV(kvBm.id, src, kvMr);
    if (deviations.length > 0) {
      console.log(`  ${kvBm.id}: ${deviations.length} deviations > ${VALIDATION_THRESHOLD}`);
      deviations.slice(0, 3).forEach(({ month, source, kv, diff }) => {
        console.log(`    ${month}: source=${source.toFixed(4)}, KV=${kv.toFixed(4)}, diff=${diff.toFixed(4)}`);
      });
      validationFailures += deviations.length;
    } else {
      const common = Object.keys(src).filter((m) => m in kvMr).length;
      console.log(`  ${kvBm.id}: ${common} overlapping months OK`);
    }
  }

  if (validationFailures > 0) {
    console.log(
      `\nWARNING: ${validationFailures} validation deviations detected.`
    );
    console.log("This is expected if KV had incorrect reconstructed data.");
    console.log("Source files are authoritative — proceeding with import.\n");
  }

  // ── Step 4: Build updated array ────────────────────────────────────────────
  const updatedBms = [...kvBms];

  // Update existing benchmarks
  for (const bm of updatedBms) {
    if (PROTECTED_IDS.has(bm.id)) {
      console.log(`PROTECTED: ${bm.id} — not modified`);
      continue;
    }
    const src = sourceData[bm.id];
    if (src) {
      bm.monthlyReturns = src;
      const months = Object.keys(src).sort();
      console.log(`UPDATE ${bm.id}: ${months.length} months (${months[0]} → ${months[months.length - 1]})`);
    }
  }

  // Add bm-sme60 if missing
  const existingIds = new Set(updatedBms.map((b) => b.id));
  if (!existingIds.has("bm-sme60") && sourceData["bm-sme60"]) {
    const sme60Mr = sourceData["bm-sme60"];
    const compoundYear = (year: number): number | null => {
      const vals = Object.entries(sme60Mr)
        .filter(([m]) => m.startsWith(`${year}-`) && m !== `${year}-04`)
        .map(([, v]) => v);
      if (!vals.length) return null;
      return parseFloat((vals.reduce((acc, v) => acc * (1 + v), 1) - 1).toFixed(4));
    };
    updatedBms.push({
      id: "bm-sme60",
      name: "SME 60",
      currency: "ILS",
      returns: {
        ytd2026: compoundYear(2026), y2025: compoundYear(2025),
        y2024: compoundYear(2024),  y2023: compoundYear(2023),
        y2022: compoundYear(2022),  y2021: compoundYear(2021),
        y2020: compoundYear(2020),  y2019: compoundYear(2019),
      },
      monthlyReturns: sme60Mr,
      active: true,
    });
    const months = Object.keys(sme60Mr).sort();
    console.log(`ADD bm-sme60: ${months.length} months (${months[0]} → ${months[months.length - 1]})`);
  }

  // ── Step 5: Write to KV ────────────────────────────────────────────────────
  console.log("\nWriting to KV...");
  await kvSet("benchmarks:green", updatedBms);
  console.log("Write OK");

  // ── Step 6: Verify ────────────────────────────────────────────────────────
  console.log("\n=== Verification ===");
  const finalBms = await kvGet("benchmarks:green") as typeof updatedBms;
  for (const b of finalBms) {
    const mr = b.monthlyReturns ?? {};
    const months = Object.keys(mr).sort();
    const hasApr = "2026-04" in mr;
    console.log(
      `  ${b.id}: ${months.length} months (${months[0] ?? "none"} → ${months[months.length - 1] ?? "none"}) | 2026-04: ${hasApr ? "YES" : "NO"}`
    );
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
