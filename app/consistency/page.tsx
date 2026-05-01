"use client";

import { useState, useMemo, useEffect, useCallback, Suspense, Fragment } from "react";
import { useSearchParams } from "next/navigation";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { useClientKey } from "@/lib/useClientKey";
import { useBrand } from "@/lib/useBrand";
import { useTheme } from "@/components/ThemeProvider";
import { FundsData, Benchmark } from "@/lib/types";
import ClientGate from "@/components/ClientGate";
import { brandCssVars } from "@/lib/colors";
import {
  getBenchmarkForCategory,
  blendBenchmarkReturns,
  calcConsistencyVsBenchmark,
  ConsistencyResult,
} from "@/lib/consistency";

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Constants                                                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

const CATEGORIES = [
  { id: "equity-hedged",  label: "חשיפה גבוהה למניות" },
  { id: "bond-hedged",    label: 'אג"ח - חשיפה נמוכה' },
  { id: "multi-strategy", label: "Multi Strategy" },
];

const TIME_RANGES = [
  { id: "12m", label: "12M" },
  { id: "36m", label: "36M" },
  { id: "60m", label: "60M" },
  { id: "all", label: "מ-2020" },
];

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Types                                                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

interface ConsistencyConfig {
  benchmarkWeights: Record<string, Record<string, number>>;
  thresholds: { redScore: number; starIR: number };
}

interface TableRow {
  id: string;
  name: string;
  sharedMonths: number;
  result: ConsistencyResult | null;
  tags: string[];
  filteredMR: Record<string, number>;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Time range filter                                                         */
/* ══════════════════════════════════════════════════════════════════════════ */

function filterByTimeRange(
  mr: Record<string, number>,
  timeRange: string
): Record<string, number> {
  if (timeRange === "all") {
    return Object.fromEntries(Object.entries(mr).filter(([m]) => m >= "2020-01"));
  }
  if (timeRange.endsWith("m")) {
    const n = parseInt(timeRange, 10);
    const today = new Date();
    const cutoff = new Date(today.getFullYear(), today.getMonth() - n, 1);
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
    return Object.fromEntries(Object.entries(mr).filter(([m]) => m >= cutoffStr));
  }
  return Object.fromEntries(Object.entries(mr).filter(([m]) => m.startsWith(timeRange + "-")));
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Effective blend                                                           */
/* ══════════════════════════════════════════════════════════════════════════ */

function effectiveBlend(
  categoryId: string,
  config: ConsistencyConfig | null
): Record<string, number> | null {
  const cfgWeights = config?.benchmarkWeights?.[categoryId];
  if (cfgWeights) {
    const filtered = Object.fromEntries(Object.entries(cfgWeights).filter(([, v]) => v > 0));
    if (Object.keys(filtered).length > 0) return filtered;
  }
  return getBenchmarkForCategory(categoryId);
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Tag helper (unchanged logic — used in rows computation)                  */
/* ══════════════════════════════════════════════════════════════════════════ */

function getTags(
  result: ConsistencyResult,
  thresholds: { redScore: number; starIR: number }
): string[] {
  const tags: string[] = [];
  if (result.ir !== null && result.ir > thresholds.starIR) tags.push("⭐");
  if (result.ir !== null && result.ir < 0)                 tags.push("⚠️");
  if (result.score < thresholds.redScore)                  tags.push("🔴");
  return tags;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Color helpers                                                             */
/* ══════════════════════════════════════════════════════════════════════════ */

function irColor(ir: number | null): string {
  if (ir === null) return "var(--text-muted)";
  if (ir > 0.5) return "#059669";
  if (ir < 0)   return "#DC2626";
  return "var(--text-secondary)";
}

function scoreBadgeStyle(score: number): React.CSSProperties {
  if (score >= 55) return { background: "rgba(5,150,105,0.08)",  color: "#065F46" };
  if (score >= 45) return { background: "rgba(217,119,6,0.08)",  color: "#92400E" };
  return             { background: "rgba(220,38,38,0.08)",  color: "#991B1B" };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Benchmark label helper                                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

function buildBmLabel(
  categoryId: string,
  benchmarks: Benchmark[],
  config: ConsistencyConfig | null,
  timeRange: string
): { label: string; months: number } {
  const blend = effectiveBlend(categoryId, config);
  if (!blend) return { label: "—", months: 0 };

  const parts = Object.entries(blend).map(([id, w]) => {
    const bm  = benchmarks.find((b) => b.id === id);
    const pct = Math.round(w * 100);
    return bm ? `${pct}% ${bm.name}` : id;
  });

  const rawMR    = blendBenchmarkReturns(blend, benchmarks);
  const filtered = filterByTimeRange(rawMR, timeRange);
  return { label: parts.join(" + "), months: Object.keys(filtered).length };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Chart helpers                                                             */
/* ══════════════════════════════════════════════════════════════════════════ */

function buildChartData(
  fundMR: Record<string, number>,
  bmMR:   Record<string, number>
): { month: string; fund: number; bm: number }[] {
  const shared = Object.keys(fundMR).filter((m) => m in bmMR).sort();
  let fundCum = 0, bmCum = 0;
  return shared.map((month) => {
    fundCum = (1 + fundCum) * (1 + fundMR[month]) - 1;
    bmCum   = (1 + bmCum)   * (1 + bmMR[month])   - 1;
    return {
      month,
      fund: parseFloat((fundCum * 100).toFixed(2)),
      bm:   parseFloat((bmCum   * 100).toFixed(2)),
    };
  });
}

function fmtMonth(m: string): string {
  const [y, mo] = m.split("-");
  return `${mo}/${y.slice(2)}`;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Sparkline                                                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

function buildSparkline(filteredMR: Record<string, number>): {
  points: [number, number][];
  trend: "up" | "flat" | "down";
} {
  const sorted = Object.keys(filteredMR).sort();
  const last6  = sorted.slice(-6);
  if (last6.length < 2) return { points: [], trend: "flat" };

  let cum = 0;
  const values = last6.map((m) => {
    cum = (1 + cum) * (1 + filteredMR[m]) - 1;
    return cum * 100;
  });

  const min   = Math.min(...values);
  const max   = Math.max(...values);
  const range = max - min || 1;
  const W = 56, H = 24;
  const points: [number, number][] = values.map((v, i) => [
    (i / (values.length - 1)) * W,
    H - ((v - min) / range) * (H - 4) - 2,
  ]);

  const n    = values.length;
  const xs   = Array.from({ length: n }, (_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, v) => a + v, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * values[i], 0);
  const sumX2 = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;

  const trend = slope > 0.05 ? "up" : slope < -0.05 ? "down" : "flat";
  return { points, trend };
}

function Sparkline({ filteredMR }: { filteredMR: Record<string, number> }) {
  const { points, trend } = buildSparkline(filteredMR);
  if (points.length < 2) {
    return <span style={{ color: "var(--text-muted)", fontSize: 10 }}>—</span>;
  }
  const color     = trend === "up" ? "#059669" : trend === "down" ? "#DC2626" : "#D97706";
  const pointsStr = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  return (
    <svg width={56} height={24} viewBox="0 0 56 24" style={{ display: "block", margin: "0 auto" }}>
      <polyline
        points={pointsStr}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Chart tooltip                                                             */
/* ══════════════════════════════════════════════════════════════════════════ */

function ChartTooltip({ active, payload, label, isDark }: {
  active?: boolean;
  payload?: { value: number; color: string; name: string }[];
  label?: string;
  isDark?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      backgroundColor: isDark ? "#1e2d2d" : "#ffffff",
      border: `1px solid ${isDark ? "#3a4a4a" : "#e5e7eb"}`,
      borderRadius: 8, padding: "8px 12px", fontSize: 11,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: isDark ? "#94a3b8" : "#64748b" }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color, fontWeight: 500 }}>
          {p.name}: {p.value >= 0 ? "+" : ""}{p.value.toFixed(2)}%
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Per-fund view — types, helpers, sub-components                           */
/* ══════════════════════════════════════════════════════════════════════════ */

interface FundConsistencyData {
  fund: { id: string; name: string; classification: string; lastReportDate: string | null };
  category: { id: string; name: string; fundsCount: number; fundsWithMonthlyData: number };
  endMonth: string;
  ir: number | null;
  vsBenchmark: {
    monthsAbove: number; monthsBelow: number; totalMonths: number;
    percentageAbove: number; benchmarkName: string; insufficientData: boolean;
  };
  vsCategory: {
    monthsAbove: number; monthsBelow: number; totalMonths: number;
    percentageAbove: number; insufficientData: boolean;
  };
  monthly:    { fundReturn: number | null; categoryAvg: number | null; diff: number | null };
  ytd:        { fundReturn: number | null; categoryAvg: number | null; diff: number | null; fromMonth: string };
  rolling24m: { fundReturn: number | null; categoryAvg: number | null; diff: number | null; fromMonth: string };
}

const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const CURRENT_YEAR = new Date().getFullYear();
const FUND_YEARS   = Array.from({ length: CURRENT_YEAR - 2019 }, (_, i) => CURRENT_YEAR - i);

function fmtPct(v: number | null, decimals = 1): string {
  if (v == null) return "—";
  const pct = v * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(decimals)}%`;
}
function fmtIR(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
}
function diffColor(v: number | null): string {
  if (v == null) return "var(--text-muted)";
  return v > 0 ? "#059669" : v < 0 ? "#DC2626" : "var(--text-secondary)";
}
function fundIRColor(ir: number | null): string {
  if (ir == null) return "var(--text-muted)";
  if (ir > 0.5)   return "#059669";
  if (ir > 0)     return "#D97706";
  return "#DC2626";
}
function scoreBgFund(score: number): { bg: string; color: string } {
  if (score >= 60) return { bg: "rgba(5,150,105,0.10)",  color: "#065F46" };
  if (score >= 45) return { bg: "rgba(217,119,6,0.10)",  color: "#92400E" };
  return                  { bg: "rgba(220,38,38,0.10)",  color: "#991B1B" };
}

function ScoreRing({ pct, color }: { pct: number; color: string }) {
  const r = 26, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={64} height={64} viewBox="0 0 64 64" style={{ display: "block", margin: "0 auto 8px" }}>
      <circle cx={32} cy={32} r={r} fill="none" stroke="var(--border)" strokeWidth={5} />
      <circle
        cx={32} cy={32} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
        style={{ transform: "rotate(-90deg) scaleX(-1)", transformOrigin: "32px 32px" }}
      />
      <text x={32} y={37} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

function MetricCard({
  label, fundReturn, categoryAvg, diff, fromLabel,
}: {
  label: string; fundReturn: number | null;
  categoryAvg: number | null; diff: number | null; fromLabel?: string;
}) {
  const hasData = fundReturn != null || categoryAvg != null;
  return (
    <div style={{
      borderRadius: 14, padding: "20px 20px 18px",
      backgroundColor: "var(--bg-surface)",
      border: "1px solid var(--border)",
      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.7px",
        textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 12,
      }}>
        {label}
        {fromLabel && (
          <span style={{ marginRight: 6, fontWeight: 400, textTransform: "none", fontSize: 9 }}>
            ({fromLabel})
          </span>
        )}
      </div>
      {!hasData ? (
        <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12, padding: "8px 0" }}>
          אין נתונים מספיקים
        </div>
      ) : (
        <>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.1, marginBottom: 4 }}>
            {fmtPct(fundReturn)}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
            ממוצע קטגוריה: {fmtPct(categoryAvg)}
          </div>
          <div style={{
            fontSize: 13, fontWeight: 600, color: diffColor(diff),
            paddingTop: 8, borderTop: "1px solid var(--border)",
          }}>
            {diff != null ? <>{fmtPct(diff)} מול קטגוריה</> : "—"}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Per-fund detail view ───────────────────────────────────────────────── */

function FundDetailView({
  fundId, clientKey,
}: { fundId: string; clientKey: string }) {
  const brand     = useBrand(clientKey);
  const { theme } = useTheme();
  const isDark    = theme === "dark";

  const [data,         setData]         = useState<FundConsistencyData | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [endMonth,     setEndMonth]     = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [selectedMon,  setSelectedMon]  = useState<number>(new Date().getMonth() + 1);
  const [initialized,  setInitialized]  = useState(false);

  /* AI analysis */
  const [aiText,    setAiText]    = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState(false);

  const fetchData = useCallback(async (month: string) => {
    if (!fundId || !month) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(
        `/api/consistency-data?fundId=${encodeURIComponent(fundId)}&endMonth=${month}&client=${encodeURIComponent(clientKey)}`
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `HTTP ${res.status}`);
      }
      const json: FundConsistencyData = await res.json();
      setData(json);
      if (!initialized && json.fund.lastReportDate) {
        const [y, m] = json.fund.lastReportDate.split("-").map(Number);
        setSelectedYear(y); setSelectedMon(m);
        setEndMonth(`${y}-${String(m).padStart(2, "0")}`);
        setInitialized(true);
        return;
      }
      setInitialized(true);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [clientKey, fundId, initialized]);

  useEffect(() => {
    if (!fundId) return;
    const now = new Date();
    const def = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    setEndMonth(def);
  }, [fundId]);

  useEffect(() => { if (endMonth) fetchData(endMonth); }, [endMonth]); // eslint-disable-line

  /* Fire AI analysis once main data is ready and endMonth is in sync */
  useEffect(() => {
    if (!data || loading) return;
    // Skip if data is from a different endMonth (during initial snap-to-lastReportDate)
    if (endMonth && data.endMonth !== endMonth) return;
    setAiText(null);
    setAiError(false);
    setAiLoading(true);
    fetch("/api/consistency-ai", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(data),
    })
      .then((r) => r.json())
      .then((j: { analysis?: string }) => {
        if (j.analysis) setAiText(j.analysis);
        else setAiError(true);
      })
      .catch(() => setAiError(true))
      .finally(() => setAiLoading(false));
  }, [data, loading, endMonth]); // eslint-disable-line

  const maxYear  = data?.fund.lastReportDate ? parseInt(data.fund.lastReportDate.split("-")[0]) : CURRENT_YEAR;
  const maxMonth = data?.fund.lastReportDate ? parseInt(data.fund.lastReportDate.split("-")[1]) : 12;

  const handleApply = () => {
    setEndMonth(`${selectedYear}-${String(selectedMon).padStart(2, "0")}`);
  };
  const handleReset = () => {
    if (data?.fund.lastReportDate) {
      const [y, mo] = data.fund.lastReportDate.split("-").map(Number);
      setSelectedYear(y); setSelectedMon(mo);
      setEndMonth(`${y}-${String(mo).padStart(2, "0")}`);
    }
  };

  const cardSt: React.CSSProperties = {
    borderRadius: 16, padding: "24px 22px",
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border)",
    boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
    display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
  };

  const selSt: React.CSSProperties = {
    padding: "6px 10px", borderRadius: 8, fontSize: 13,
    border: "1px solid var(--border)", backgroundColor: "var(--bg-input)",
    color: "var(--text-primary)", cursor: "pointer",
  };

  return (
    <div style={{
      ...brandCssVars(brand.primaryColor, brand.accentColor) as React.CSSProperties,
      minHeight: "100vh", backgroundColor: "var(--bg-page)",
    }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .con-fade { animation: fadeUp 0.35s ease both; }
        .con-fade-1 { animation-delay: 0.05s; }
        .con-fade-2 { animation-delay: 0.10s; }
        .con-fade-3 { animation-delay: 0.15s; }
        .con-fade-4 { animation-delay: 0.20s; }
      `}</style>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 24px 56px" }}>

        {/* Back link */}
        <a
          href={`/${clientKey}/consistency`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 12, color: "var(--text-muted)", textDecoration: "none",
            marginBottom: 16,
          }}
        >
          ← חזרה לרשימה
        </a>

        {/* Header */}
        {data && (
          <div style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 2px" }}>
              {data.fund.name}
            </h1>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              {data.fund.classification} · {data.category.name}
            </p>
          </div>
        )}

        {/* Period selector */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "12px 16px", borderRadius: 10,
          backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
          marginBottom: 24,
        }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>תקופה:</span>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            style={selSt}
          >
            {FUND_YEARS.filter((y) => y <= maxYear).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={selectedMon}
            onChange={(e) => setSelectedMon(Number(e.target.value))}
            style={selSt}
          >
            {MONTHS_HE.map((name, i) => {
              const mon = i + 1;
              const disabled = selectedYear === maxYear && mon > maxMonth;
              return (
                <option key={mon} value={mon} disabled={disabled}>{name}</option>
              );
            })}
          </select>
          <button
            onClick={handleApply}
            style={{
              padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              backgroundColor: brand.primaryColor || "#1B3A2F", color: "#fff",
              border: "none", cursor: "pointer",
            }}
          >
            הצג
          </button>
          {data?.fund.lastReportDate && (
            <button
              onClick={handleReset}
              style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 12,
                backgroundColor: "transparent", color: "var(--text-secondary)",
                border: "1px solid var(--border)", cursor: "pointer",
              }}
            >
              דו"ח אחרון
            </button>
          )}
          {endMonth && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: "auto" }}>
              חלון: 24 חודשים עד {endMonth}
            </span>
          )}
        </div>

        {/* Loading / Error */}
        {loading && (
          <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
            טוען...
          </div>
        )}
        {error && (
          <div style={{ textAlign: "center", padding: 24, color: "#DC2626", fontSize: 13 }}>
            שגיאה: {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Score cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
              {/* IR */}
              <div className="con-fade con-fade-1" style={cardSt}>
                <div style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.7px",
                  textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8,
                }}>
                  Information Ratio
                </div>
                <div style={{
                  fontSize: 48, fontWeight: 700, lineHeight: 1,
                  color: fundIRColor(data.ir), marginBottom: 6,
                }}>
                  {fmtIR(data.ir)}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
                  {data.ir == null ? "אין מספיק נתונים" :
                    data.ir > 0.5 ? "עקביות גבוהה מעל הבנצ׳מרק" :
                    data.ir > 0   ? "עקביות מתונה מעל הבנצ׳מרק" :
                                    "מתחת לבנצ׳מרק בממוצע"}
                </div>
              </div>

              {/* vs Benchmark */}
              <div className="con-fade con-fade-2" style={cardSt}>
                <div style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.7px",
                  textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8,
                }}>
                  מול בנצ׳מרק
                </div>
                {data.vsBenchmark.insufficientData ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>אין מספיק נתונים</div>
                ) : (
                  <>
                    <ScoreRing
                      pct={data.vsBenchmark.percentageAbove}
                      color={scoreBgFund(data.vsBenchmark.percentageAbove).color}
                    />
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {data.vsBenchmark.monthsAbove} / {data.vsBenchmark.totalMonths} חודשים
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                      {data.vsBenchmark.benchmarkName}
                    </div>
                  </>
                )}
              </div>

              {/* vs Category */}
              <div className="con-fade con-fade-3" style={cardSt}>
                <div style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.7px",
                  textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8,
                }}>
                  מול קטגוריה
                </div>
                {data.vsCategory.insufficientData ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>אין מספיק נתונים</div>
                ) : (
                  <>
                    <ScoreRing
                      pct={data.vsCategory.percentageAbove}
                      color={scoreBgFund(data.vsCategory.percentageAbove).color}
                    />
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {data.vsCategory.monthsAbove} / {data.vsCategory.totalMonths} חודשים
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                      {data.category.fundsWithMonthlyData} / {data.category.fundsCount} קרנות עם נתונים
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Metric cards */}
            <div className="con-fade con-fade-4" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
              <MetricCard
                label="חודשי"
                fundReturn={data.monthly.fundReturn}
                categoryAvg={data.monthly.categoryAvg}
                diff={data.monthly.diff}
              />
              <MetricCard
                label="מצטבר מתחילת שנה"
                fundReturn={data.ytd.fundReturn}
                categoryAvg={data.ytd.categoryAvg}
                diff={data.ytd.diff}
                fromLabel={`מ-${data.ytd.fromMonth}`}
              />
              <MetricCard
                label="Rolling 24M"
                fundReturn={data.rolling24m.fundReturn}
                categoryAvg={data.rolling24m.categoryAvg}
                diff={data.rolling24m.diff}
                fromLabel={`מ-${data.rolling24m.fromMonth}`}
              />
            </div>

            {/* AI analysis card */}
            <div style={{
              borderRadius: 14,
              padding: "24px 28px 20px",
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              marginBottom: 20,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 600, letterSpacing: "0.7px",
                textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 14,
              }}>
                ניתוח AI
              </div>

              {aiLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-muted)", fontSize: 13 }}>
                  <svg width={16} height={16} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
                    <style>{`@keyframes ai-spin { to { transform: rotate(360deg); } }`}</style>
                    <circle
                      cx={8} cy={8} r={6}
                      fill="none" stroke="currentColor" strokeWidth={2}
                      strokeDasharray="20 18"
                      style={{ transformOrigin: "8px 8px", animation: "ai-spin 0.8s linear infinite" }}
                    />
                  </svg>
                  מנתח...
                </div>
              )}

              {!aiLoading && aiError && (
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  ניתוח לא זמין כרגע
                </div>
              )}

              {!aiLoading && aiText && (
                <p style={{
                  fontSize: 14, lineHeight: 1.8,
                  color: "var(--text-secondary)",
                  margin: 0,
                  direction: "rtl",
                }}>
                  {aiText}
                </p>
              )}

              <div style={{
                fontSize: 10, color: "var(--text-muted)",
                marginTop: 16, paddingTop: 12,
                borderTop: "1px solid var(--border)",
                lineHeight: 1.5,
              }}>
                המידע לצורך ניתוח בלבד ואינו מהווה ייעוץ השקעות.
              </div>
            </div>

            <p style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "right", lineHeight: 1.6 }}>
              כל החישובים מבוססים על חלון Rolling 24 חודשים המסתיים ב-{endMonth}.{" "}
              ממוצע קטגוריה מחושב מינימום 3 קרנות עם נתונים חודשיים לכל חודש.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Main content                                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

/* Router: dispatches to fund detail view or leaderboard */
function ConsistencyContent() {
  const clientKey = useClientKey();
  const params    = useSearchParams();
  const fundId    = params.get("fund") ?? "";

  if (fundId) {
    return (
      <ClientGate clientKey={clientKey}>
        <FundDetailView fundId={fundId} clientKey={clientKey} />
      </ClientGate>
    );
  }

  return <LeaderboardView clientKey={clientKey} />;
}

function LeaderboardView({ clientKey }: { clientKey: string }) {
  const brand     = useBrand(clientKey);
  const { theme } = useTheme();
  const isDark    = theme === "dark";

  const [fundsData,   setFundsData]   = useState<FundsData | null>(null);
  const [benchmarks,  setBenchmarks]  = useState<Benchmark[]>([]);
  const [config,      setConfig]      = useState<ConsistencyConfig | null>(null);
  const [selectedCat, setSelectedCat] = useState("equity-hedged");
  const [timeRange,   setTimeRange]   = useState("all");
  const [expandedId,  setExpandedId]  = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/funds?client=${encodeURIComponent(clientKey)}`)
      .then((r) => r.json()).then(setFundsData);
    fetch(`/api/benchmarks?client=${encodeURIComponent(clientKey)}`)
      .then((r) => r.json()).then(setBenchmarks);
    fetch(`/api/consistency-config?client=${encodeURIComponent(clientKey)}`)
      .then((r) => r.json()).then(setConfig);
  }, [clientKey]);

  /* ── compute rows ────────────────────────────────────────────────────── */
  const { rows, bmInfo, bmMRFiltered, fundsWithData, totalFunds } = useMemo(() => {
    const empty = {
      rows:          [] as TableRow[],
      bmInfo:        { label: "—", months: 0 },
      bmMRFiltered:  {} as Record<string, number>,
      fundsWithData: 0,
      totalFunds:    0,
    };
    if (!fundsData || !benchmarks.length) return empty;

    const category = fundsData.categories.find((c) => c.id === selectedCat);
    if (!category) return empty;

    const thresholds   = config?.thresholds ?? { redScore: 40, starIR: 0.5 };
    const blend        = effectiveBlend(selectedCat, config);
    const rawBmMR      = blend ? blendBenchmarkReturns(blend, benchmarks) : {};
    const bmMRFiltered = filterByTimeRange(rawBmMR, timeRange);
    const bmInfo       = buildBmLabel(selectedCat, benchmarks, config, timeRange);

    const rows: TableRow[] = category.funds.map((fund) => {
      const rawMR      = fund.monthlyReturns ?? {};
      const filteredMR = filterByTimeRange(rawMR, timeRange);

      if (!blend || !Object.keys(bmMRFiltered).length) {
        return { id: fund.id, name: fund.name, sharedMonths: 0, result: null, tags: [], filteredMR };
      }

      const result = calcConsistencyVsBenchmark(filteredMR, bmMRFiltered, 12);
      return {
        id: fund.id,
        name: fund.name,
        sharedMonths: result?.total ?? 0,
        result,
        tags: result ? getTags(result, thresholds) : [],
        filteredMR,
      };
    });

    rows.sort((a, b) => {
      if (a.result && b.result) return b.result.score - a.result.score;
      if (a.result) return -1;
      if (b.result) return 1;
      return a.name.localeCompare(b.name);
    });

    const withResult = rows.filter((r) => r.result);
    return {
      rows,
      bmInfo,
      bmMRFiltered,
      fundsWithData: withResult.length,
      totalFunds:    category.funds.length,
    };
  }, [fundsData, benchmarks, config, selectedCat, timeRange]);

  const loading = !fundsData || !benchmarks.length || !config;

  /* ── KPI ─────────────────────────────────────────────────────────────── */
  const kpiConsistent = rows.filter((r) => r.result && r.result.score > 55).length;
  const kpiWeak       = rows.filter((r) => r.result && r.result.score < 40).length;
  const kpiTop        = rows[0]?.name ?? "—";

  /* ── Chart colors (hex required by recharts — per LESSONS.md) ─────────── */
  const fundColor = isDark ? "#4ade80" : "#1B3A2F";
  const bmColor   = "#B8975A";
  const gridColor = isDark ? "#2d3a3a" : "#e5e7eb";
  const axisColor = isDark ? "#6b7280" : "#9ca3af";

  /* ── Brand accent ─────────────────────────────────────────────────────── */
  const G = "#1B3A2F";  // active states / headings

  /* ── Shared table header style ───────────────────────────────────────── */
  const TH = (align: "right" | "center", w: string): React.CSSProperties => ({
    padding: "14px 20px",
    textAlign: align,
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: "0.6px",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    width: w,
    whiteSpace: "nowrap",
    borderBottom: "1px solid var(--border)",
  });

  return (
    <ClientGate clientKey={clientKey}>
      {/* Animations */}
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .con-kpi   { animation: fadeUp 0.5s ease both; }
        .con-kpi-1 { animation-delay: 0.05s; }
        .con-kpi-2 { animation-delay: 0.10s; }
        .con-kpi-3 { animation-delay: 0.15s; }
        .con-table { animation: fadeUp 0.5s ease both; animation-delay: 0.20s; }
        .con-enter { animation: fadeUp 0.3s ease both; }
        .con-row-hover:hover td { background: rgba(27,58,47,0.012) !important; }
      `}</style>

      <div style={{
        minHeight: "100vh",
        backgroundColor: "var(--bg-page)",
        ...brandCssVars(brand.primaryColor, brand.accentColor) as React.CSSProperties,
      }}>

        {/* ═══ Body ════════════════════════════════════════════════════════ */}
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 28px 56px" }}>

          {/* Hero */}
          <div style={{ marginBottom: 20 }}>
            <h1 style={{
              fontSize: 20, fontWeight: 700,
              color: "var(--text-primary)", margin: 0, lineHeight: 1.2,
            }}>
              עקביות קרנות
            </h1>
            <p style={{
              fontSize: 13, color: "var(--text-secondary)",
              margin: "4px 0 0 0",
            }}>
              כמה פעמים הקרן הכתה את המדד — ולא רק בשורה התחתונה
            </p>
          </div>

          {/* Category pills */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {CATEGORIES.map((cat) => {
              const active = selectedCat === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => { setSelectedCat(cat.id); setExpandedId(null); }}
                  style={{
                    padding: "7px 18px",
                    borderRadius: 100,
                    fontSize: 12,
                    fontWeight: active ? 500 : 400,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    backgroundColor: active ? G : "transparent",
                    color: active ? "#fff" : "var(--text-secondary)",
                    border: active ? `1px solid ${G}` : "1px solid var(--border)",
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Time range */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {TIME_RANGES.map((r) => {
              const active = timeRange === r.id;
              return (
                <button key={r.id}
                  onClick={() => { setTimeRange(r.id); setExpandedId(null); }}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 100,
                    fontSize: 12,
                    fontWeight: active ? 500 : 400,
                    cursor: "pointer",
                    transition: "all 0.12s",
                    backgroundColor: active ? G : "var(--bg-surface)",
                    color: active ? "#fff" : "var(--text-secondary)",
                    border: active ? `1px solid ${G}` : "1px solid var(--border)",
                  }}
                >{r.label}</button>
              );
            })}
          </div>

          {/* Benchmark bar */}
          {!loading && (
            <div style={{
              display: "flex", alignItems: "center",
              flexWrap: "wrap", gap: 8,
              fontSize: 11, color: "var(--text-muted)",
              marginBottom: 22, padding: "2px 0",
            }}>
              <span>בנצ׳מרק</span>
              <span style={{ width: 3, height: 3, borderRadius: "50%", backgroundColor: "var(--text-muted)", display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{bmInfo.label}</span>
              <span style={{ width: 3, height: 3, borderRadius: "50%", backgroundColor: "var(--text-muted)", display: "inline-block", flexShrink: 0 }} />
              <span>{bmInfo.months} חודשים</span>
              <span style={{ width: 3, height: 3, borderRadius: "50%", backgroundColor: "var(--text-muted)", display: "inline-block", flexShrink: 0 }} />
              <span>מינימום 12 חודשים משותפים</span>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ padding: 56, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              טוען נתונים...
            </div>
          )}

          {/* KPI Cards */}
          {!loading && fundsWithData > 0 && (
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
              gap: 14, marginBottom: 20,
            }}>
              {/* Card 1 — עקביות */}
              <div className="con-kpi con-kpi-1" style={{
                borderRadius: 14, padding: "20px 24px",
                backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 500,
                  letterSpacing: "0.6px", textTransform: "uppercase",
                  color: "var(--text-muted)", marginBottom: 10,
                }}>
                  קרנות עקביות
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 36, color: "#059669", lineHeight: 1 }}>
                    {kpiConsistent}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    מתוך {fundsWithData}
                  </span>
                </div>
              </div>

              {/* Card 2 — חלשות */}
              <div className="con-kpi con-kpi-2" style={{
                borderRadius: 14, padding: "20px 24px",
                backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 500,
                  letterSpacing: "0.6px", textTransform: "uppercase",
                  color: "var(--text-muted)", marginBottom: 10,
                }}>
                  קרנות חלשות
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 36, color: "#DC2626", lineHeight: 1 }}>
                    {kpiWeak}
                  </span>
                  <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    מתוך {fundsWithData}
                  </span>
                </div>
              </div>

              {/* Card 3 — מובילה */}
              <div className="con-kpi con-kpi-3" style={{
                borderRadius: 14, padding: "20px 24px",
                backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 500,
                  letterSpacing: "0.6px", textTransform: "uppercase",
                  color: "var(--text-muted)", marginBottom: 10,
                }}>
                  קרן מובילה
                </div>
                <div style={{
                  fontSize: 14, fontWeight: 600,
                  color: G, lineHeight: 1.4, wordBreak: "break-word",
                }}>
                  {kpiTop}
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          {!loading && rows.length > 0 && (
            <div className="con-table" style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              overflow: "hidden",
            }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={TH("right",  "32%")}>קרן</th>
                    <th style={TH("center", "18%")}>ציון עקביות</th>
                    <th style={TH("center", "22%")}>מגמה</th>
                    <th style={TH("center", "16%")}>חודשים</th>
                    <th style={TH("center", "12%")}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const isNA       = !row.result;
                    const isExpanded = expandedId === row.id;
                    const hasBorder  = i < rows.length - 1 || isExpanded;
                    const chartData  = isExpanded
                      ? buildChartData(row.filteredMR, bmMRFiltered)
                      : null;
                    const tickInterval = chartData
                      ? Math.max(0, Math.ceil(chartData.length / 8) - 1)
                      : 0;

                    return (
                      <Fragment key={row.id}>
                        <tr
                          className={isNA ? "" : "con-row-hover"}
                          style={{
                            borderBottom: hasBorder ? "1px solid var(--border)" : "none",
                            backgroundColor: isExpanded ? "var(--bg-surface-alt)" : "transparent",
                            opacity: isNA ? 0.25 : 1,
                            transition: "background 0.15s",
                          }}
                        >
                          {/* Fund name */}
                          <td style={{
                            padding: "16px 20px",
                            fontWeight: 500, fontSize: 14,
                            color: "var(--text-primary)", textAlign: "right",
                          }}>
                            {row.name}
                          </td>

                          {isNA ? (
                            <td colSpan={4} style={{
                              padding: "16px 20px", textAlign: "center",
                              fontSize: 11, color: "var(--text-muted)",
                            }}>
                              אין נתונים
                            </td>
                          ) : (
                            <>
                              {/* Score badge */}
                              <td style={{ padding: "16px 20px", textAlign: "center" }}>
                                <span style={{
                                  display: "inline-block",
                                  padding: "5px 16px",
                                  borderRadius: 10,
                                  fontSize: 13,
                                  fontWeight: 700,
                                  ...scoreBadgeStyle(row.result!.score),
                                }}>
                                  {row.result!.score.toFixed(1)}%
                                </span>
                              </td>

                              {/* Sparkline */}
                              <td style={{ padding: "16px 20px", textAlign: "center" }}>
                                <Sparkline filteredMR={row.filteredMR} />
                              </td>

                              {/* Months */}
                              <td style={{
                                padding: "16px 20px", textAlign: "center",
                                fontSize: 12, color: "var(--text-secondary)",
                              }}>
                                {row.sharedMonths}
                              </td>

                              {/* Chevron */}
                              <td style={{ padding: "16px 12px", textAlign: "center" }}>
                                <button
                                  onClick={() => setExpandedId(isExpanded ? null : row.id)}
                                  style={{
                                    background: "none", border: "none",
                                    cursor: "pointer", padding: 4,
                                    color: isExpanded ? G : "var(--text-muted)",
                                    transition: "color 0.15s, transform 0.2s",
                                    display: "inline-flex", alignItems: "center",
                                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                                  }}
                                >
                                  <svg width={14} height={14} viewBox="0 0 14 14" fill="none">
                                    <path
                                      d="M3 5L7 9L11 5"
                                      stroke="currentColor"
                                      strokeWidth={1.5}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </button>
                              </td>
                            </>
                          )}
                        </tr>

                        {/* ── Expanded detail ────────────────────────── */}
                        {isExpanded && (
                          <tr key={`${row.id}-detail`} style={{
                            borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none",
                          }}>
                            <td colSpan={5} style={{ padding: 0 }}>
                              <div className="con-enter" style={{
                                backgroundColor: "var(--bg-surface-alt)",
                                padding: "24px 28px",
                              }}>
                                {/* Head */}
                                <div style={{
                                  display: "flex", alignItems: "baseline",
                                  gap: 10, marginBottom: 16,
                                }}>
                                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                                    {row.name}
                                  </span>
                                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                                    vs {bmInfo.label} — תשואה מצטברת
                                  </span>
                                </div>

                                {/* Chart canvas */}
                                {chartData && chartData.length >= 2 ? (
                                  <div style={{
                                    backgroundColor: "var(--bg-surface)",
                                    borderRadius: 10,
                                    border: "1px solid var(--border)",
                                    padding: 16,
                                    marginBottom: 14,
                                  }}>
                                    <ResponsiveContainer width="100%" height={200}>
                                      <LineChart
                                        data={chartData}
                                        margin={{ top: 4, right: 20, left: 0, bottom: 0 }}
                                      >
                                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                        <XAxis
                                          dataKey="month"
                                          tickFormatter={fmtMonth}
                                          interval={tickInterval}
                                          tick={{ fontSize: 10, fill: axisColor }}
                                          stroke={gridColor}
                                        />
                                        <YAxis
                                          tickFormatter={(v: number) =>
                                            `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`
                                          }
                                          tick={{ fontSize: 10, fill: axisColor }}
                                          width={52}
                                          stroke={gridColor}
                                        />
                                        <Tooltip
                                          content={(props) => (
                                            <ChartTooltip
                                              active={props.active}
                                              payload={
                                                props.payload as unknown as {
                                                  value: number; color: string; name: string;
                                                }[]
                                              }
                                              label={props.label as string}
                                              isDark={isDark}
                                            />
                                          )}
                                        />
                                        <Line
                                          type="monotone"
                                          dataKey="fund"
                                          name={row.name}
                                          stroke={fundColor}
                                          strokeWidth={2.5}
                                          dot={false}
                                        />
                                        <Line
                                          type="monotone"
                                          dataKey="bm"
                                          name={bmInfo.label}
                                          stroke={bmColor}
                                          strokeWidth={1.5}
                                          dot={false}
                                          strokeDasharray="6 4"
                                        />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                                ) : (
                                  <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "20px 0" }}>
                                    אין מספיק נתונים לגרף
                                  </div>
                                )}

                                {/* Legend */}
                                {chartData && chartData.length >= 2 && (
                                  <div style={{
                                    display: "flex", justifyContent: "center",
                                    gap: 24, marginBottom: 16,
                                  }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <div style={{
                                        width: 20, height: 2,
                                        backgroundColor: fundColor, borderRadius: 2,
                                      }} />
                                      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                                        {row.name}
                                      </span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <svg width={20} height={4} style={{ display: "block" }}>
                                        <line
                                          x1="0" y1="2" x2="20" y2="2"
                                          stroke={bmColor} strokeWidth={1.5} strokeDasharray="4 2"
                                        />
                                      </svg>
                                      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                                        {bmInfo.label}
                                      </span>
                                    </div>
                                  </div>
                                )}

                                {/* Metrics */}
                                {row.result && (
                                  <div style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr 1fr",
                                    gap: 12, marginBottom: 14,
                                  }}>
                                    {[
                                      {
                                        label: "פער ממוצע / חודש",
                                        value: `${row.result.avgGap >= 0 ? "+" : ""}${(row.result.avgGap * 100).toFixed(3)}%`,
                                        color: row.result.avgGap >= 0 ? "#059669" : "#DC2626",
                                      },
                                      {
                                        label: "Information Ratio",
                                        value: row.result.ir != null ? row.result.ir.toFixed(3) : "—",
                                        color: irColor(row.result.ir),
                                      },
                                      {
                                        label: "ניצחונות",
                                        value: `${row.result.wins} / ${row.result.total}`,
                                        color: "var(--text-primary)",
                                      },
                                    ].map((m) => (
                                      <div key={m.label} style={{
                                        backgroundColor: "var(--bg-surface)",
                                        borderRadius: 10,
                                        border: "1px solid var(--border)",
                                        padding: "14px 16px",
                                      }}>
                                        <div style={{
                                          fontSize: 10, fontWeight: 500,
                                          letterSpacing: "0.4px", textTransform: "uppercase",
                                          color: "var(--text-muted)", marginBottom: 8,
                                        }}>
                                          {m.label}
                                        </div>
                                        <div style={{ fontSize: 16, fontWeight: 600, color: m.color }}>
                                          {m.value}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Insight bar */}
                                {chartData && chartData.length >= 2 && row.result && (() => {
                                  const last  = chartData[chartData.length - 1];
                                  const fundC = last.fund;
                                  const bmC   = last.bm;
                                  const score = row.result.score;
                                  const wins  = row.result.wins;
                                  const total = row.result.total;

                                  const insightText =
                                    fundC > bmC && score < 50
                                      ? `הקרן הניבה תשואה מצטברת גבוהה מהבנצ׳מרק, אך עשתה זאת בצורה לא עקבית — ניצחה ב-${wins} מתוך ${total} חודשים בלבד.`
                                      : fundC < bmC && score > 50
                                        ? `הקרן ניצחה את הבנצ׳מרק ב-${wins} מתוך ${total} חודשים, אך התשואה המצטברת שלה נמוכה יותר — הפסדים בחודשים בודדים גדולים גררו את הממוצע למטה.`
                                        : null;

                                  if (!insightText) return null;

                                  return (
                                    <div style={{
                                      borderRadius: 10,
                                      background: "rgba(5,150,105,0.05)",
                                      border: "0.5px solid rgba(5,150,105,0.12)",
                                      color: isDark ? "#34d399" : "#065F46",
                                      padding: "10px 16px",
                                      fontSize: 12,
                                      lineHeight: 1.6,
                                      direction: "rtl",
                                    }}>
                                      {insightText}
                                    </div>
                                  );
                                })()}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          {!loading && (
            <p style={{
              fontSize: 10,
              color: "var(--text-muted)",
              letterSpacing: "0.3px",
              marginTop: 12,
              textAlign: "right",
            }}>
              נתונים חודשיים זמינים: {fundsWithData} קרנות מתוך {totalFunds} בקטגוריה זו
            </p>
          )}

        </div>
      </div>
    </ClientGate>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Export                                                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

export default function ConsistencyPage() {
  return (
    <Suspense>
      <ConsistencyContent />
    </Suspense>
  );
}
