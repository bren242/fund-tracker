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
          const names = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
          return `${names[parseInt(m,10)-1]} ${y}`;
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
    categoryRank:   categoryRank,
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
    window: windowInfo,
    fund: {
      id:       fund.id,
      name:     fund.name,
      category: { id: category.id, name: category.name },
    },
    ir:                      vsBenchmark?.ir ?? null,
    consistencyVsBenchmark:  vsBenchmark,
    consistencyVsCategory:   vsCategory,
    worstMonth,
    categoryStats,
    worstMonthCohortPosition: cohortPosition,
    ai,
  });
}
