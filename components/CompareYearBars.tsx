"use client";

import { Fund } from "@/lib/types";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

interface CompareYearBarsProps {
  funds: Fund[];
  yearKeys: string[]; // display order: chronological, e.g. ["2023","2024","2025","ytd2026"]
  accentColor: string;
}

const YEAR_COLORS: Record<string, string> = {
  "2020":    "#cbd5e1",
  "2021":    "#94a3b8",
  "2022":    "#64748b",
  "2023":    "#475569",
  "2024":    "#334155",
  "2025":    "#B8975A",
  "ytd2026": "#1a365d",
};

function yearLabel(k: string): string {
  return k === "ytd2026" ? "YTD 2026" : k;
}

function yearFieldKey(k: string): keyof Fund["returns"] {
  return (k === "ytd2026" ? "ytd2026" : `y${k}`) as keyof Fund["returns"];
}

function truncate(s: string, n = 22): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export default function CompareYearBars({ funds, yearKeys, accentColor }: CompareYearBarsProps) {
  if (funds.length < 1 || yearKeys.length === 0) return null;

  const data = funds.map((f) => {
    const row: Record<string, string | number | null> = { name: truncate(f.name) };
    yearKeys.forEach((yk) => {
      const v = f.returns[yearFieldKey(yk)];
      row[yearLabel(yk)] = v != null ? Math.round(v * 10000) / 100 : null;
    });
    return row;
  });

  return (
    <div style={{ marginBottom: 8 }}>
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={data} margin={{ top: 16, right: 16, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#5a6577" }} interval={0} />
          <YAxis tick={{ fontSize: 10, fill: "#8893a4" }} unit="%" width={45} style={{ direction: "ltr" }} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #dfe3e8" }}
            formatter={(value: unknown) => [`${Number(value)?.toFixed(2)}%`]}
          />
          <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11, paddingBottom: 12 }} />
          {yearKeys.map((yk) => (
            <Bar
              key={yk}
              dataKey={yearLabel(yk)}
              fill={YEAR_COLORS[yk] || accentColor}
              radius={[3, 3, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
