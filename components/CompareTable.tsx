"use client";

import { Fund, Benchmark } from "@/lib/types";
import { pct, num } from "@/lib/format";

interface CompareTableProps {
  funds: Fund[];
  accentColor: string;
  compact?: boolean;
  selectedYears?: string[];
  benchmarks?: Benchmark[];
}

function returnColor(v: number | null): string {
  if (v === null) return "#1a1f2b";
  if (v > 0) return "#0d7c4a";
  if (v < 0) return "#c42b2b";
  return "#1a1f2b";
}

type MetricRow = {
  label: string;
  getValue: (f: Fund) => string;
  getBmValue?: (b: Benchmark) => string;
  getRaw?: (f: Fund) => number | null;
  getBmRaw?: (b: Benchmark) => number | null;
  getColor?: (f: Fund) => string;
  getBmColor?: (b: Benchmark) => string;
  lowerIsBetter?: boolean;
  isInfo?: boolean;
  yearKey?: string;
  hideBenchmark?: boolean;
  bmStatKey?: "avg" | "std" | "sharpe";
};

function bmPct(v: number | null): string {
  if (v === null) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

/** Compute avg, stdDev, sharpe for a benchmark from its visible annual returns */
function computeBmStats(b: Benchmark, visibleYearKeys: string[]) {
  const yearKeys = visibleYearKeys.filter((k) => k !== "ytd2026" && k.startsWith("y"));
  const vals: number[] = [];
  for (const k of yearKeys) {
    const v = b.returns[k as keyof typeof b.returns];
    if (v !== null && v !== undefined) vals.push(v);
  }
  if (vals.length === 0) return { avg: null as number | null, std: null as number | null, sharpe: null as number | null };
  const avg = vals.reduce((a, x) => a + x, 0) / vals.length;
  const variance = vals.reduce((sum, v) => sum + (v - avg) ** 2, 0) / vals.length;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? avg / std : null;
  return { avg, std, sharpe };
}

/** Get latest monthly return for a benchmark */
function getBmMonthlyReturn(b: Benchmark): number | null {
  const mr = b.monthlyReturns;
  if (!mr) return null;
  const keys = Object.keys(mr).sort();
  if (keys.length === 0) return null;
  return mr[keys[keys.length - 1]] ?? null;
}

const METRICS: MetricRow[] = [
  { label: "סיווג", getValue: (f) => f.classification || "—", isInfo: true, hideBenchmark: true },
  { label: "מנהל", getValue: (f) => f.manager || "—", isInfo: true, hideBenchmark: true },
  {
    label: "תשואה חודשית", getValue: (f) => pct(f.monthlyReturn),
    getRaw: (f) => f.monthlyReturn, getColor: (f) => returnColor(f.monthlyReturn),
    getBmValue: (b) => bmPct(getBmMonthlyReturn(b)),
    getBmRaw: (b) => getBmMonthlyReturn(b), getBmColor: (b) => returnColor(getBmMonthlyReturn(b)),
  },
  {
    label: "מצטבר 2026", getValue: (f) => pct(f.returns.ytd2026),
    getRaw: (f) => f.returns.ytd2026, getColor: (f) => returnColor(f.returns.ytd2026),
    getBmValue: (b) => bmPct(b.returns.ytd2026),
    getBmRaw: (b) => b.returns.ytd2026, getBmColor: (b) => returnColor(b.returns.ytd2026),
    yearKey: "ytd2026",
  },
  {
    label: "2025", getValue: (f) => pct(f.returns.y2025),
    getRaw: (f) => f.returns.y2025, getColor: (f) => returnColor(f.returns.y2025),
    getBmValue: (b) => bmPct(b.returns.y2025),
    getBmRaw: (b) => b.returns.y2025, getBmColor: (b) => returnColor(b.returns.y2025),
    yearKey: "y2025",
  },
  {
    label: "2024", getValue: (f) => pct(f.returns.y2024),
    getRaw: (f) => f.returns.y2024, getColor: (f) => returnColor(f.returns.y2024),
    getBmValue: (b) => bmPct(b.returns.y2024),
    getBmRaw: (b) => b.returns.y2024, getBmColor: (b) => returnColor(b.returns.y2024),
    yearKey: "y2024",
  },
  {
    label: "2023", getValue: (f) => pct(f.returns.y2023),
    getRaw: (f) => f.returns.y2023, getColor: (f) => returnColor(f.returns.y2023),
    getBmValue: (b) => bmPct(b.returns.y2023),
    getBmRaw: (b) => b.returns.y2023, getBmColor: (b) => returnColor(b.returns.y2023),
    yearKey: "y2023",
  },
  {
    label: "2022", getValue: (f) => pct(f.returns.y2022),
    getRaw: (f) => f.returns.y2022, getColor: (f) => returnColor(f.returns.y2022),
    getBmValue: (b) => bmPct(b.returns.y2022),
    getBmRaw: (b) => b.returns.y2022, getBmColor: (b) => returnColor(b.returns.y2022),
    yearKey: "y2022",
  },
  {
    label: "2021", getValue: (f) => pct(f.returns.y2021),
    getRaw: (f) => f.returns.y2021, getColor: (f) => returnColor(f.returns.y2021),
    getBmValue: (b) => bmPct(b.returns.y2021),
    getBmRaw: (b) => b.returns.y2021, getBmColor: (b) => returnColor(b.returns.y2021),
    yearKey: "y2021",
  },
  {
    label: "2020", getValue: (f) => pct(f.returns.y2020),
    getRaw: (f) => f.returns.y2020, getColor: (f) => returnColor(f.returns.y2020),
    getBmValue: (b) => bmPct(b.returns.y2020),
    getBmRaw: (b) => b.returns.y2020, getBmColor: (b) => returnColor(b.returns.y2020),
    yearKey: "y2020",
  },
  {
    label: "2019", getValue: (f) => pct(f.returns.y2019),
    getRaw: (f) => f.returns.y2019, getColor: (f) => returnColor(f.returns.y2019),
    getBmValue: (b) => bmPct(b.returns.y2019),
    getBmRaw: (b) => b.returns.y2019, getBmColor: (b) => returnColor(b.returns.y2019),
    yearKey: "y2019",
  },
  { label: "ממוצע שנתי", getValue: (f) => pct(f.avgAnnualReturn), getRaw: (f) => f.avgAnnualReturn, getColor: (f) => returnColor(f.avgAnnualReturn), bmStatKey: "avg" as const },
  { label: "שארפ", getValue: (f) => num(f.sharpe), getRaw: (f) => f.sharpe, bmStatKey: "sharpe" as const },
  { label: "סטיית תקן", getValue: (f) => pct(f.stdDev), getRaw: (f) => f.stdDev, getColor: (f) => returnColor(f.stdDev), lowerIsBetter: true, bmStatKey: "std" as const },
  { label: "AUM (מ׳ ₪)", getValue: (f) => f.aumMillions != null ? f.aumMillions.toLocaleString() : "—", isInfo: true, hideBenchmark: true },
];

function getBestIdx(funds: Fund[], metric: MetricRow): number | null {
  if (metric.isInfo || !metric.getRaw) return null;

  let bestIdx: number | null = null;
  let bestVal = metric.lowerIsBetter ? Infinity : -Infinity;

  for (let i = 0; i < funds.length; i++) {
    const v = metric.getRaw(funds[i]);
    if (v === null) continue;
    if (metric.lowerIsBetter ? v < bestVal : v > bestVal) {
      bestVal = v;
      bestIdx = i;
    }
  }

  return bestIdx;
}

const BM_HEADER_COLOR = "#6366f1";

export default function CompareTable({ funds, accentColor, compact, selectedYears, benchmarks = [] }: CompareTableProps) {
  if (funds.length < 2) return null;

  const hasBm = benchmarks.length > 0;
  const totalCols = funds.length + benchmarks.length;

  // Filter metrics based on selected years
  const visibleMetrics = selectedYears && selectedYears.length > 0
    ? METRICS.filter((m) => !m.yearKey || selectedYears.includes(m.yearKey))
    : METRICS;

  // Compute benchmark stats based on visible year keys
  const visibleYearKeys = visibleMetrics.filter((m) => m.yearKey).map((m) => m.yearKey!);
  const bmStatsMap = new Map<string, ReturnType<typeof computeBmStats>>();
  benchmarks.forEach((bm) => {
    bmStatsMap.set(bm.id, computeBmStats(bm, visibleYearKeys));
  });

  // Dynamic sizing based on column count
  const isWide = totalCols >= 5;
  const fs = compact
    ? { th: isWide ? 7 : 8, thName: isWide ? 7.5 : 9, td: isWide ? 7 : 8, label: isWide ? 7 : 8, star: 8, legend: 0, padH: isWide ? "4px 5px" : "5px 8px", padD: isWide ? "3px 4px" : "4px 8px", lower: 6, minCol: isWide ? 55 : 80, minLabel: isWide ? 50 : 70 }
    : { th: isWide ? 10 : 11, thName: isWide ? 11 : 13, td: isWide ? 11 : 12, label: isWide ? 11 : 12, star: 9, legend: 10, padH: isWide ? "8px 8px" : "10px 14px", padD: isWide ? "6px 6px" : "8px 12px", lower: 9, minCol: isWide ? 80 : 130, minLabel: isWide ? 80 : 110 };

  return (
    <div style={{ overflowX: "auto", marginBottom: compact ? 10 : 24, ...(compact ? { pageBreakInside: "avoid", breakInside: "avoid" } as React.CSSProperties : {}) }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: fs.td }}>
        <thead>
          <tr>
            <th style={{
              padding: fs.padH, textAlign: "right", fontWeight: 600,
              color: "#8893a4", fontSize: fs.th, borderBottom: "2px solid #dfe3e8",
              minWidth: fs.minLabel, backgroundColor: "white",
            }}>
              מדד
            </th>
            {funds.map((f, i) => (
              <th key={f.id} style={{
                padding: fs.padH, textAlign: "center", fontWeight: 700,
                color: "white", fontSize: fs.thName,
                borderBottom: "2px solid #dfe3e8",
                backgroundColor: accentColor,
                minWidth: fs.minCol,
                borderRadius: !compact && !hasBm ? (i === 0 ? "8px 0 0 0" : i === funds.length - 1 ? "0 8px 0 0" : 0) : (i === 0 ? "8px 0 0 0" : 0),
              }}>
                {f.name}
              </th>
            ))}
            {benchmarks.map((bm, i) => (
              <th key={bm.id} style={{
                padding: fs.padH, textAlign: "center", fontWeight: 700,
                color: "white", fontSize: fs.thName,
                borderBottom: "2px solid #dfe3e8",
                backgroundColor: BM_HEADER_COLOR,
                minWidth: fs.minCol,
                borderRadius: !compact && i === benchmarks.length - 1 ? "0 8px 0 0" : 0,
                borderRight: i === 0 ? "2px solid #e8eaed" : undefined,
              }}>
                {bm.currency === "USD" ? "$" : "₪"} {bm.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleMetrics.map((metric, rowIdx) => {
            const bestIdx = getBestIdx(funds, metric);
            const bg = rowIdx % 2 === 0 ? "#ffffff" : "#f8f9fb";

            return (
              <tr key={metric.label} style={{ backgroundColor: bg }}>
                <td style={{
                  padding: fs.padD, textAlign: "right", fontWeight: 500,
                  color: "#5a6577", fontSize: fs.label,
                  borderBottom: "1px solid #e8eaed",
                  whiteSpace: "nowrap", backgroundColor: bg,
                }}>
                  {metric.label}
                  {metric.lowerIsBetter && <span style={{ fontSize: fs.lower, color: "#8893a4", marginRight: 4 }}>(נמוך=טוב)</span>}
                </td>
                {funds.map((f, colIdx) => {
                  const val = metric.getValue(f);
                  const color = metric.getColor?.(f) || "#1a1f2b";
                  const isBest = bestIdx === colIdx;

                  return (
                    <td key={f.id} style={{
                      padding: fs.padD, textAlign: "center",
                      color: isBest ? accentColor : color,
                      fontWeight: isBest ? 700 : 400,
                      borderBottom: "1px solid #e8eaed",
                      fontVariantNumeric: "tabular-nums",
                      backgroundColor: isBest ? `${accentColor}0D` : "transparent",
                    }}>
                      {val}
                      {isBest && <span style={{ marginRight: 3, fontSize: fs.star }}> ★</span>}
                    </td>
                  );
                })}
                {benchmarks.map((bm, i) => {
                  if (metric.hideBenchmark) {
                    return (
                      <td key={bm.id} style={{
                        padding: fs.padD, textAlign: "center",
                        color: "#a0a8b8", fontSize: fs.td,
                        borderBottom: "1px solid #e8eaed",
                        borderRight: i === 0 ? "2px solid #e8eaed" : undefined,
                        backgroundColor: `${BM_HEADER_COLOR}05`,
                      }}>
                        —
                      </td>
                    );
                  }
                  // Handle computed stats (avg, sharpe, stddev)
                  let val: string;
                  let color: string;
                  if (metric.bmStatKey) {
                    const stats = bmStatsMap.get(bm.id);
                    const v = stats?.[metric.bmStatKey] ?? null;
                    if (metric.bmStatKey === "sharpe") {
                      val = v !== null ? v.toFixed(2) : "—";
                    } else {
                      val = v !== null ? pct(v) : "—";
                    }
                    color = returnColor(v);
                  } else {
                    val = metric.getBmValue?.(bm) || "—";
                    color = metric.getBmColor?.(bm) || "#1a1f2b";
                  }
                  return (
                    <td key={bm.id} style={{
                      padding: fs.padD, textAlign: "center",
                      color, fontWeight: 400,
                      borderBottom: "1px solid #e8eaed",
                      fontVariantNumeric: "tabular-nums",
                      borderRight: i === 0 ? "2px solid #e8eaed" : undefined,
                      backgroundColor: `${BM_HEADER_COLOR}05`,
                    }}>
                      {val}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!compact && (
        <div style={{ marginTop: 8, fontSize: fs.legend, color: "#8893a4", display: "flex", alignItems: "center", gap: 8 }}>
          <span><span style={{ color: accentColor }}>★</span> ערך מוביל בקטגוריה</span>
          {hasBm && <span style={{ color: BM_HEADER_COLOR }}>■</span>}
          {hasBm && <span>מדד ייחוס</span>}
        </div>
      )}
    </div>
  );
}
