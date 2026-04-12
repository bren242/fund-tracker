"use client";

import { Fund, Benchmark } from "@/lib/types";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

interface CompareChartsProps {
  funds: Fund[];
  accentColor: string;
  compact?: boolean;
  benchmarks?: Benchmark[];
  from?: string;
  to?: string;
}

const PALETTE = ["#1B3A2F", "#B8975A", "#2563eb", "#9333ea"];
const BM_PALETTE = ["#0891b2", "#f59e0b"];
const MONTH_SHORT = ["ינ", "פב", "מר", "אפ", "מא", "יו", "יל", "אג", "ספ", "אק", "נו", "דצ"];

type YearEntry = { key: keyof Fund["returns"]; label: string; year: number };

const YEAR_ENTRIES: YearEntry[] = [
  { key: "y2019", label: "2019", year: 2019 },
  { key: "y2020", label: "2020", year: 2020 },
  { key: "y2021", label: "2021", year: 2021 },
  { key: "y2022", label: "2022", year: 2022 },
  { key: "y2023", label: "2023", year: 2023 },
  { key: "y2024", label: "2024", year: 2024 },
  { key: "y2025", label: "2025", year: 2025 },
  { key: "ytd2026", label: "2026", year: 2026 },
];

function getAllMonths(from: string, to: string): string[] {
  const months: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return months;
}

function formatXLabel(label: string): string {
  if (label.includes("-")) {
    const [year, month] = label.split("-");
    return `${MONTH_SHORT[parseInt(month) - 1]}'${year.slice(2)}`;
  }
  return label;
}

function buildLineData(funds: Fund[], benchmarks: Benchmark[], from: string, to: string) {
  const hasMonthly = funds.some(
    (f) => f.monthlyReturns && Object.keys(f.monthlyReturns).length > 0,
  );

  if (hasMonthly) {
    const allMonths = getAllMonths(from, to);
    // For ranges > 24 months — use every other month to reduce density
    const months = allMonths.length > 24
      ? allMonths.filter((_, i) => i % 2 === 0)
      : allMonths;
    const nowYear = String(new Date().getFullYear());

    return months.map((ym) => {
      const entry: Record<string, string | number | null> = { year: ym };
      const yearStr = ym.slice(0, 4);
      const annualKey = (yearStr === nowYear
        ? `ytd${yearStr}` : `y${yearStr}`) as keyof Fund["returns"];

      funds.forEach((f) => {
        let v: number | null = null;
        if (f.monthlyReturns && Object.keys(f.monthlyReturns).length > 0) {
          v = f.monthlyReturns[ym] ?? null;
        } else {
          // אין נתונים חודשיים — מחלק שנתי ב-12 כהערכה
          const annual = f.returns[annualKey];
          v = annual != null ? annual / 12 : null;
        }
        entry[`fund_${f.id}`] = v !== null ? Math.round(v * 10000) / 100 : null;
      });

      benchmarks.forEach((bm) => {
        const v = (bm.monthlyReturns ?? {})[ym] ?? null;
        entry[`bm_${bm.id}`] = v !== null ? Math.round(v * 10000) / 100 : null;
      });
      return entry;
    });
  }

  // Fallback שנתי
  const fromYear = parseInt(from.slice(0, 4));
  const toYear   = parseInt(to.slice(0, 4));
  return YEAR_ENTRIES
    .filter((ye) => ye.year >= fromYear && ye.year <= toYear)
    .map((ye) => {
      const entry: Record<string, string | number | null> = { year: ye.label };
      funds.forEach((f) => {
        const v = f.returns[ye.key];
        entry[`fund_${f.id}`] = v != null ? Math.round(v * 10000) / 100 : null;
      });
      benchmarks.forEach((bm) => {
        const v = bm.returns[ye.key];
        entry[`bm_${bm.id}`] = v != null ? Math.round(v * 10000) / 100 : null;
      });
      return entry;
    });
}

export default function CompareCharts({
  funds, accentColor, compact, benchmarks = [], from, to,
}: CompareChartsProps) {
  if (funds.length < 2) return null;

  const today = new Date();
  const defaultTo     = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const effectiveFrom = from ?? "2019-01";
  const effectiveTo   = to   ?? defaultTo;

  const lineData   = buildLineData(funds, benchmarks, effectiveFrom, effectiveTo);
  const fundColors = funds.map((_, i) => PALETTE[i % PALETTE.length]);
  fundColors[0]    = accentColor;
  const bmColors   = benchmarks.map((_, i) => BM_PALETTE[i % BM_PALETTE.length]);

  const xInterval = Math.max(0, Math.ceil(lineData.length / 8) - 1);
  const showDots  = lineData.length <= 12;

  // קרן ללא נתונים חודשיים — תציג בקו מקווקו
  const fundIsEstimated = funds.map(
    (f) => !(f.monthlyReturns && Object.keys(f.monthlyReturns).length > 0)
  );

  /* ── Print / compact ── */
  if (compact) {
    return (
      <div style={{ pageBreakInside: "avoid", breakInside: "avoid" }}>
        <div style={{ margin: "0 auto", width: "fit-content" }}>
          <LineChart width={520} height={260} data={lineData} margin={{ top: 8, right: 16, left: 6, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
            <XAxis dataKey="year" tick={{ fontSize: 7, fill: "#5a6577" }} interval={xInterval} tickFormatter={formatXLabel} />
            <YAxis tick={{ fontSize: 7, fill: "#8893a4" }} unit="%" width={30} />
            <Legend verticalAlign="top" wrapperStyle={{ fontSize: 7, paddingBottom: 8 }} />
            {funds.map((f, i) => (
              <Line key={f.id} type="monotone" dataKey={`fund_${f.id}`} name={f.name}
                stroke={fundColors[i]} strokeWidth={2}
                strokeDasharray={fundIsEstimated[i] ? "5 3" : undefined}
                dot={showDots ? { r: 2, fill: fundColors[i] } : false}
                connectNulls={true} />
            ))}
            {benchmarks.map((bm, i) => (
              <Line key={bm.id} type="monotone" dataKey={`bm_${bm.id}`} name={bm.name}
                stroke={bmColors[i]} strokeWidth={1.5} strokeDasharray="6 3"
                dot={false} connectNulls={false} />
            ))}
          </LineChart>
        </div>
      </div>
    );
  }

  /* ── Full screen ── */
  return (
    <div style={{ marginBottom: 8 }}>
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={lineData} margin={{ top: 16, right: 16, left: -45, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
          <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#5a6577" }}
            interval={xInterval} tickFormatter={formatXLabel} />
          <YAxis tick={{ fontSize: 10, fill: "#8893a4" }} unit="%" width={45} style={{ direction: "ltr" }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #dfe3e8" }}
            formatter={(value: unknown) => [`${Number(value)?.toFixed(2)}%`]}
            labelFormatter={(label: unknown) => formatXLabel(String(label))}
          />
          <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 12 }} />
          {funds.map((f, i) => (
            <Line key={f.id} type="monotone" dataKey={`fund_${f.id}`} name={f.name}
              stroke={fundColors[i]} strokeWidth={2.5}
              strokeDasharray={fundIsEstimated[i] ? "6 3" : undefined}
              dot={showDots ? { r: 4, fill: fundColors[i], strokeWidth: 0 } : false}
              activeDot={{ r: showDots ? 6 : 4 }}
              connectNulls={true} />
          ))}
          {benchmarks.map((bm, i) => (
            <Line key={bm.id} type="monotone" dataKey={`bm_${bm.id}`} name={bm.name}
              stroke={bmColors[i]} strokeWidth={2} strokeDasharray="8 4"
              dot={false} activeDot={{ r: 4 }} connectNulls={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
