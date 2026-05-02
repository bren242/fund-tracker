/**
 * Production KV verification script — runs against real production data.
 * Usage: npx tsx scripts/verify-production-kv.ts
 */
import * as fs from "fs";
import * as path from "path";

// Load production env vars BEFORE anything else runs
const envFile = path.join(process.cwd(), ".env.production.local");
const lines = fs.readFileSync(envFile, "utf-8").split("\n");
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  process.env[key] = val;
}
process.env.VERCEL = "1"; // force KV path in storageRead

import { storageRead } from "../lib/storage";
import { FundsData, Benchmark, Fund, Category } from "../lib/types";
import {
  getBenchmarkForCategory,
  blendBenchmarkReturns,
  windowMonthKeys,
  computeWorstMonth,
  computeCategoryStats,
} from "../lib/consistency";

const CLIENT     = "green";
const FUND_ID    = "fund-24"; // טריו
const END_MONTH  = "2026-04";
const WINDOW_SIZE = 24;

function findFund(fd: FundsData, id: string): { fund: Fund; category: Category } | null {
  for (const cat of fd.categories) {
    const f = cat.funds.find(f => f.id === id);
    if (f) return { fund: f, category: cat };
  }
  return null;
}

async function main() {
  console.log("Loading production data...\n");

  const [fundsData, benchmarks] = await Promise.all([
    storageRead<FundsData>(`funds:${CLIENT}`, { lastUpdated: "", categories: [] }),
    storageRead<Benchmark[]>(`benchmarks:${CLIENT}`, []),
  ]);

  // ── 1. Benchmark coverage ───────────────────────────────────────────────
  console.log("══════════════════════════════════════════");
  console.log("1. BENCHMARK COVERAGE");
  console.log("══════════════════════════════════════════");

  const window = windowMonthKeys(END_MONTH, WINDOW_SIZE);
  const windowStart = window[0];
  const windowEnd   = window[window.length - 1];

  const interestingBms = ["bm-ta125", "bm-telbond-maagar", "bm-agach-klali"];

  for (const bmId of interestingBms) {
    const bm = benchmarks.find(b => b.id === bmId);
    if (!bm) { console.log(bmId, "— NOT FOUND"); continue; }
    const allMonths = Object.keys(bm.monthlyReturns ?? {}).sort();
    const inWindow  = allMonths.filter(m => m >= windowStart && m <= windowEnd);
    const missing   = window.filter(m => !inWindow.includes(m));
    console.log(`\n${bmId} — ${bm.name}`);
    console.log(`  Total months in KV : ${allMonths.length}`);
    console.log(`  Range              : ${allMonths[0]} → ${allMonths[allMonths.length - 1]}`);
    console.log(`  In 24M window      : ${inWindow.length} / ${WINDOW_SIZE}`);
    if (missing.length > 0) {
      console.log(`  Missing months     : ${missing.join(", ")}`);
    } else {
      console.log(`  Missing months     : none ✓`);
    }
  }

  // ── 2. computeCategoryStats on production — minMonths=12 ───────────────
  console.log("\n══════════════════════════════════════════");
  console.log("2. computeCategoryStats — equity-hedged — 24M — minMonths=12");
  console.log("══════════════════════════════════════════");

  const found = findFund(fundsData, FUND_ID);
  if (!found) { console.error("fund-24 not found"); return; }
  const { fund, category } = found;

  const blend = getBenchmarkForCategory(category.id)!;
  const allBmReturns = blendBenchmarkReturns(blend, benchmarks);
  const bmWindow: Record<string, number> = {};
  for (const m of window) {
    if (allBmReturns[m] != null) bmWindow[m] = allBmReturns[m];
  }

  console.log(`Benchmark months in window: ${Object.keys(bmWindow).length}`);

  const stats = computeCategoryStats(
    category.id, category.name, category.funds, bmWindow, window
  );

  console.log(`\nfundCount  : ${stats.fundCount}`);
  console.log(`averageIR  : ${stats.averageIR}`);
  console.log("\nTop 5:");
  stats.funds.slice(0, 5).forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.fundName.padEnd(30)} IR=${f.ir}`);
  });
  console.log("\nFull sorted list:");
  console.log(JSON.stringify(stats.funds, null, 2));

  // Funds with data but excluded (< minMonths overlap)
  const excludedFunds = category.funds.filter(f => {
    const mr = f.monthlyReturns ?? {};
    const overlap = window.filter(m => mr[m] != null && bmWindow[m] != null).length;
    return overlap > 0 && overlap < 12;
  });
  if (excludedFunds.length > 0) {
    console.log("\nFunds with some data but excluded (< 12 months overlap):");
    for (const f of excludedFunds) {
      const overlap = window.filter(m =>
        (f.monthlyReturns ?? {})[m] != null && bmWindow[m] != null
      ).length;
      console.log(`  ${f.name}: ${overlap} months overlap`);
    }
  }

  // ── 3. computeWorstMonth on production ────────────────────────────────
  console.log("\n══════════════════════════════════════════");
  console.log("3. computeWorstMonth — fund-24 (טריו) — 24M ending", END_MONTH);
  console.log("══════════════════════════════════════════");
  const mr = fund.monthlyReturns ?? {};
  console.log(`Fund months in window: ${window.filter(m => mr[m] != null).length}`);
  const worst = computeWorstMonth(fund, bmWindow, category.funds, window);
  console.log(JSON.stringify(worst, null, 2));
}

main().catch(console.error);
