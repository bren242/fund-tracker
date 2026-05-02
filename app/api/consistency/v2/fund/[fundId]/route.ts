/**
 * GET /api/consistency/v2/fund/[fundId]?client=green&window=24
 *
 * Returns full consistency metrics + AI analysis for a single fund.
 * Window end month is derived dynamically from the data.
 */
import { NextRequest, NextResponse } from "next/server";
import { storageRead } from "@/lib/storage";
import { FundsData, Benchmark } from "@/lib/types";
import {
  getWindowEndMonth,
  buildWindowInfo,
  getBenchmarkForCategory,
  blendBenchmarkReturns,
  calcConsistencyVsBenchmark,
  calcConsistencyVsCategory,
  buildCategoryAvgReturns,
  computeWorstMonth,
  computeCategoryStats,
  computeSameMonthCohortPosition,
} from "@/lib/consistency";
import {
  SYSTEM_PROMPT_FUND,
  getBenchmarkDescription,
  buildFundUserMessage,
  type FundAIInput,
  type FundAIOutput,
} from "@/lib/consistency-v2/ai-prompts";
import { makeAICacheKey, getAICache, setAICache } from "@/lib/consistency-v2/ai-cache";
import { callAI } from "@/lib/consistency-v2/ai-caller";

const VALID_WINDOWS = new Set([24, 36, 48]);

const SHORT_MONTHS = ["ינו","פבר","מרץ","אפר","מאי","יוני","יולי","אוג","ספט","אוק","נוב","דצ"];
const HEBREW_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

function hebrewLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return `${HEBREW_MONTHS[mo - 1]} ${y}`;
}
function shortLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return `${SHORT_MONTHS[mo - 1]} ${String(y).slice(2)}`;
}

const BENCH_SHORT: Record<string, string> = {
  "equity-hedged":  'ת"א 125',
  "bond-hedged":    'ת"א 125 + תל בונד-מאגר',
  "multi-strategy": 'ת"א 125 + תל בונד-מאגר',
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fundId: string }> }
) {
  const { fundId } = await params;
  const sp          = req.nextUrl.searchParams;
  const client      = sp.get("client") ?? "green";
  const windowSize  = VALID_WINDOWS.has(Number(sp.get("window")))
    ? Number(sp.get("window")) : 24;

  const [fundsData, benchmarks] = await Promise.all([
    storageRead<FundsData>(`funds:${client}`, { lastUpdated: "", categories: [] }),
    storageRead<Benchmark[]>(`benchmarks:${client}`, []),
  ]);

  // Locate fund and its category
  let fund = null, category = null;
  for (const cat of fundsData.categories) {
    const f = cat.funds.find((f) => f.id === fundId);
    if (f) { fund = f; category = cat; break; }
  }
  if (!fund || !category) {
    return NextResponse.json({ error: "Fund not found", fundId }, { status: 404 });
  }

  // Dynamic window end
  const allFunds   = fundsData.categories.flatMap((c) => c.funds);
  const { endMonth } = getWindowEndMonth(allFunds, benchmarks);
  const windowInfo   = buildWindowInfo(endMonth, windowSize);
  const { windowMonths } = windowInfo;

  // Benchmark blend for this category
  const blend    = getBenchmarkForCategory(category.id);
  const bmAll    = blend ? blendBenchmarkReturns(blend, benchmarks) : {};
  const bmWindow: Record<string, number> = {};
  for (const m of windowMonths) { if (bmAll[m] != null) bmWindow[m] = bmAll[m]; }

  // Fund returns in window
  const fundWindow: Record<string, number> = {};
  for (const m of windowMonths) {
    const v = fund.monthlyReturns?.[m];
    if (v != null) fundWindow[m] = v;
  }

  // Category avg in window
  const catAvgAll    = buildCategoryAvgReturns(category.funds);
  const catAvgWindow: Record<string, number> = {};
  for (const m of windowMonths) { if (catAvgAll[m] != null) catAvgWindow[m] = catAvgAll[m]; }

  const vsBenchmark    = blend ? calcConsistencyVsBenchmark(fundWindow, bmWindow) : null;
  const vsCategory     = calcConsistencyVsCategory(fundWindow, catAvgWindow);
  const worstMonth     = blend ? computeWorstMonth(fund, bmWindow, category.funds, windowMonths) : null;
  const categoryStats  = blend ? computeCategoryStats(category.id, category.name, category.funds, bmWindow, windowMonths) : null;
  const cohortPosition = worstMonth
    ? computeSameMonthCohortPosition(fund, category.funds, worstMonth.monthKey)
    : null;

  // ── Chart data: monthly excess returns where both fund + benchmark have data ──
  const chartData = windowMonths
    .filter((m) => fundWindow[m] != null && bmWindow[m] != null)
    .map((m) => ({
      month:        m,
      shortLabel:   shortLabel(m),
      excessReturn: fundWindow[m] - bmWindow[m],
    }));

  // Best month (highest excess return)
  const bestEntry = chartData.length > 0
    ? chartData.reduce((a, b) => b.excessReturn > a.excessReturn ? b : a)
    : null;
  const bestMonth = bestEntry
    ? { monthKey: bestEntry.month, monthLabelHebrew: hebrewLabel(bestEntry.month), shortLabel: bestEntry.shortLabel, excessReturn: bestEntry.excessReturn }
    : null;

  // ── Global rank across all benchmark-mapped categories ──────────────────────
  const allSystemStats: { fundId: string; ir: number }[] = [];
  for (const cat of fundsData.categories) {
    const catBlend = getBenchmarkForCategory(cat.id);
    if (!catBlend) continue;
    const catBmAll = blendBenchmarkReturns(catBlend, benchmarks);
    const catBmW: Record<string, number> = {};
    for (const m of windowMonths) if (catBmAll[m] != null) catBmW[m] = catBmAll[m];
    for (const f of cat.funds) {
      const fW: Record<string, number> = {};
      for (const m of windowMonths) if (f.monthlyReturns?.[m] != null) fW[m] = f.monthlyReturns[m];
      const res = calcConsistencyVsBenchmark(fW, catBmW);
      if (res?.ir != null) allSystemStats.push({ fundId: f.id, ir: res.ir });
    }
  }
  allSystemStats.sort((a, b) => b.ir - a.ir);
  const totalInSystem = allSystemStats.length;
  const globalRank    = vsBenchmark?.ir != null
    ? (allSystemStats.findIndex((f) => f.fundId === fundId) + 1) || null
    : null;

  // ── Build AI analysis ──────────────────────────────────────────────────────
  const categoryRank = categoryStats
    ? (categoryStats.funds.findIndex((f) => f.fundId === fundId) + 1) || null
    : null;

  const aiInput: FundAIInput = {
    fundName:             fund.name,
    categoryName:         category.name,
    benchmarkDescription: getBenchmarkDescription(category.id),
    windowMonths:         windowSize,
    startMonthLabel:      windowMonths.length > 0
      ? windowInfo.windowMonths[0].replace(/(\d{4})-(\d{2})/, (_, y, m) => {
          return `${HEBREW_MONTHS[parseInt(m,10)-1]} ${y}`;
        })
      : "",
    endMonthLabel:        windowInfo.endMonthLabel,
    ir:                   vsBenchmark?.ir ?? null,
    vsB: vsBenchmark ? {
      score:  vsBenchmark.score,
      wins:   vsBenchmark.wins,
      total:  vsBenchmark.total,
      avgGap: vsBenchmark.avgGap,
    } : null,
    vsC: vsCategory ? {
      score: vsCategory.score,
      wins:  vsCategory.wins,
      total: vsCategory.total,
    } : null,
    worstMonth: worstMonth ? {
      monthLabel:   worstMonth.monthLabelHebrew,
      fundReturnPct: worstMonth.fundReturn,
      bmReturnPct:   worstMonth.benchmarkReturn,
      gapPct:        worstMonth.fundVsBenchmark,
      catAvgPct:     worstMonth.categoryAverageReturn,
    } : null,
    cohort: cohortPosition ? {
      rank:       cohortPosition.rank,
      total:      cohortPosition.total,
      percentile: cohortPosition.percentile,
    } : null,
    categoryRank,
    categoryTotal:  categoryStats?.fundCount ?? null,
    categoryAvgIR:  categoryStats?.averageIR ?? null,
  };

  const cacheKey = makeAICacheKey("fund", aiInput);
  let ai: FundAIOutput | null = await getAICache<FundAIOutput>(cacheKey);

  if (!ai) {
    const userMessage = buildFundUserMessage(aiInput);
    ai = await callAI<FundAIOutput>(SYSTEM_PROMPT_FUND, userMessage);
    if (ai) await setAICache(cacheKey, ai);
  }

  return NextResponse.json({
    window:                   windowInfo,
    fund: {
      id:       fund.id,
      name:     fund.name,
      category: { id: category.id, name: category.name },
    },
    benchmarkShortName:       BENCH_SHORT[category.id] ?? getBenchmarkDescription(category.id),
    ir:                       vsBenchmark?.ir ?? null,
    consistencyVsBenchmark:   vsBenchmark,
    consistencyVsCategory:    vsCategory,
    worstMonth,
    bestMonth,
    chartData,
    categoryStats,
    worstMonthCohortPosition: cohortPosition,
    globalRank,
    totalInSystem,
    ai,
  });
}
