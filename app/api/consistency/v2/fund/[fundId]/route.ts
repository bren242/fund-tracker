/**
 * GET /api/consistency/v2/fund/[fundId]?client=green
 *
 * Returns multi-window consistency metrics for a single fund.
 * Fast — no AI. AI insight is fetched separately via /insight route.
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

const BENCH_SHORT: Record<string, string> = {
  "equity-hedged":  'ת"א 125',
  "bond-hedged":    'ת"א 125 + תל בונד-מאגר',
  "multi-strategy": 'ת"א 125 + תל בונד-מאגר',
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

  // Locate fund and category
  let fund = null, category = null;
  for (const cat of fundsData.categories) {
    const f = cat.funds.find((f) => f.id === fundId);
    if (f) { fund = f; category = cat; break; }
  }
  if (!fund || !category) {
    return NextResponse.json({ error: "Fund not found", fundId }, { status: 404 });
  }

  // Benchmark for this category
  const blend = getBenchmarkForCategory(category.id);
  if (!blend) {
    return NextResponse.json({ error: "No benchmark for category", fundId }, { status: 404 });
  }

  const allFunds        = fundsData.categories.flatMap((c) => c.funds);
  const { endMonth }    = getWindowEndMonth(allFunds, benchmarks);
  const bmAll           = blendBenchmarkReturns(blend, benchmarks);
  const catAvgAll       = buildCategoryAvgReturns(category.funds);

  // Build fund's aligned return arrays (only months where both fund + benchmark have data)
  const fundMr       = fund.monthlyReturns ?? {};
  const monthKeys:              string[] = [];
  const fundReturns:            number[] = [];
  const benchmarkReturns:       number[] = [];
  const categoryAverageReturns: number[] = [];

  for (const m of Object.keys(fundMr).sort()) {
    const fr = fundMr[m];
    const br = bmAll[m];
    if (fr == null || br == null) continue;
    monthKeys.push(m);
    fundReturns.push(fr);
    benchmarkReturns.push(br);
    categoryAverageReturns.push(catAvgAll[m] ?? 0);
  }

  // Category IR lists per window (for ranking)
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

  return NextResponse.json({
    fund: {
      id:       fund.id,
      name:     fund.name,
      category: { id: category.id, name: category.name },
    },
    benchmarkShortName: BENCH_SHORT[category.id] ?? category.id,
    endMonthLabel:      endMonth ? hebrewLabel(endMonth) : "",
    windows,
  });
}
