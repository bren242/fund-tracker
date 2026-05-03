export const dynamic = "force-dynamic";

/**
 * GET /api/consistency/v2/leaderboard?client=green&window=24&limit=10
 *
 * Returns IR-ranked funds grouped by category.
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
  computeCategoryStats,
} from "@/lib/consistency";

const VALID_WINDOWS = new Set([24, 36, 48]);

export async function GET(req: NextRequest) {
  const sp         = req.nextUrl.searchParams;
  const client     = sp.get("client") ?? "green";
  const windowSize = VALID_WINDOWS.has(Number(sp.get("window")))
    ? Number(sp.get("window")) : 24;
  const limit      = Math.min(Math.max(parseInt(sp.get("limit") ?? "10", 10), 1), 100);

  const [fundsData, benchmarks] = await Promise.all([
    storageRead<FundsData>(`funds:${client}`, { lastUpdated: "", categories: [] }),
    storageRead<Benchmark[]>(`benchmarks:${client}`, []),
  ]);

  const allFunds   = fundsData.categories.flatMap((c) => c.funds);
  const windowEndInfo = getWindowEndMonth(allFunds, benchmarks);
  const windowInfo    = buildWindowInfo(windowEndInfo.endMonth, windowSize);
  const { windowMonths } = windowInfo;

  let totalFundsWithIR = 0;

  const categories = fundsData.categories
    .map((cat) => {
      const blend = getBenchmarkForCategory(cat.id);
      if (!blend) return null;

      const bmAll    = blendBenchmarkReturns(blend, benchmarks);
      const bmWindow: Record<string, number> = {};
      for (const m of windowMonths) { if (bmAll[m] != null) bmWindow[m] = bmAll[m]; }

      const stats = computeCategoryStats(cat.id, cat.name, cat.funds, bmWindow, windowMonths);
      if (stats.fundCount === 0) return null;

      totalFundsWithIR += stats.fundCount;

      const rankedFunds = stats.funds
        .slice(0, limit)
        .map((f, i) => ({ rank: i + 1, fundId: f.fundId, fundName: f.fundName, ir: f.ir, score: f.score }));

      return {
        categoryKey:   stats.categoryKey,
        categoryLabel: stats.categoryLabel,
        fundCount:     stats.fundCount,
        averageIR:     stats.averageIR,
        funds:         rankedFunds,
      };
    })
    .filter(Boolean);

  return NextResponse.json({
    window:            windowInfo,
    totalFundsWithIR,
    totalFundsPartial: windowEndInfo.partialFundIds.length,
    categories,
  });
}
