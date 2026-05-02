/**
 * GET /api/consistency/v2/diagnostic?client=green
 *
 * Returns a full data-health snapshot:
 * - How the dynamic window end month was determined
 * - Benchmark coverage per benchmark
 * - Fund status: current / partial / no-data
 */
import { NextRequest, NextResponse } from "next/server";
import { storageRead } from "@/lib/storage";
import { FundsData, Benchmark } from "@/lib/types";
import {
  getWindowEndMonth,
  buildWindowInfo,
  getBenchmarkForCategory,
  windowMonthKeys,
} from "@/lib/consistency";

export async function GET(req: NextRequest) {
  const client = req.nextUrl.searchParams.get("client") ?? "green";

  const [fundsData, benchmarks] = await Promise.all([
    storageRead<FundsData>(`funds:${client}`, { lastUpdated: "", categories: [] }),
    storageRead<Benchmark[]>(`benchmarks:${client}`, []),
  ]);

  const allFunds      = fundsData.categories.flatMap((c) => c.funds);
  const windowEndInfo = getWindowEndMonth(allFunds, benchmarks);
  const windowInfo    = buildWindowInfo(windowEndInfo.endMonth, 24);
  const { windowMonths } = windowInfo;
  const partialSet    = new Set(windowEndInfo.partialFundIds);

  // ── Benchmarks ──────────────────────────────────────────────────────────────
  const relevantBmIds = new Set(
    fundsData.categories
      .map((c) => getBenchmarkForCategory(c.id))
      .filter(Boolean)
      .flatMap((blend) => Object.keys(blend!))
  );

  const benchmarkStatus = benchmarks.map((bm) => {
    const months    = Object.keys(bm.monthlyReturns ?? {}).sort();
    const lastMonth = months[months.length - 1] ?? null;
    const inWindow  = windowMonths.filter((m) => (bm.monthlyReturns ?? {})[m] != null).length;
    const missing   = windowMonths.filter((m) => (bm.monthlyReturns ?? {})[m] == null);
    return {
      id:         bm.id,
      name:       bm.name,
      isRelevant: relevantBmIds.has(bm.id),
      lastMonth,
      monthCount: months.length,
      inWindow,
      missingFromWindow: missing.length > 0 ? missing : undefined,
      isCeiling:  lastMonth === windowEndInfo.benchmarkCeiling && relevantBmIds.has(bm.id),
    };
  });

  // ── Funds ────────────────────────────────────────────────────────────────────
  const partialFunds: Array<{
    id: string; name: string; category: string; lastMonth: string; missingMonths: string[];
  }> = [];
  let noDataCount = 0;

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

  return NextResponse.json({
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
    window: {
      endMonth:   windowInfo.endMonth,
      startMonth: windowMonths[0],
      months:     windowInfo.months,
      endMonthLabel: windowInfo.endMonthLabel,
    },
    benchmarks: benchmarkStatus,
    funds: {
      total:   totalFunds,
      current: currentFunds,
      partial: partialFunds.length,
      noData:  noDataCount,
    },
    partialFunds,
  });
}
