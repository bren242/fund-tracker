"use client";

import { Fund } from "@/lib/types";
import { getAvgAnnualReturn } from "@/lib/fundDerived";

interface CompareSummaryProps {
  funds: Fund[];
  accentColor: string;
  compact?: boolean;
  selectedYears?: string[];
}

type MetricDef = {
  label: string;
  getValue: (f: Fund) => number | null;
  lowerIsBetter?: boolean;
  yearKey?: string;
};

const METRICS: MetricDef[] = [
  { label: "תשואה חודשית", getValue: (f) => f.monthlyReturn },
  { label: "מצטבר 2026", getValue: (f) => f.returns.ytd2026, yearKey: "ytd2026" },
  { label: "2025", getValue: (f) => f.returns.y2025, yearKey: "y2025" },
  { label: "2024", getValue: (f) => f.returns.y2024, yearKey: "y2024" },
  { label: "2023", getValue: (f) => f.returns.y2023, yearKey: "y2023" },
  { label: "2022", getValue: (f) => f.returns.y2022, yearKey: "y2022" },
  { label: "2021", getValue: (f) => f.returns.y2021, yearKey: "y2021" },
  { label: "2020", getValue: (f) => f.returns.y2020, yearKey: "y2020" },
  { label: "2019", getValue: (f) => f.returns.y2019, yearKey: "y2019" },
  { label: "תשואה ממוצעת שנתית", getValue: (f) => getAvgAnnualReturn(f) },
  { label: "שארפ", getValue: (f) => f.sharpe },
  { label: "סטיית תקן", getValue: (f) => f.stdDev, lowerIsBetter: true },
];

function computeWinner(funds: Fund[], selectedYears?: string[]): { fund: Fund; wins: number; total: number } | null {
  if (funds.length < 2) return null;

  const visibleMetrics = selectedYears && selectedYears.length > 0
    ? METRICS.filter((m) => !m.yearKey || selectedYears.includes(m.yearKey))
    : METRICS;

  const scores = new Map<string, number>();
  funds.forEach((f) => scores.set(f.id, 0));

  let total = 0;
  for (const metric of visibleMetrics) {
    let bestIdx = -1;
    let bestVal = metric.lowerIsBetter ? Infinity : -Infinity;
    let hasAny = false;

    for (let i = 0; i < funds.length; i++) {
      const v = metric.getValue(funds[i]);
      if (v === null) continue;
      hasAny = true;
      const compare = metric.lowerIsBetter ? -v : v;
      if (compare > (metric.lowerIsBetter ? -bestVal : bestVal)) {
        bestVal = v;
        bestIdx = i;
      }
    }
    if (hasAny && bestIdx >= 0) {
      total++;
      scores.set(funds[bestIdx].id, (scores.get(funds[bestIdx].id) || 0) + 1);
    }
  }

  let winnerId = funds[0].id;
  let maxScore = 0;
  scores.forEach((score, id) => {
    if (score > maxScore) {
      maxScore = score;
      winnerId = id;
    }
  });

  const winner = funds.find((f) => f.id === winnerId)!;
  return { fund: winner, wins: maxScore, total };
}

export default function CompareSummary({ funds, accentColor, compact, selectedYears }: CompareSummaryProps) {
  const result = computeWinner(funds, selectedYears);
  if (!result) return null;

  /* Compact version for print — slim premium strip */
  if (compact) {
    return (
      <div style={{
        backgroundColor: `${accentColor}08`, borderRight: `3px solid ${accentColor}`,
        padding: "7px 12px", marginBottom: 10,
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        pageBreakInside: "avoid", breakInside: "avoid",
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: "8pt", color: "#8893a4" }}>הקרן המובילה:</span>
          <span style={{ fontSize: "10pt", fontWeight: 700, color: accentColor }}>{result.fund.name}</span>
          <span style={{ fontSize: "7.5pt", color: "#5a6577" }}>
            — מובילה ב-{result.wins} מתוך {result.total} מדדים · לפי התקופה הנבחרת
            {result.fund.classification && ` · ${result.fund.classification}`}
          </span>
        </div>
        <span style={{ fontSize: "6.5pt", color: "#8893a4" }}>★ = מוביל בקטגוריה</span>
      </div>
    );
  }

  /* Full screen version */
  return (
    <div style={{
      backgroundColor: "white", border: `2px solid ${accentColor}`,
      borderRadius: 12, padding: "20px 28px", marginBottom: 24,
      display: "flex", alignItems: "center", gap: 20,
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: "50%",
        backgroundColor: accentColor, color: "white",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 22, fontWeight: 700, flexShrink: 0,
      }}>
        {result.wins}
      </div>
      <div>
        <div style={{ fontSize: 11, color: "#8893a4", fontWeight: 500, marginBottom: 2 }}>
          הקרן המובילה בהשוואה
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1f2b" }}>
          {result.fund.name}
        </div>
        <div style={{ fontSize: 12, color: "#5a6577", marginTop: 2 }}>
          מובילה ב-{result.wins} מתוך {result.total} מדדים · לפי התקופה הנבחרת
          {result.fund.classification && <span> · {result.fund.classification}</span>}
        </div>
      </div>
    </div>
  );
}
