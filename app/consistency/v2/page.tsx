import { Suspense } from "react";
import { storageRead } from "@/lib/storage";
import { FundsData, Benchmark } from "@/lib/types";
import {
  getWindowEndMonth,
  buildWindowInfo,
  getBenchmarkForCategory,
  blendBenchmarkReturns,
  computeCategoryStats,
} from "@/lib/consistency";
import Toolbar from "./components/Toolbar";
import PageWrapper from "./components/PageWrapper";
import PageFooter from "./components/PageFooter";
import IdleView from "./components/IdleView";

export const dynamic = "force-dynamic";

const HEBREW_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

export interface LeaderboardEntry {
  rank: number;
  fundId: string;
  fundName: string;
  categoryLabel: string;
  ir: number;
  score: number;
}

export default async function ConsistencyV2Page({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; window?: string }>;
}) {
  const { client = "green", window: windowParam } = await searchParams;
  const windowSize = [24, 36, 48].includes(Number(windowParam)) ? Number(windowParam) : 24;

  const [fundsData, benchmarks] = await Promise.all([
    storageRead<FundsData>(`funds:${client}`, { lastUpdated: "", categories: [] }),
    storageRead<Benchmark[]>(`benchmarks:${client}`, []),
  ]);

  const allFunds = fundsData.categories.flatMap((c) => c.funds);
  const windowEndInfo = getWindowEndMonth(allFunds, benchmarks);
  const windowInfo = buildWindowInfo(windowEndInfo.endMonth, windowSize);

  // Global leaderboard: compute IR+score for all funds across categories, sort by IR
  const allStats: Omit<LeaderboardEntry, "rank">[] = [];
  for (const cat of fundsData.categories) {
    const blend = getBenchmarkForCategory(cat.id);
    if (!blend) continue;
    const bmAll = blendBenchmarkReturns(blend, benchmarks);
    const bmWindow: Record<string, number> = {};
    for (const m of windowInfo.windowMonths) {
      if (bmAll[m] != null) bmWindow[m] = bmAll[m];
    }
    const stats = computeCategoryStats(cat.id, cat.name, cat.funds, bmWindow, windowInfo.windowMonths);
    for (const f of stats.funds) {
      allStats.push({ fundId: f.fundId, fundName: f.fundName, categoryLabel: cat.name, ir: f.ir, score: f.score });
    }
  }

  allStats.sort((a, b) => b.ir - a.ir);
  const top5: LeaderboardEntry[] = allStats.slice(0, 5).map((f, i) => ({ ...f, rank: i + 1 }));
  const totalFunds = allStats.length;

  // Masthead date label
  const [y, m] = windowInfo.endMonth ? windowInfo.endMonth.split("-").map(Number) : [0, 0];
  const dateLabel = y ? `${HEBREW_MONTHS[m - 1]} ${y} · דוח עקביות` : "דוח עקביות";

  return (
    <>
      <Suspense fallback={<div className="v2-toolbar" />}>
        <Toolbar windowSize={windowSize} />
      </Suspense>
      <PageWrapper dateLabel={dateLabel}>
        <IdleView top5={top5} totalFunds={totalFunds} windowSize={windowSize} />
        <PageFooter />
      </PageWrapper>
    </>
  );
}
