/**
 * Simulates all 4 consistency/v2 endpoints using production KV data directly.
 * Run: node scripts/test-v2-endpoints.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Load .env.production.local
const envFile = resolve(root, ".env.production.local");
const envLines = readFileSync(envFile, "utf8").split("\n");
for (const line of envLines) {
  const [k, ...rest] = line.split("=");
  if (k && rest.length > 0) {
    const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
    process.env[k.trim()] = val;
  }
}

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

if (!KV_URL || !KV_TOKEN) {
  console.error("Missing KV_REST_API_URL or KV_REST_API_TOKEN");
  process.exit(1);
}

async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const json = await res.json();
  return json.result ? JSON.parse(json.result) : null;
}

// ── Consistency logic (inlined from lib/consistency.ts) ──────────────────────

const CATEGORY_BLEND = {
  "equity-hedged":  { "bm-ta125": 1.0 },
  "bond-hedged":    { "bm-ta125": 0.15, "bm-telbond-maagar": 0.85 },
  "multi-strategy": { "bm-ta125": 0.30, "bm-telbond-maagar": 0.70 },
};

function getBenchmarkForCategory(catId) {
  return CATEGORY_BLEND[catId] ?? null;
}

function hebrewMonthLabel(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  const names = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
  return `${names[parseInt(m, 10) - 1]} ${y}`;
}

function windowMonthKeys(endMonth, count) {
  const [ey, em] = endMonth.split("-").map(Number);
  const months = [];
  for (let i = count - 1; i >= 0; i--) {
    let month = em - i;
    let year = ey;
    while (month <= 0) { month += 12; year--; }
    months.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return months;
}

function getWindowEndMonth(allFunds, benchmarks) {
  const fundData = [];
  for (const fund of allFunds) {
    const months = Object.keys(fund.monthlyReturns ?? {}).sort();
    if (months.length > 0) fundData.push({ id: fund.id, lastMonth: months[months.length - 1] });
  }
  if (fundData.length === 0) return { endMonth: "", endMonthLabel: "", consensusFundMonth: "", benchmarkCeiling: "", partialFundIds: [] };

  const sortedLastMonths = fundData.map((f) => f.lastMonth).sort();
  const consensusFundMonth = sortedLastMonths[Math.floor(sortedLastMonths.length / 2)];

  const relevantBmIds = new Set(Object.values(CATEGORY_BLEND).flatMap((blend) => Object.keys(blend)));
  const bmLastMonths = Array.from(relevantBmIds)
    .map((id) => {
      const bm = benchmarks.find((b) => b.id === id);
      const months = Object.keys(bm?.monthlyReturns ?? {}).sort();
      return months.length > 0 ? months[months.length - 1] : null;
    })
    .filter((m) => m != null);
  const benchmarkCeiling = bmLastMonths.length > 0 ? bmLastMonths.reduce((a, b) => (a < b ? a : b)) : consensusFundMonth;

  const endMonth = consensusFundMonth < benchmarkCeiling ? consensusFundMonth : benchmarkCeiling;
  const partialFundIds = fundData.filter((f) => f.lastMonth < endMonth).map((f) => f.id);
  return { endMonth, endMonthLabel: hebrewMonthLabel(endMonth), consensusFundMonth, benchmarkCeiling, partialFundIds };
}

function buildWindowInfo(endMonth, windowSize) {
  return {
    endMonth,
    endMonthLabel: hebrewMonthLabel(endMonth),
    months: windowSize,
    windowMonths: windowMonthKeys(endMonth, windowSize),
  };
}

function blendBenchmarkReturns(blend, benchmarks) {
  const result = {};
  for (const [bmId, weight] of Object.entries(blend)) {
    const bm = benchmarks.find((b) => b.id === bmId);
    if (!bm) continue;
    for (const [month, ret] of Object.entries(bm.monthlyReturns ?? {})) {
      result[month] = (result[month] ?? 0) + ret * weight;
    }
  }
  return result;
}

function calcConsistency(fundWindow, refWindow, minMonths, withIR) {
  const months = Object.keys(fundWindow).filter((m) => refWindow[m] != null).sort();
  if (months.length < minMonths) return null;
  const gaps = months.map((m) => fundWindow[m] - refWindow[m]);
  const wins = gaps.filter((g) => g > 0).length;
  const total = gaps.length;
  const avg = gaps.reduce((s, v) => s + v, 0) / total;
  let ir = null;
  if (withIR && total >= 2) {
    const variance = gaps.reduce((s, g) => s + (g - avg) ** 2, 0) / (total - 1);
    const std = Math.sqrt(variance);
    ir = std > 0 ? Math.round((avg / std) * 1000) / 1000 : null;
  }
  return {
    score: Math.round((wins / total) * 10000) / 100,
    wins, total,
    avgGap: Math.round(avg * 1_000_000) / 1_000_000,
    ir,
  };
}

function calcConsistencyVsBenchmark(fundWindow, bmWindow, minMonths = 12) {
  return calcConsistency(fundWindow, bmWindow, minMonths, true);
}

function calcConsistencyVsCategory(fundWindow, catAvgWindow, minMonths = 12) {
  return calcConsistency(fundWindow, catAvgWindow, minMonths, false);
}

function buildCategoryAvgReturns(funds) {
  const sums = {}, counts = {};
  for (const fund of funds) {
    for (const [m, v] of Object.entries(fund.monthlyReturns ?? {})) {
      sums[m] = (sums[m] ?? 0) + v;
      counts[m] = (counts[m] ?? 0) + 1;
    }
  }
  const result = {};
  for (const m of Object.keys(sums)) result[m] = sums[m] / counts[m];
  return result;
}

function computeCategoryAverageReturn(catFunds, monthKey) {
  const vals = catFunds.map((f) => f.monthlyReturns?.[monthKey]).filter((v) => v != null);
  if (vals.length < 3) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function computeWorstMonth(fund, bmWindow, catFunds, windowMonths) {
  let worstKey = null;
  let worstExcess = Infinity;
  for (const m of windowMonths) {
    const fr = fund.monthlyReturns?.[m];
    const br = bmWindow[m];
    if (fr == null || br == null) continue;
    const excess = fr - br;
    if (excess < worstExcess) { worstExcess = excess; worstKey = m; }
  }
  if (worstKey === null) return null;
  return {
    monthKey: worstKey,
    monthLabelHebrew: hebrewMonthLabel(worstKey),
    fundReturn: fund.monthlyReturns[worstKey],
    benchmarkReturn: bmWindow[worstKey],
    categoryAverageReturn: computeCategoryAverageReturn(catFunds, worstKey),
    fundVsBenchmark: worstExcess,
  };
}

function computeSameMonthCohortPosition(fund, catFunds, monthKey) {
  const fundReturn = fund.monthlyReturns?.[monthKey];
  if (fundReturn == null) return null;
  const otherReturns = catFunds.filter((f) => f.id !== fund.id)
    .map((f) => f.monthlyReturns?.[monthKey]).filter((v) => v != null);
  if (otherReturns.length === 0) return null;
  const strictlyAbove = otherReturns.filter((r) => r > fundReturn).length;
  const beaten        = otherReturns.filter((r) => fundReturn > r).length;
  return {
    fundReturn,
    rank:       1 + strictlyAbove,
    total:      otherReturns.length + 1,
    percentile: Math.round((beaten / otherReturns.length) * 100),
  };
}

function computeCategoryStats(catId, catName, funds, bmWindow, windowMonths) {
  const fundStats = [];
  for (const fund of funds) {
    const fw = {};
    for (const m of windowMonths) { const v = fund.monthlyReturns?.[m]; if (v != null) fw[m] = v; }
    const vs = calcConsistencyVsBenchmark(fw, bmWindow);
    if (vs?.ir != null) fundStats.push({ fundId: fund.id, fundName: fund.name, ir: vs.ir });
  }
  fundStats.sort((a, b) => b.ir - a.ir);
  const avg = fundStats.length > 0 ? fundStats.reduce((s, f) => s + f.ir, 0) / fundStats.length : 0;
  return { categoryKey: catId, categoryLabel: catName, fundCount: fundStats.length, averageIR: +avg.toFixed(3), funds: fundStats };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Loading production data from KV...\n");

  const [fundsData, benchmarks] = await Promise.all([
    kvGet("funds:green"),
    kvGet("benchmarks:green"),
  ]);

  if (!fundsData || !benchmarks) {
    console.error("Failed to load data from KV");
    process.exit(1);
  }

  const allFunds = fundsData.categories.flatMap((c) => c.funds);
  console.log(`Loaded ${allFunds.length} funds, ${benchmarks.length} benchmarks\n`);

  const windowEndInfo = getWindowEndMonth(allFunds, benchmarks);
  const windowInfo    = buildWindowInfo(windowEndInfo.endMonth, 24);
  const { windowMonths } = windowInfo;

  // ── 1. /api/consistency/v2/fund/fund-24 ──────────────────────────────────
  console.log("=".repeat(70));
  console.log("1. /api/consistency/v2/fund/fund-24");
  console.log("=".repeat(70));

  const fundId = "fund-24";
  let fund = null, category = null;
  for (const cat of fundsData.categories) {
    const f = cat.funds.find((f) => f.id === fundId);
    if (f) { fund = f; category = cat; break; }
  }

  if (fund && category) {
    const blend  = getBenchmarkForCategory(category.id);
    const bmAll  = blend ? blendBenchmarkReturns(blend, benchmarks) : {};
    const bmWindow = {};
    for (const m of windowMonths) { if (bmAll[m] != null) bmWindow[m] = bmAll[m]; }

    const fw = {};
    for (const m of windowMonths) { const v = fund.monthlyReturns?.[m]; if (v != null) fw[m] = v; }

    const catAvgAll = buildCategoryAvgReturns(category.funds);
    const catAvgWindow = {};
    for (const m of windowMonths) { if (catAvgAll[m] != null) catAvgWindow[m] = catAvgAll[m]; }

    const vsBenchmark    = blend ? calcConsistencyVsBenchmark(fw, bmWindow) : null;
    const vsCategory     = calcConsistencyVsCategory(fw, catAvgWindow);
    const worstMonth     = blend ? computeWorstMonth(fund, bmWindow, category.funds, windowMonths) : null;
    const categoryStats  = blend ? computeCategoryStats(category.id, category.name, category.funds, bmWindow, windowMonths) : null;
    const cohortPosition = worstMonth ? computeSameMonthCohortPosition(fund, category.funds, worstMonth.monthKey) : null;

    const result1 = {
      window: windowInfo,
      fund: { id: fund.id, name: fund.name, category: { id: category.id, name: category.name } },
      ir: vsBenchmark?.ir ?? null,
      consistencyVsBenchmark: vsBenchmark,
      consistencyVsCategory: vsCategory,
      worstMonth,
      categoryStats: categoryStats ? { ...categoryStats, funds: categoryStats.funds.slice(0, 5) } : null,
      worstMonthCohortPosition: cohortPosition,
    };
    console.log(JSON.stringify(result1, null, 2));
  } else {
    console.log(`Fund ${fundId} not found`);
  }

  // ── 2. /api/consistency/v2/compare?funds=fund-24,fund-22,fund-23 ─────────
  console.log("\n" + "=".repeat(70));
  console.log("2. /api/consistency/v2/compare?funds=fund-24,fund-22,fund-23");
  console.log("=".repeat(70));

  const compareFundIds = ["fund-24", "fund-22", "fund-23"];
  const resolved = [];
  for (const id of compareFundIds) {
    for (const cat of fundsData.categories) {
      const f = cat.funds.find((f) => f.id === id);
      if (f) { resolved.push({ fund: f, category: cat }); break; }
    }
  }

  if (resolved.length === compareFundIds.length) {
    const cat2     = resolved[0].category;
    const blend2   = getBenchmarkForCategory(cat2.id);
    const bmAll2   = blend2 ? blendBenchmarkReturns(blend2, benchmarks) : {};
    const bmWindow2 = {};
    for (const m of windowMonths) { if (bmAll2[m] != null) bmWindow2[m] = bmAll2[m]; }

    const catAvgAll2 = buildCategoryAvgReturns(cat2.funds);
    const catAvgWindow2 = {};
    for (const m of windowMonths) { if (catAvgAll2[m] != null) catAvgWindow2[m] = catAvgAll2[m]; }

    const compareFunds = resolved.map(({ fund }) => {
      const fw2 = {};
      for (const m of windowMonths) { const v = fund.monthlyReturns?.[m]; if (v != null) fw2[m] = v; }
      const vsBm2  = blend2 ? calcConsistencyVsBenchmark(fw2, bmWindow2) : null;
      const vsCat2 = calcConsistencyVsCategory(fw2, catAvgWindow2);
      const worst2 = blend2 ? computeWorstMonth(fund, bmWindow2, cat2.funds, windowMonths) : null;
      const cohort2 = worst2 ? computeSameMonthCohortPosition(fund, cat2.funds, worst2.monthKey) : null;
      return { fundId: fund.id, fundName: fund.name, ir: vsBm2?.ir ?? null,
        consistencyVsBenchmark: vsBm2, consistencyVsCategory: vsCat2,
        worstMonth: worst2, worstMonthCohortPosition: cohort2 };
    });

    const result2 = { window: windowInfo, category: { id: cat2.id, name: cat2.name }, funds: compareFunds };
    console.log(JSON.stringify(result2, null, 2));
  }

  // ── 3. /api/consistency/v2/leaderboard?limit=5 ───────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("3. /api/consistency/v2/leaderboard?limit=5");
  console.log("=".repeat(70));

  let totalFundsWithIR = 0;
  const categories = fundsData.categories.map((cat) => {
    const blend3 = getBenchmarkForCategory(cat.id);
    if (!blend3) return null;
    const bmAll3 = blendBenchmarkReturns(blend3, benchmarks);
    const bmWindow3 = {};
    for (const m of windowMonths) { if (bmAll3[m] != null) bmWindow3[m] = bmAll3[m]; }
    const stats = computeCategoryStats(cat.id, cat.name, cat.funds, bmWindow3, windowMonths);
    if (stats.fundCount === 0) return null;
    totalFundsWithIR += stats.fundCount;
    const rankedFunds = stats.funds.slice(0, 5).map((f, i) => ({ rank: i + 1, fundId: f.fundId, fundName: f.fundName, ir: f.ir }));
    return { categoryKey: stats.categoryKey, categoryLabel: stats.categoryLabel, fundCount: stats.fundCount, averageIR: stats.averageIR, funds: rankedFunds };
  }).filter(Boolean);

  const result3 = { window: windowInfo, totalFundsWithIR, totalFundsPartial: windowEndInfo.partialFundIds.length, categories };
  console.log(JSON.stringify(result3, null, 2));

  // ── 4. /api/consistency/v2/diagnostic ────────────────────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("4. /api/consistency/v2/diagnostic");
  console.log("=".repeat(70));

  const relevantBmIds = new Set(
    fundsData.categories.map((c) => getBenchmarkForCategory(c.id)).filter(Boolean).flatMap((blend) => Object.keys(blend))
  );

  const benchmarkStatus = benchmarks.map((bm) => {
    const months    = Object.keys(bm.monthlyReturns ?? {}).sort();
    const lastMonth = months[months.length - 1] ?? null;
    const inWindow  = windowMonths.filter((m) => (bm.monthlyReturns ?? {})[m] != null).length;
    const missing   = windowMonths.filter((m) => (bm.monthlyReturns ?? {})[m] == null);
    return {
      id: bm.id, name: bm.name, isRelevant: relevantBmIds.has(bm.id),
      lastMonth, monthCount: months.length, inWindow,
      missingFromWindow: missing.length > 0 ? missing : undefined,
      isCeiling: lastMonth === windowEndInfo.benchmarkCeiling && relevantBmIds.has(bm.id),
    };
  });

  const partialFunds = [];
  let noDataCount = 0;
  const partialSet = new Set(windowEndInfo.partialFundIds);
  for (const cat of fundsData.categories) {
    for (const fund of cat.funds) {
      const months = Object.keys(fund.monthlyReturns ?? {}).sort();
      if (months.length === 0) { noDataCount++; continue; }
      const lastMonth = months[months.length - 1];
      if (partialSet.has(fund.id)) {
        const missing = windowMonths.filter((m) => m > lastMonth);
        partialFunds.push({ id: fund.id, name: fund.name, category: cat.id, lastMonth, missingMonths: missing });
      }
    }
  }

  const totalFunds   = allFunds.length;
  const currentFunds = totalFunds - partialFunds.length - noDataCount;

  const result4 = {
    generatedAt: new Date().toISOString(),
    windowDetermination: {
      consensusFundMonth: windowEndInfo.consensusFundMonth,
      benchmarkCeiling:   windowEndInfo.benchmarkCeiling,
      finalEndMonth:      windowEndInfo.endMonth,
      note:
        windowEndInfo.endMonth === windowEndInfo.benchmarkCeiling &&
        windowEndInfo.endMonth === windowEndInfo.consensusFundMonth
          ? "set by: both fund consensus and benchmark ceiling"
          : windowEndInfo.endMonth === windowEndInfo.benchmarkCeiling
          ? "set by: benchmark ceiling (lower than fund consensus)"
          : "set by: fund consensus (lower than benchmark ceiling)",
    },
    window: { endMonth: windowInfo.endMonth, startMonth: windowMonths[0], months: windowInfo.months, endMonthLabel: windowInfo.endMonthLabel },
    benchmarks: benchmarkStatus,
    funds: { total: totalFunds, current: currentFunds, partial: partialFunds.length, noData: noDataCount },
    partialFunds,
  };
  console.log(JSON.stringify(result4, null, 2));
}

main().catch(console.error);
