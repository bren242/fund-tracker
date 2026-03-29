"use client";

import { Fund } from "@/lib/types";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

interface CompareChartsProps {
  funds: Fund[];
  accentColor: string;
  compact?: boolean;
}

/* Fixed palette for up to 4 funds */
const PALETTE = ["#1a365d", "#059669", "#c42b2b", "#7c3aed"];

type YearEntry = { key: keyof Fund["returns"]; label: string };

const YEAR_ENTRIES: YearEntry[] = [
  { key: "y2019", label: "2019" },
  { key: "y2020", label: "2020" },
  { key: "y2021", label: "2021" },
  { key: "y2022", label: "2022" },
  { key: "y2023", label: "2023" },
  { key: "y2024", label: "2024" },
  { key: "y2025", label: "2025" },
  { key: "ytd2026", label: "2026" },
];

function buildLineData(funds: Fund[]) {
  return YEAR_ENTRIES.map((ye) => {
    const entry: Record<string, string | number | null> = { year: ye.label };
    funds.forEach((f) => {
      const v = f.returns[ye.key];
      entry[f.name] = v !== null ? Math.round(v * 10000) / 100 : null;
    });
    return entry;
  });
}

export default function CompareCharts({ funds, accentColor, compact }: CompareChartsProps) {
  if (funds.length < 2) return null;

  const lineData = buildLineData(funds);
  const colors = funds.map((_, i) => PALETTE[i % PALETTE.length]);
  colors[0] = accentColor;

  /* Print-compact: portrait A4, clean size */
  if (compact) {
    return (
      <div style={{ pageBreakInside: "avoid", breakInside: "avoid" }}>
        <h4 style={{ fontSize: "9pt", fontWeight: 600, color: "#1a1f2b", margin: "0 0 6px", textAlign: "right" }}>
          השוואת תשואות שנתיות (%)
        </h4>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <LineChart width={540} height={260} data={lineData}
            margin={{ top: 8, right: 16, left: 6, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
            <XAxis dataKey="year" tick={{ fontSize: 8, fill: "#5a6577" }} />
            <YAxis tick={{ fontSize: 7, fill: "#8893a4" }} unit="%" width={30} />
            <Legend wrapperStyle={{ fontSize: 7, paddingTop: 4 }} />
            {funds.map((f, i) => (
              <Line
                key={f.id}
                type="monotone"
                dataKey={f.name}
                stroke={colors[i]}
                strokeWidth={2}
                dot={{ r: 3, fill: colors[i] }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </div>
      </div>
    );
  }

  /* Full screen version */
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        backgroundColor: "white", borderRadius: 10, padding: "20px 16px",
        border: "1px solid #dfe3e8",
      }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, color: "#1a1f2b", margin: "0 0 16px", textAlign: "right" }}>
          השוואת תשואות שנתיות (%)
        </h4>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <LineChart width={660} height={360} data={lineData}
            margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e8eaed" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#5a6577" }} />
            <YAxis tick={{ fontSize: 10, fill: "#8893a4" }} unit="%" width={45} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #dfe3e8" }}
              formatter={(value: unknown) => [`${Number(value)?.toFixed(2)}%`]}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            {funds.map((f, i) => (
              <Line
                key={f.id}
                type="monotone"
                dataKey={f.name}
                stroke={colors[i]}
                strokeWidth={2.5}
                dot={{ r: 4, fill: colors[i], strokeWidth: 0 }}
                activeDot={{ r: 6 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </div>
      </div>
    </div>
  );
}
