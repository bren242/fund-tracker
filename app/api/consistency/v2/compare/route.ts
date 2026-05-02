/**
 * GET /api/consistency/v2/compare?funds=fund-24,fund-22,fund-23&client=green&window=24
 *
 * Returns consistency metrics + AI analysis for 2–4 funds from the same category.
 * Window end month is derived dynamically from the data.
 */
import { NextRequest, NextResponse } from "next/server";
import { storageRead } from "@/lib/storage";
import { FundsData, Fund, Category, Benchmark } from "@/lib/types";
import {
  getWindowEndMonth,
  buildWindowInfo,
  getBenchmarkForCategory,
  blendBenchmarkReturns,
  calcConsistencyVsBenchmark,
  calcConsistencyVsCategory,
  buildCategoryAvgReturns,
  computeWorstMonth,
  computeSameMonthCohortPosition,
  computeCategoryStats,
} from "@/lib/consistency";
import {
  SYSTEM_PROMPT_COMPARE,
  getBenchmarkDescription,
  buildCompareUserMessage,
  type CompareAIInput,
  type CompareAIOutput,
} from "@/lib/consistency-v2/ai-prompts";
import { makeAICacheKey, getAICache, setAICache } from "@/lib/consistency-v2/ai-cache";
import { callAI } from "@/lib/consistency-v2/ai-caller";

const VALID_WINDOWS = new Set([24, 36, 48]);

export async function GET(req: NextRequest) {
  const sp         = req.nextUrl.searchParams;
  const client     = sp.get("client") ?? "green";
  const windowSize = VALID_WINDOWS.has(Number(sp.get("window")))
    ? Number(sp.get("window")) : 24;
  const fundIds    = (sp.get("funds") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  if (fundIds.length < 2 || fundIds.length > 4) {
    return NextResponse.json(
      { error: "Provide 2–4 fund IDs in ?funds=id1,id2,..." },
      { status: 400 }
    );
  }

  const [fundsData, benchmarks] = await Promise.all([
    storageRead<FundsData>(`funds:${client}`, { lastUpdated: "", categories: [] }),
    storageRead<Benchmark[]>(`benchmarks:${client}`, []),
  ]);

  // Locate all funds and verify they share a category
  const resolved: Array<{ fund: Fund; category: Category }> = [];
  for (const id of fundIds) {
    let found = false;
    for (const cat of fundsData.categories) {
      const f = cat.funds.find((f) => f.id === id);
      if (f) { resolved.push({ fund: f, category: cat }); found = true; break; }
    }
    if (!found) return NextResponse.json({ error: `Fund not found: ${id}` }, { status: 404 });
  }

  const categoryIds = new Set(resolved.map((r) => r.category.id));
  if (categoryIds.size > 1) {
    return NextResponse.json(
      { error: "All funds must belong to the same category", categories: Array.from(categoryIds) },
      { status: 400 }
    );
  }

  const category   = resolved[0].category;
  const allFunds   = fundsData.categories.flatMap((c) => c.funds);
  const { endMonth } = getWindowEndMonth(allFunds, benchmarks);
  const windowInfo   = buildWindowInfo(endMonth, windowSize);
  const { windowMonths } = windowInfo;

  const blend    = getBenchmarkForCategory(category.id);
  const bmAll    = blend ? blendBenchmarkReturns(blend, benchmarks) : {};
  const bmWindow: Record<string, number> = {};
  for (const m of windowMonths) { if (bmAll[m] != null) bmWindow[m] = bmAll[m]; }

  const catAvgAll    = buildCategoryAvgReturns(category.funds);
  const catAvgWindow: Record<string, number> = {};
  for (const m of windowMonths) { if (catAvgAll[m] != null) catAvgWindow[m] = catAvgAll[m]; }

  const categoryStats = blend
    ? computeCategoryStats(category.id, category.name, category.funds, bmWindow, windowMonths)
    : null;

  const funds = resolved.map(({ fund }) => {
    const fundWindow: Record<string, number> = {};
    for (const m of windowMonths) {
      const v = fund.monthlyReturns?.[m];
      if (v != null) fundWindow[m] = v;
    }

    const vsBenchmark    = blend ? calcConsistencyVsBenchmark(fundWindow, bmWindow) : null;
    const vsCategory     = calcConsistencyVsCategory(fundWindow, catAvgWindow);
    const worstMonth     = blend ? computeWorstMonth(fund, bmWindow, category.funds, windowMonths) : null;
    const cohortPosition = worstMonth
      ? computeSameMonthCohortPosition(fund, category.funds, worstMonth.monthKey)
      : null;

    return {
      fundId:                  fund.id,
      fundName:                fund.name,
      ir:                      vsBenchmark?.ir ?? null,
      consistencyVsBenchmark:  vsBenchmark,
      consistencyVsCategory:   vsCategory,
      worstMonth,
      worstMonthCohortPosition: cohortPosition,
    };
  });

  // ── Build AI analysis ──────────────────────────────────────────────────────
  const startLabel = windowMonths.length > 0
    ? windowMonths[0].replace(/(\d{4})-(\d{2})/, (_, y, m) => {
        const names = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
        return `${names[parseInt(m,10)-1]} ${y}`;
      })
    : "";

  const aiInput: CompareAIInput = {
    categoryName:         category.name,
    benchmarkDescription: getBenchmarkDescription(category.id),
    windowMonths:         windowSize,
    startMonthLabel:      startLabel,
    endMonthLabel:        windowInfo.endMonthLabel,
    funds: funds.map(({ fundId, fundName, ir, consistencyVsBenchmark: vsB, consistencyVsCategory: vsC, worstMonth, worstMonthCohortPosition: cohort }) => ({
      name:             fundName,
      ir,
      score:            vsB?.score ?? null,
      wins:             vsB?.wins ?? null,
      total:            vsB?.total ?? null,
      avgGapPct:        vsB?.avgGap ?? null,
      scoreVsCategory:  vsC?.score ?? null,
      worstMonth: worstMonth ? {
        monthLabel:    worstMonth.monthLabelHebrew,
        fundReturnPct: worstMonth.fundReturn,
        bmReturnPct:   worstMonth.benchmarkReturn,
        gapPct:        worstMonth.fundVsBenchmark,
        catAvgPct:     worstMonth.categoryAverageReturn,
        cohortRank:    cohort?.rank ?? null,
        cohortTotal:   cohort?.total ?? null,
      } : null,
    })),
    categoryTotal:  categoryStats?.fundCount ?? null,
    categoryAvgIR:  categoryStats?.averageIR ?? null,
  };

  const cacheKey = makeAICacheKey("compare", aiInput);
  let ai: CompareAIOutput | null = await getAICache<CompareAIOutput>(cacheKey);

  if (!ai) {
    const userMessage = buildCompareUserMessage(aiInput);
    ai = await callAI<CompareAIOutput>(SYSTEM_PROMPT_COMPARE, userMessage, 2500);
    if (ai) await setAICache(cacheKey, ai);
  }

  return NextResponse.json({
    window:   windowInfo,
    category: { id: category.id, name: category.name },
    funds,
    ai,
  });
}
