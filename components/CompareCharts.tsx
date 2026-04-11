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
  /** Chart start — YYYY-MM. Replaces selectedYears. */
  from?: string;
  /** Chart end — YYYY-MM. */
  to?: string;
}

/* Fixed palette for up to 4 funds */
const PALETTE = ["#1B3A2F", "#B8975A", "#3a5fa0", "#6b4fa0"];
/* Benchmark palette — distinct from fund colors */
const BM_PALETTE = ["#6b4fa0", "#0891b2"];

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

/** All YYYY-MM keys between from and to inclusive */
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

/** Format YYYY-MM → short Hebrew label, or pass through annual label */
function formatXLabel(label: string): string {
  if (label.includes("-")) {
    const [year, month] = label.split("-");
    return `${MONTH_SHORT[parseInt(month) - 1]}'${year.slice(2)}`;
  }
  return label;
}

function buildLineData(
  funds: Fund[],
  benchmarks: Benchmark[],
  from: string,
  to: string,
) {
  // Prefer monthly data if any fund has it
  const hasMonthly = funds.some(
    (f) => f.monthlyReturns && Object.keys(f.monthlyReturns).length > 0,
  );

  if (hasMonthly) {
    const months = getAllMonths(from, to);
    return months.map((ym) => {
      const entry: Record<string, string | number | null> = { year: ym };
      funds.forEach((f) => {
        const v = (f.monthlyReturns ?? {})[ym] ?? null;
        entry[f.name] = v !== null ? Math.round(v * 10000) / 100 : null;
      });
      benchmarks.forEach((bm) => {
        const v = (bm.monthlyReturns ?? {})[ym] ?? null;
        entry[bm.name] = v !== null ? Math.round(v * 10000) / 100 : null;
      });
      return entry;
    });
  }

  // Fallback: annual data filtered by year range
  const fromYear = parseInt(from.slice(0, 4));
  const toYear   = parseInt(to.slice(0, 4));
  return YEAR_ENTRIES
    .filter((ye) => ye.year >= fromYear && ye.year <= toYear)
    .map((ye) => {
      const entry: Record<string, string | number | null> = { year: ye.label };
      funds.forEach((f) => {
        const v = f.returns[ye.key];
        entry[f.name] = v !== null ? Math.round(v * 10000) / 100 : null;
      });
      benchmarks.forEach((bm) => {
        const v = bm.returns[ye.key];
        entry[bm.name] = v !== null ? Math.round(v * 10000) / 100 : null;
      });
      return entry;
    });
}

export default function CompareCharts({
  funds, accentColor, compact, benchmarks = [], from, to,
}: CompareChartsProps) {
  if (funds.length < 2) return null;

  const today = new Date();
  const defaultTo   = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const effectiveFrom = from ?? "2019-01";
  const effectiveTo   = to   ?? defaultTo;

  const lineData   = buildLineData(funds, benchmarks, effectiveFrom, effectiveTo);
  const fundColors = funds.map((_, i) => PALETTE[i % PALETTE.length]);
  fundColors[0]    = accentColor;
  const bmColors   = benchmarks.map((_, i) => BM_PALETTE[i % BM_PALETTE.length]);

  // Show at most ~8 X-axis labels regardless of data density
  const xInterval  = Math.max(0, Math.ceil(lineData.length / 8) - 1);
  // Hide individual dots when data is dense (monthly)
  const showDots   = lineData.length <= 12;

  /* ── Print / compact ──────────────────────────────────────────────── */
  if (compact) {
    return (
      <div style={{ pageBreakInside: "avoid", breakInside: "avoid" }}>
        <h4 style={{ fontSize: "9pt", fontWeight: 600, color: "#1a1f2b", margin: "0 0 6px", textAlign: "right" }}>
          השוואת תשואות (%)
        </h4>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <LineChart width={540} height={240} data={lineData}
            margin={{ top: 8, right: 16, left: 6, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
            <XAxis dataKey="year" tick={{ fontSize: 7, fill: "#5a6577" }}
              interval={xInterval} tickFormatter={formatXLabel} />
            <YAxis tick={{ fontSize: 7, fill: "#8893a4" }} unit="%" width={30} />
            <Legend wrapperStyle={{ fontSize: 7, paddingTop: 4 }} />
            {funds.map((f, i) => (
              <Line key={f.id} type="monotone" dataKey={f.name}
                stroke={fundColors[i]} strokeWidth={2}
                dot={showDots ? { r: 2, fill: fundColors[i] } : false}
                connectNulls={false}
              />
            ))}
            {benchmarks.map((bm, i) => (
              <Line key={bm.id} type="monotone" dataKey={bm.name}
                stroke={bmColors[i]} strokeWidth={1.5} strokeDasharray="6 3"
                dot={false} connectNulls={false}
              />
            ))}
          </LineChart>
        </div>
      </div>
    );
  }

  /* ── Full screen ──────────────────────────────────────────────────── */
  return (
    <div style={{ marginBottom: 8 }}>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={lineData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
          <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#5a6577" }}
            interval={xInterval} tickFormatter={formatXLabel} />
          <YAxis tick={{ fontSize: 10, fill: "#8893a4" }} unit="%" width={45} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #dfe3e8" }}
            formatter={(value: unknown) => [`${Number(value)?.toFixed(2)}%`]}
            labelFormatter={(label: unknown) => formatXLabel(String(label))}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          {funds.map((f, i) => (
            <Line key={f.id} type="monotone" dataKey={f.name}
              stroke={fundColors[i]} strokeWidth={2.5}
              dot={showDots ? { r: 4, fill: fundColors[i], strokeWidth: 0 } : false}
              activeDot={{ r: showDots ? 6 : 4 }} connectNulls={false}
            />
          ))}
          {benchmarks.map((bm, i) => (
            <Line key={bm.id} type="monotone" dataKey={bm.name}
              stroke={bmColors[i]} strokeWidth={2} strokeDasharray="8 4"
              dot={false} activeDot={{ r: 4 }} connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
