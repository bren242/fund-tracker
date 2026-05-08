/**
 * scripts/validate-metrics.ts
 *
 * Read-only comparison of computed metrics (lib/metrics.ts) vs stored KV values
 * for fund-29 (ספרה VALUE — GREEN).
 *
 * Expected differences:
 *   • Sharpe: old RFR was 0.003/month (3.6% annual); new is 0.03/12 = 0.0025/month (3% annual)
 *   • avgAnnualReturn: old was arithmetic mean of y2019–y2025; new is CAGR from monthlyReturns
 *
 * Usage:
 *   npx tsx scripts/validate-metrics.ts
 *
 * Does NOT write anything to KV.
 */

import * as fs from "fs";
import * as path from "path";

// ─── Load env ────────────────────────────────────────────────────────────────

const envFile = fs.existsSync(path.join(process.cwd(), ".env.production.local"))
  ? path.join(process.cwd(), ".env.production.local")
  : path.join(process.cwd(), "..", "..", "..", ".env.production.local");

const lines = fs.readFileSync(envFile, "utf-8").split("\n");
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  process.env[trimmed.slice(0, eq).trim()] = trimmed
    .slice(eq + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
}
process.env.VERCEL = "1";

// ─── Imports (after env is loaded) ───────────────────────────────────────────

import { storageRead } from "../lib/storage";
import type { FundsData, Fund } from "../lib/types";
import {
  computeYTDFromMonthlyReturns,
  computeAnnualReturn,
  computeAvgAnnualReturn,
  computeSharpe,
  computeStdDev,
  computePeriodReturn,
  computeStartMonth,
  computeLatestMonth,
  hasMinimumHistory,
} from "../lib/metrics";

// ─── Config ───────────────────────────────────────────────────────────────────

const TARGET_ID = "fund-29";         // ספרה VALUE
const CLIENT    = "green";
const THRESHOLD = 0.005;             // 0.5 percentage points in decimal

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(v: number | null | undefined, decimals = 4): string {
  if (v == null) return "null";
  return (v * 100).toFixed(decimals) + "%";
}

function absDiff(
  a: number | null | undefined,
  b: number | null | undefined
): number | null {
  if (a == null || b == null) return null;
  return Math.abs(a - b);
}

function checkRow(
  label: string,
  computed: number | null,
  stored: number | null | undefined,
  note = ""
): void {
  const gap = absDiff(computed, stored);
  const flag =
    gap != null && gap > THRESHOLD
      ? " ⚠️  DIFF > 0.5pp"
      : gap === null && (computed == null) !== (stored == null)
      ? " ⚠️  NULL MISMATCH"
      : "";

  const diffStr = gap != null ? `${(gap * 100).toFixed(4)}pp` : "—";

  console.log(
    `  ${label.padEnd(28)} computed=${pct(computed).padEnd(13)} stored=${pct(stored).padEnd(13)} Δ=${diffStr.padEnd(10)}${flag}${note ? `  [${note}]` : ""}`
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const fundsData = await storageRead<FundsData>(`funds:${CLIENT}`, {
    lastUpdated: "",
    categories: [],
  });

  let fund: Fund | undefined;
  for (const cat of fundsData.categories) {
    const f = cat.funds.find((f) => f.id === TARGET_ID);
    if (f) {
      fund = f;
      break;
    }
  }

  if (!fund) {
    console.error(`\nFund "${TARGET_ID}" not found in funds:${CLIENT}`);
    process.exit(1);
  }

  const mr = fund.monthlyReturns ?? {};
  const nMonths = Object.values(mr).filter((v) => typeof v === "number").length;
  const startMonth = computeStartMonth(mr);
  const endMonth = computeLatestMonth(mr);

  const SEP = "─".repeat(85);

  console.log(`\n${"═".repeat(85)}`);
  console.log(`  validate-metrics.ts — Fund: ${fund.name} (${TARGET_ID})`);
  console.log(`${"═".repeat(85)}`);
  console.log(`  monthlyReturns : ${nMonths} months`);
  console.log(`  Range          : ${startMonth ?? "—"} → ${endMonth ?? "—"}`);
  console.log(`  lastUpdated    : ${fund.lastUpdated ?? "—"}`);
  console.log(`  Has 12M+       : ${hasMinimumHistory(mr, 12)}`);
  console.log(`  Has 24M+       : ${hasMinimumHistory(mr, 24)}`);
  console.log(`  Has 36M+       : ${hasMinimumHistory(mr, 36)}`);
  console.log();
  console.log(SEP);
  console.log("  METRIC COMPARISONS  (⚠️  = absolute diff > 0.5pp)");
  console.log(SEP);

  // YTD 2026
  checkRow(
    "YTD 2026",
    computeYTDFromMonthlyReturns(mr, "2026"),
    fund.returns.ytd2026
  );

  // Annual returns 2019–2025
  const years = [2025, 2024, 2023, 2022, 2021, 2020, 2019] as const;
  for (const year of years) {
    const key = `y${year}` as keyof typeof fund.returns;
    checkRow(`Annual ${year}`, computeAnnualReturn(mr, year), fund.returns[key]);
  }

  console.log();

  // Risk metrics — expected to differ due to formula changes
  checkRow(
    "Sharpe (3% RFR)",
    computeSharpe(mr),
    fund.sharpe,
    "RFR changed 3.6% → 3%"
  );
  checkRow(
    "StdDev (annualized)",
    computeStdDev(mr),
    fund.stdDev
  );
  checkRow(
    "AvgAnnualReturn (CAGR)",
    computeAvgAnnualReturn(mr),
    fund.avgAnnualReturn,
    "was arithmetic mean"
  );

  console.log();
  console.log(SEP);
  console.log("  PERIOD RETURNS (computed only — no stored value to compare)");
  console.log(SEP);

  for (const n of [12, 24, 36, 48, 60] as const) {
    const val = computePeriodReturn(mr, n);
    const avail = hasMinimumHistory(mr, n);
    console.log(
      `  Period ${String(n).padEnd(3)}M  ${pct(val)}${!avail ? "  (not enough data)" : ""}`
    );
  }

  console.log();
  console.log(SEP);
  console.log("  FORMULA CHANGE NOTES");
  console.log(SEP);
  console.log("  Sharpe    old: (mean - 0.003) / stdDev × √12  [RFR = 3.6% annual]");
  console.log("            new: (mean - 0.0025) / stdDev × √12  [RFR = 3.0% annual]");
  console.log("  AvgAnnual old: arithmetic mean of y2019–y2025 (only 7 data points)");
  console.log("            new: CAGR from monthlyReturns (uses all available months)");
  console.log();
}

main().catch(console.error);
