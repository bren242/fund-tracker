"use client";

import { useEffect, useState } from "react";
import Hero from "./Hero";
import StoryProse from "./StoryProse";
import WorstMonth from "./WorstMonth";
import PerformanceChart from "./PerformanceChart";
import CategoryDotPlot from "./CategoryDotPlot";
import NumbersTable from "./NumbersTable";

// Derive a verdict label from numbers when AI is unavailable
function deriveVerdict(score: number | null, ir: number | null): string {
  const s = score ?? 0;
  const i = ir ?? null;
  if (s >= 75 && (i ?? 0) > 0.5) return "קרן עקבית מאוד";
  if (s >= 60 && (i ?? 0) > 0) return "קרן עקבית";
  if (s >= 45 || (i != null && i >= -0.2 && i <= 0)) return "עקביות בינונית";
  return "קרן לא עקבית";
}

// Highlights standalone numbers in a string with <span class="num">
const NUM_RE = /(?<![^\s,.(;\-״"(])(-?\d+(?:\.\d+)?(?:%|(?=[\s,.;:)—״"\n]|$)))/gu;
function HighlightedLine({ text }: { text: string }) {
  const parts = text.split(NUM_RE);
  return (
    <>
      {parts.map((p, i) =>
        /^-?\d+(?:\.\d+)?%?$/.test(p)
          ? <span key={i} className="num">{p}</span>
          : p
      )}
    </>
  );
}

interface WindowData {
  endMonth: string;
  endMonthLabel: string;
  months: number;
  windowMonths: string[];
}
interface FundData {
  id: string;
  name: string;
  category: { id: string; name: string };
}
interface ConsResult { score: number; wins: number; total: number; avgGap: number; ir: number | null }
interface CatResult  { score: number; wins: number; total: number }
interface WM {
  monthKey: string; monthLabelHebrew: string;
  fundReturn: number; benchmarkReturn: number;
  categoryAverageReturn: number | null; fundVsBenchmark: number;
}
interface BestMonth { monthKey: string; monthLabelHebrew: string; shortLabel: string; excessReturn: number }
interface ChartPoint { month: string; shortLabel: string; excessReturn: number }
interface CatFundStat { fundId: string; fundName: string; ir: number; score: number }
interface CatStats { categoryKey: string; categoryLabel: string; fundCount: number; averageIR: number; funds: CatFundStat[] }
interface AI {
  verdictLabel: string;
  storyParagraphs: string[];
  worstMonthNarrative: string;
  categoryContextNarrative: string;
}

interface FundViewData {
  window: WindowData;
  fund: FundData;
  benchmarkShortName: string;
  ir: number | null;
  consistencyVsBenchmark: ConsResult | null;
  consistencyVsCategory: CatResult | null;
  worstMonth: WM | null;
  bestMonth: BestMonth | null;
  chartData: ChartPoint[];
  categoryStats: CatStats | null;
  worstMonthCohortPosition: { rank: number; total: number; percentile: number } | null;
  globalRank: number | null;
  totalInSystem: number;
  ai: AI | null;
  error?: string;
}

interface SingleViewProps {
  fundId: string;
  windowSize: number;
  client: string;
}

export default function SingleView({ fundId, windowSize, client }: SingleViewProps) {
  const [data, setData] = useState<FundViewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/consistency/v2/fund/${fundId}?window=${windowSize}&client=${client}`)
      .then(r => r.json())
      .then((d: FundViewData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [fundId, windowSize, client]);

  if (loading) return <div className="v2-loading">טוען...</div>;
  if (!data || data.error) return <div className="v2-loading">לא נמצאו נתונים</div>;

  const {
    window: win, fund, benchmarkShortName, ir,
    consistencyVsBenchmark: vsB, consistencyVsCategory: vsC,
    worstMonth, chartData, categoryStats,
    globalRank, totalInSystem, ai,
  } = data;

  const categoryRank = categoryStats
    ? (categoryStats.funds.findIndex(f => f.fundId === fund.id) + 1) || null
    : null;

  // Always show a verdict — use AI label or derive from numbers
  const verdictLabel = ai?.verdictLabel || deriveVerdict(vsB?.score ?? null, ir);

  return (
    <>
      <Hero
        fundName={fund.name}
        verdictLabel={verdictLabel}
        windowSize={win.months}
        categoryName={fund.category.name}
        benchmarkShortName={benchmarkShortName}
      />

      {/* הסיפור */}
      {(ai?.storyParagraphs?.length ?? 0) > 0 && (
        <div className="v2-section">
          <div className="v2-section-label">הסיפור</div>
          <StoryProse paragraphs={ai!.storyParagraphs} />
        </div>
      )}

      {/* החודש הקשה */}
      {worstMonth && (
        <div className="v2-section">
          <div className="v2-section-label">החודש הקשה</div>
          <WorstMonth
            monthLabel={worstMonth.monthLabelHebrew}
            fundName={fund.name}
            fundReturn={worstMonth.fundReturn}
            categoryAvg={worstMonth.categoryAverageReturn}
            benchmarkReturn={worstMonth.benchmarkReturn}
            benchmarkName={benchmarkShortName}
            narrative={ai?.worstMonthNarrative ?? ""}
          />
        </div>
      )}

      {/* ביצועים מול בנצ׳מרק */}
      {chartData.length > 0 && (
        <div className="v2-section">
          <div className="v2-section-label">ביצועים מול בנצ׳מרק</div>
          <PerformanceChart
            chartData={chartData}
            benchmarkName={benchmarkShortName}
          />
        </div>
      )}

      {/* ביחס לקטגוריה */}
      {categoryStats && (
        <div className="v2-section">
          <div className="v2-section-label">ביחס לקטגוריה</div>
          {ai?.categoryContextNarrative && (
            <div className="v2-category-lead-line">
              <HighlightedLine text={ai.categoryContextNarrative} />
            </div>
          )}
          <CategoryDotPlot
            funds={categoryStats.funds.map(f => ({ fundId: f.fundId, ir: f.ir }))}
            thisFundId={fund.id}
            fundName={fund.name}
            avgIR={categoryStats.averageIR}
            categoryName={fund.category.name}
            fundCount={categoryStats.fundCount}
          />
          {categoryRank && (
            <div className="v2-category-rank">
              <div className="v2-rank-label">דירוג בקטגוריית {fund.category.name}</div>
              <div className="v2-rank-value">
                #{categoryRank}<span className="small">/{categoryStats.fundCount}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* המספרים */}
      <div className="v2-section">
        <div className="v2-section-label">המספרים</div>
        <NumbersTable
          ir={ir}
          benchmarkName={benchmarkShortName}
          benchmarkWins={vsB?.wins ?? null}
          benchmarkTotal={vsB?.total ?? null}
          categoryWins={vsC?.wins ?? null}
          categoryTotal={vsC?.total ?? null}
          worstMonthGap={worstMonth?.fundVsBenchmark ?? null}
          categoryName={fund.category.name}
          categoryRank={categoryRank}
          categoryFundCount={categoryStats?.fundCount ?? null}
          globalRank={globalRank}
          totalInSystem={totalInSystem}
        />
      </div>
    </>
  );
}
