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
 *   C:\Users\Agam\Desktop\05_קרנות ומוצרים\מעקב קרנות\מדדים היסטורים
 *
 * Required files in SOURCE_DIR:
 *   TA125_monthly_2014_2026.csv         — columns: Date, Close, ... (compute return from Close)
 *   מאגר_monthly.csv                    — columns: Date, Close, Monthly_Return
 *   קונצרני_כללי_monthly.csv            — columns: Date, Close, Monthly_Return
 *   SME60_monthly.csv                   — columns: Date, Close, Monthly_Return
 *   S&P 500 Historical Data.csv         — Investing.com format (Change % column)
 *   Nasdaq 100 Historical Data.csv      — Investing.com format (Change % column)
 *
 * Manual entries (hardcoded below): update each month for values not yet in CSV files.
 *
 * Merge behaviour: CSV data overwrites KV for covered months; months present in KV
 * but NOT in CSV (future months) are preserved.
 *
 * After writing, recomputeReturns() recalculates all annual and YTD return keys.
 */

import fs from "fs";
import path from "path";
import readline from "readline";

// ─── Configuration ────────────────────────────────────────────────────────────

const DEFAULT_SOURCE_DIR =
  "C:\\Users\\Agam\\Desktop\\05_קרנות ומוצרים\\מעקב קרנות\\מדדים היסטורים";

// Manual entries for months not yet covered by CSV files.
// Update this each month before running.
const MANUAL_ENTRIES: Record<string, Record<string, number>> = {
  "2026-04": {
    "bm-ta125":          0.074,   // 7.40%  — confirmed from TASE
    "bm-telbond-maagar": 0.0116,  // 1.16%
    "bm-agach-klali":    0.0098,  // 0.98%
    "bm-sme60":          0.0661,  // 6.61%
    // bm-sp500 + bm-nasdaq100: April is in their CSV files
  },
  "2026-05": {
    "bm-ta125":          0.027,   // 2.70%  — confirmed from TASE screenshot
    "bm-agach-klali":    0.0132,  // 1.32%  — from compare page screenshot
    // bm-telbond-maagar, bm-sme60, bm-sp500, bm-nasdaq100: add when known
  },
};

type BmFormat = "monthly_return" | "close_price" | "investing_com";

const FILE_MAP: Record<string, { file: string; format: BmFormat }> = {
  "bm-ta125":          { file: "TA125_monthly_2014_2026.csv",      format: "close_price"   },
  "bm-telbond-maagar": { file: "מאגר_monthly.csv",                  format: "monthly_return" },
  "bm-agach-klali":    { file: "קונצרני_כללי_monthly.csv",          format: "monthly_return" },
  "bm-sme60":          { file: "SME60_monthly.csv",                 format: "monthly_return" },
  "bm-sp500":          { file: "S&P 500 Historical Data.csv",       format: "investing_com"  },
  "bm-nasdaq100":      { file: "Nasdaq 100 Historical Data.csv",    format: "investing_com"  },
};

const PROTECTED_IDS = new Set<string>(); // nothing protected — CSV files are authoritative

const VALIDATION_THRESHOLD = 0.002; // flag deviations > 0.2%

// ─── CSV Parsers ──────────────────────────────────────────────────────────────

/** Handle both plain and RFC-4180 quoted CSV lines */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

async function parseCSV(filePath: string): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, "utf8"),
  });
  let headers: string[] = [];

  for await (const line of rl) {
    const trimmed = line.replace(/^﻿/, "").trim();
    if (!trimmed) continue;
    const cols = parseCSVLine(trimmed);
    if (headers.length === 0) {
      headers = cols.map((h) => h.trim());
    } else {
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = (cols[i] ?? "").trim();
      });
      rows.push(row);
    }
  }
  return rows;
}

// ─── Monthly return builders ──────────────────────────────────────────────────

function buildFromMonthlyReturnColumn(rows: Record<string, string>[]): Record<string, number> {
  const mr: Record<string, number> = {};
  for (const row of rows) {
    const monthKey = row["Date"]?.slice(0, 7); // YYYY-MM
    const val = row["Monthly_Return"]?.trim();
    if (monthKey && val) {
      const n = parseFloat(val);
      if (!isNaN(n)) mr[monthKey] = parseFloat(n.toFixed(6));
    }
  }
  return mr;
}

function buildFromClosePrice(rows: Record<string, string>[]): Record<string, number> {
  const mr: Record<string, number> = {};
  let prevClose: number | null = null;
  for (const row of rows) {
    const monthKey = row["Date"]?.slice(0, 7); // YYYY-MM
    const close = parseFloat(row["Close"] ?? "");
    if (!monthKey || isNaN(close)) continue;
    if (prevClose !== null) {
      mr[monthKey] = parseFloat((close / prevClose - 1).toFixed(6));
    }
    prevClose = close;
  }
  return mr;
}

/**
 * Investing.com monthly format:
 *   Header: "Date","Price","Open","High","Low","Vol.","Change %"
 *   Date:   "MM/DD/YYYY"  (newest row first)
 *   Change %: "10.42%" — the return for that calendar month
 */
function buildFromInvestingCom(rows: Record<string, string>[]): Record<string, number> {
  const mr: Record<string, number> = {};
  for (const row of rows) {
    const dateStr   = row["Date"];    // "04/01/2026"
    const changePct = row["Change %"]; // "10.42%"
    if (!dateStr || !changePct) continue;
    const parts = dateStr.split("/");
    if (parts.length < 3) continue;
    const mm   = parts[0].padStart(2, "0");
    const yyyy = parts[2];
    const monthKey = `${yyyy}-${mm}`;
    const val = parseFloat(changePct.replace("%", "")) / 100;
    if (!isNaN(val)) mr[monthKey] = parseFloat(val.toFixed(6));
  }
  return mr;
}

function buildMonthlyReturns(
  rows: Record<string, string>[],
  format: BmFormat
): Record<string, number> {
  switch (format) {
    case "monthly_return": return buildFromMonthlyReturnColumn(rows);
    case "close_price":    return buildFromClosePrice(rows);
    case "investing_com":  return buildFromInvestingCom(rows);
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateRange(bmId: string, mr: Record<string, number>): void {
  const out = Object.entries(mr).filter(([, v]) => v < -0.5 || v > 0.5);
  if (out.length > 0) {
    throw new Error(
      `Range validation failed for ${bmId}: ${out
        .slice(0, 3)
        .map(([m, v]) => `${m}=${v}`)
        .join(", ")}`
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

// ─── Production API helper ────────────────────────────────────────────────────
// Uses the benchmarks API (POST /api/benchmarks?action=update) which:
//   1. Merges monthlyReturns (new overwrites existing for same month, future months preserved)
//   2. Calls recomputeReturns() — updates all annual + YTD fields automatically
//   3. Saves to Vercel KV
// This avoids direct KV credential handling entirely.

const API_BASE = "https://fund-tracker-zeta.vercel.app";
const API_PASSWORD = "super2026";
const API_CLIENT = "green";

async function getBenchmarksFromAPI(): Promise<Array<{
  id: string; name: string; monthlyReturns?: Record<string, number>;
  returns: Record<string, number | null>;
}>> {
  const res = await fetch(
    `${API_BASE}/api/benchmarks?admin=true&client=${API_CLIENT}`,
    { headers: { "x-admin-password": API_PASSWORD } }
  );
  if (!res.ok) throw new Error(`GET benchmarks failed: ${res.status}`);
  return res.json();
}

async function updateBenchmarkViaAPI(
  id: string,
  monthlyReturns: Record<string, number>
): Promise<{ success: boolean; benchmark?: { returns: Record<string, number | null> } }> {
  const res = await fetch(
    `${API_BASE}/api/benchmarks?action=update&client=${API_CLIENT}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": API_PASSWORD,
      },
      body: JSON.stringify({ id, monthlyReturns }),
    }
  );
  if (!res.ok) throw new Error(`API update failed for ${id}: ${res.status} ${await res.text()}`);
  return res.json();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const sourceDir = process.argv[2] ?? DEFAULT_SOURCE_DIR;

  console.log("=== Benchmark Import Script ===\n");
  console.log(`Source dir: ${sourceDir}\n`);

  // ── Step 1: Read source files ──────────────────────────────────────────────
  const sourceData: Record<string, Record<string, number>> = {};

  for (const [bmId, { file, format }] of Object.entries(FILE_MAP)) {
    const filePath = path.join(sourceDir, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`  SKIP ${bmId}: file not found (${file})`);
      continue;
    }
    const rows = await parseCSV(filePath);
    const mr = buildMonthlyReturns(rows, format);
    validateRange(bmId, mr);
    sourceData[bmId] = mr;
    const months = Object.keys(mr).sort();
    console.log(`READ  ${bmId}: ${months.length} months (${months[0]} → ${months[months.length - 1]})`);
  }

  // ── Apply manual entries ───────────────────────────────────────────────────
  console.log("\nApplying manual entries:");
  for (const [month, entries] of Object.entries(MANUAL_ENTRIES)) {
    for (const [bmId, val] of Object.entries(entries)) {
      if (sourceData[bmId]) {
        sourceData[bmId][month] = val;
        console.log(`  ${bmId} ${month} = ${(val * 100).toFixed(2)}%`);
      }
    }
  }

  // ── Step 2: Fetch current state from API for validation ───────────────────
  console.log("\nFetching current benchmarks from API...");
  const currentBms = await getBenchmarksFromAPI();
  console.log(`API returned ${currentBms.length} benchmarks: ${currentBms.map((b) => b.id).join(", ")}\n`);

  // ── Step 3: Validate overlapping data ─────────────────────────────────────
  console.log("=== Validation (CSV vs current KV) ===");
  for (const bm of currentBms) {
    if (PROTECTED_IDS.has(bm.id)) continue;
    const src = sourceData[bm.id];
    if (!src) continue;
    const kvMr = bm.monthlyReturns ?? {};
    const { deviations } = validateAgainstKV(bm.id, src, kvMr);
    if (deviations.length > 0) {
      console.log(`  ${bm.id}: ${deviations.length} deviations > ${VALIDATION_THRESHOLD * 100}%`);
      deviations.slice(0, 5).forEach(({ month, source, kv, diff }) => {
        console.log(
          `    ${month}: CSV=${(source * 100).toFixed(2)}%  KV=${(kv * 100).toFixed(2)}%  diff=${(diff * 100).toFixed(2)}%`
        );
      });
    } else {
      const common = Object.keys(src).filter((m) => m in kvMr).length;
      console.log(`  ${bm.id}: ${common} overlapping months OK`);
    }
  }

  // ── Step 4: Push to production via API ────────────────────────────────────
  console.log("\n=== Pushing to production ===");
  for (const [bmId, mr] of Object.entries(sourceData)) {
    if (PROTECTED_IDS.has(bmId)) {
      console.log(`SKIP  ${bmId} (protected)`);
      continue;
    }
    const months = Object.keys(mr).sort();
    process.stdout.write(`UPDATE ${bmId}: ${months.length} months (${months[0]} → ${months[months.length - 1]}) ... `);
    const result = await updateBenchmarkViaAPI(bmId, mr);
    if (result.success && result.benchmark) {
      const r = result.benchmark.returns;
      const summary = ["ytd2026", "y2025", "y2024", "y2023"]
        .filter((k) => r[k] != null)
        .map((k) => `${k}=${((r[k] as number) * 100).toFixed(1)}%`)
        .join(", ");
      console.log(`OK  [${summary}]`);
    } else {
      console.log("OK");
    }
  }

  // ── Step 5: Verify final state ────────────────────────────────────────────
  console.log("\n=== Final verification ===");
  const finalBms = await getBenchmarksFromAPI();
  for (const b of finalBms) {
    const mr = b.monthlyReturns ?? {};
    const months = Object.keys(mr).sort();
    const ytd = b.returns["ytd2026"];
    console.log(
      `  ${b.id}: ${months.length} months (${months[0] ?? "none"} → ${months[months.length - 1] ?? "none"})` +
      `  |  ytd2026=${ytd != null ? ((ytd as number) * 100).toFixed(2) + "%" : "—"}`
    );
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
