import { Suspense } from "react";
import { redirect } from "next/navigation";
import { storageRead } from "@/lib/storage";
import { FundsData, Benchmark } from "@/lib/types";
import { BrandConfig, DEFAULT_BRAND } from "@/config/brand";
import {
  getWindowEndMonth,
  buildWindowInfo,
  getBenchmarkForCategory,
  blendBenchmarkReturns,
  computeCategoryStats,
} from "@/lib/consistency";
import Toolbar from "./components/Toolbar";
import BackNav from "./components/BackNav";
import PageWrapper from "./components/PageWrapper";
import PageFooter from "./components/PageFooter";
import IdleView from "./components/IdleView";
import SingleView from "./components/SingleView";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HEBREW_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

export interface LeaderboardEntry {
  rank: number;
  fundId: string;
  fundName: string;
  categoryId: string;
  categoryLabel: string;
  ir: number;
  score: number;
}

export default async function ConsistencyV2Page({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; window?: string; fund?: string; preselect?: string }>;
}) {
  const { client = "green", window: windowParam, fund: fundParam, preselect } = await searchParams;
  const windowSize = [24, 36, 48].includes(Number(windowParam)) ? Number(windowParam) : 24;

  // Guard: redirect non-green clients that haven't enabled consistencyAnalysis
  if (client !== "green") {
    const brand = await storageRead<BrandConfig>(`brand:${client}`, DEFAULT_BRAND);
    if (!brand.features?.consistencyAnalysis) {
      redirect(`/${client}`);
    }
  }

  const [fundsData, benchmarks] = await Promise.all([
    storageRead<FundsData>(`funds:${client}`, { lastUpdated: "", categories: [] }),
    storageRead<Benchmark[]>(`benchmarks:${client}`, []),
  ]);

  const allFunds = fundsData.categories.flatMap((c) => c.funds);
  const windowEndInfo = getWindowEndMonth(allFunds, benchmarks);
  const windowInfo = buildWindowInfo(windowEndInfo.endMonth, windowSize);

  const [y, m] = windowInfo.endMonth ? windowInfo.endMonth.split("-").map(Number) : [0, 0];
  const dateLabel = y ? `${HEBREW_MONTHS[m - 1]} ${y} · דוח עקביות` : "דוח עקביות";

  const idlePath = "/consistency/v2";

  // Single fund view
  if (fundParam) {
    let fundName: string | undefined;
    for (const cat of fundsData.categories) {
      const f = cat.funds.find(f => f.id === fundParam);
      if (f) { fundName = f.name; break; }
    }

    return (
      <>
        <Suspense fallback={<div className="v2-toolbar" />}>
          <Toolbar fundId={fundParam} fundName={fundName} client={client} />
        </Suspense>
        <BackNav client={client} />
        <PageWrapper dateLabel={dateLabel} idlePath={idlePath} client={client}>
          <SingleView fundId={fundParam} client={client} />
          <PageFooter disclaimer="המידע מובא לצורך ניתוח בלבד ואינו מהווה ייעוץ השקעות, המלצה או חוות דעת." />
        </PageWrapper>
      </>
    );
  }

  // Leaderboard (idle view)
  const allStats: Omit<LeaderboardEntry, "rank">[] = [];
  for (const cat of fundsData.categories) {
    const blend = getBenchmarkForCategory(cat.id);
    if (!blend) continue;
    const bmAll = blendBenchmarkReturns(blend, benchmarks);
    const bmWindow: Record<string, number> = {};
    for (const mo of windowInfo.windowMonths) {
      if (bmAll[mo] != null) bmWindow[mo] = bmAll[mo];
    }
    const stats = computeCategoryStats(cat.id, cat.name, cat.funds, bmWindow, windowInfo.windowMonths);
    for (const f of stats.funds) {
      allStats.push({ fundId: f.fundId, fundName: f.fundName, categoryId: cat.id, categoryLabel: cat.name, ir: f.ir, score: f.score });
    }
  }

  allStats.sort((a, b) => b.ir - a.ir);
  const top5: LeaderboardEntry[] = allStats.slice(0, 5).map((f, i) => ({ ...f, rank: i + 1 }));
  const totalFunds = allStats.length;

  return (
    <>
      <BackNav client={client} />
      <PageWrapper dateLabel={dateLabel} idlePath={idlePath} client={client}>
        <IdleView top5={top5} totalFunds={totalFunds} windowSize={windowSize} searchPool={allStats} preselectId={preselect} client={client} />
        <PageFooter />
      </PageWrapper>
    </>
  );
}
