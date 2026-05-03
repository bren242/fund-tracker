/**
 * GET /api/consistency/v2/fund/[fundId]/insight?client=green
 *
 * AI insight only — slow endpoint, kept off the critical path.
 * The main fund data (windows, metrics) comes from the parent route.
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { storageRead } from "@/lib/storage";
import { FundsData, Benchmark } from "@/lib/types";
import {
  getWindowEndMonth,
  getBenchmarkForCategory,
  blendBenchmarkReturns,
  buildCategoryAvgReturns,
  computeWindowMetrics,
  computeAllWindows,
  type WindowLabel,
} from "@/lib/consistency";
import {
  SYSTEM_PROMPT_FUND,
  FUND_FORBIDDEN_WORDS,
  getBenchmarkDescription,
  buildFundUserMessage,
  type FundAIInput,
  type FundAIOutput,
  type FundWindowAIRow,
} from "@/lib/consistency-v2/ai-prompts";
import { makeAICacheKey, getAICache, setAICache } from "@/lib/consistency-v2/ai-cache";
import { callAIWithForbidden } from "@/lib/consistency-v2/ai-caller";

const WIN_LABEL_DISPLAY: Record<WindowLabel, string> = {
  YTD:      "מתחילת השנה",
  "12M":    "12 חודשים",
  "24M":    "24 חודשים",
  "36M":    "36 חודשים",
  lifetime: "כל ההיסטוריה",
};

const HEBREW_MONTHS = [
  "ינואר","פברואר","מרץ","אפריל","מאי","יוני",
  "יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר",
];
function hebrewLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return `${HEBREW_MONTHS[mo - 1]} ${y}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fundId: string }> }
) {
  const { fundId } = await params;
  const client = req.nextUrl.searchParams.get("client") ?? "green";

  const [fundsData, benchmarks] = await Promise.all([
    storageRead<FundsData>(`funds:${client}`, { lastUpdated: "", categories: [] }),
    storageRead<Benchmark[]>(`benchmarks:${client}`, []),
  ]);

  let fund = null, category = null;
  for (const cat of fundsData.categories) {
    const f = cat.funds.find((f) => f.id === fundId);
    if (f) { fund = f; category = cat; break; }
  }
  if (!fund || !category) {
    return NextResponse.json({ aiInsight: null });
  }

  const blend = getBenchmarkForCategory(category.id);
  if (!blend) {
    return NextResponse.json({ aiInsight: null });
  }

  const allFunds     = fundsData.categories.flatMap((c) => c.funds);
  const { endMonth } = getWindowEndMonth(allFunds, benchmarks);
  const bmAll        = blendBenchmarkReturns(blend, benchmarks);
  const catAvgAll    = buildCategoryAvgReturns(category.funds);

  const fundMr = fund.monthlyReturns ?? {};
  const monthKeys: string[] = [], fundReturns: number[] = [];
  const benchmarkReturns: number[] = [], categoryAverageReturns: number[] = [];

  for (const m of Object.keys(fundMr).sort()) {
    const fr = fundMr[m], br = bmAll[m];
    if (fr == null || br == null) continue;
    monthKeys.push(m);
    fundReturns.push(fr);
    benchmarkReturns.push(br);
    categoryAverageReturns.push(catAvgAll[m] ?? 0);
  }

  const WIN_LABELS: WindowLabel[] = ["YTD", "12M", "24M", "36M", "lifetime"];
  const categoryFundsIRsByWindow: Partial<Record<WindowLabel, number[]>> = {};

  for (const wl of WIN_LABELS) {
    const irs: number[] = [];
    for (const other of category.funds) {
      if (other.id === fund.id) continue;
      const omr = other.monthlyReturns ?? {};
      const oMk: string[] = [], oF: number[] = [], oB: number[] = [], oC: number[] = [];
      for (const m of Object.keys(omr).sort()) {
        const fr = omr[m], br = bmAll[m];
        if (fr == null || br == null) continue;
        oMk.push(m); oF.push(fr); oB.push(br); oC.push(catAvgAll[m] ?? 0);
      }
      const metrics = computeWindowMetrics(oF, oB, oC, oMk, wl, []);
      if (metrics?.informationRatio != null) irs.push(metrics.informationRatio);
    }
    if (irs.length > 0) categoryFundsIRsByWindow[wl] = irs;
  }

  const windows = computeAllWindows(
    fundReturns, benchmarkReturns, categoryAverageReturns,
    monthKeys, categoryFundsIRsByWindow
  );

  const aiWindows: FundWindowAIRow[] = WIN_LABELS.flatMap((wl) => {
    const w = windows[wl];
    if (!w) return [];
    return [{
      label:           WIN_LABEL_DISPLAY[wl],
      months:          w.monthsCount,
      fundReturn:      w.fundReturn,
      excessReturn:    w.excessReturn,
      ir:              w.informationRatio,
      aboveBmCount:    w.monthsAboveBenchmark.count,
      aboveBmTotal:    w.monthsAboveBenchmark.total,
      mdd:             w.maxDrawdown.drawdownPct !== 0 ? w.maxDrawdown.drawdownPct : null,
      upCapture:       w.upCapture,
      downCapture:     w.downCapture,
      rankInCategory:  w.rankInCategory,
      totalInCategory: w.totalInCategory,
    }];
  });

  const aiInput: FundAIInput = {
    fundName:             fund.name,
    categoryName:         category.name,
    benchmarkDescription: getBenchmarkDescription(category.id),
    endMonthLabel:        endMonth ? hebrewLabel(endMonth) : "",
    windows:              aiWindows,
  };

  const cacheKey = makeAICacheKey("fund-v25", aiInput);
  let ai: FundAIOutput | null = await getAICache<FundAIOutput>(cacheKey);

  if (!ai) {
    const userMessage = buildFundUserMessage(aiInput);
    ai = await callAIWithForbidden<FundAIOutput>(
      SYSTEM_PROMPT_FUND, userMessage, FUND_FORBIDDEN_WORDS
    );
    if (ai) await setAICache(cacheKey, ai);
  }

  return NextResponse.json({ aiInsight: ai });
}
