"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import dynamic from "next/dynamic";
import { FundsData, Fund, Benchmark } from "@/lib/types";
import { pct, num, formatDate } from "@/lib/format";
import { useBrand } from "@/lib/useBrand";
import { useClientKey, withClient } from "@/lib/useClientKey";
import { useSearchParams } from "next/navigation";
import { BrandConfig } from "@/config/brand";
import BrandLogo from "@/components/BrandLogo";
import ClientGate from "@/components/ClientGate";
import CompareTable from "@/components/CompareTable";
import { brandCssVars } from "@/lib/colors";

const CompareCharts = dynamic(() => import("@/components/CompareCharts"), { ssr: false });

// ── Palette ──────────────────────────────────────────────────────────────────
const FUND_COLORS = ["#1B3A2F", "#B8975A", "#2563eb", "#9333ea"];

// ── Time range ───────────────────────────────────────────────────────────────
type TimeRange = "ytd" | "12m" | "3y" | "5y" | "max" | "custom";

const ALL_YEAR_KEYS = ["ytd2026", "y2025", "y2024", "y2023", "y2022", "y2021", "y2020", "y2019"];

const YEAR_KEY_TO_NUM: Record<string, number> = {
  ytd2026: 2026, y2025: 2025, y2024: 2024, y2023: 2023,
  y2022: 2022,   y2021: 2021, y2020: 2020, y2019: 2019,
};

/** Returns a date n months offset from base — safe across month-length differences */
function addMonths(base: Date, n: number): string {
  const d = new Date(base.getFullYear(), base.getMonth() + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Converts selected time range to an exact YYYY-MM from/to pair */
function rangeToDateRange(range: TimeRange, from?: string, to?: string): { from: string; to: string } {
  const today = new Date();
  const cur = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  switch (range) {
    case "ytd":    return { from: `${today.getFullYear()}-01`, to: cur };
    case "12m":   return { from: addMonths(today, -11), to: cur };  // 12 data points
    case "3y":    return { from: addMonths(today, -36), to: cur };  // Apr 2023–Apr 2026
    case "5y":    return { from: addMonths(today, -60), to: cur };  // Apr 2021–Apr 2026
    case "max":   return { from: "2019-01", to: cur };
    case "custom": return { from: from || "2022-01", to: to || cur };
  }
}

/** Maps a YYYY-MM date range to the annual year keys needed by CompareTable */
function dateRangeToYearKeys(from: string, to: string): string[] {
  const fromYear = parseInt(from.slice(0, 4));
  const toYear   = parseInt(to.slice(0, 4));
  return ALL_YEAR_KEYS.filter((k) => {
    const y = YEAR_KEY_TO_NUM[k];
    return y >= fromYear && y <= toYear;
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function computeCumulative(fund: Fund, selectedYears: string[]): number | null {
  const vals: number[] = [];
  for (const k of selectedYears) {
    const v = (fund.returns as Record<string, number | null>)[k];
    if (v != null) vals.push(v);
  }
  if (vals.length === 0) return null;
  return vals.reduce((acc, v) => acc * (1 + v), 1) - 1;
}

function computeWinnerIdx(funds: Fund[], selectedYears: string[]): number {
  if (funds.length < 2) return 0;
  const scores = new Array(funds.length).fill(0);
  const metrics: Array<{ get: (f: Fund) => number | null; low?: boolean }> = [
    { get: (f) => f.monthlyReturn },
    { get: (f) => f.avgAnnualReturn },
    { get: (f) => f.sharpe },
    { get: (f) => f.stdDev, low: true },
    { get: (f) => computeCumulative(f, selectedYears) },
  ];
  for (const m of metrics) {
    let bestIdx = -1;
    let bestVal = m.low ? Infinity : -Infinity;
    for (let i = 0; i < funds.length; i++) {
      const v = m.get(funds[i]);
      if (v == null) continue;
      if (m.low ? v < bestVal : v > bestVal) { bestVal = v; bestIdx = i; }
    }
    if (bestIdx >= 0) scores[bestIdx]++;
  }
  return scores.indexOf(Math.max(...scores));
}

function retColor(v: number | null): string {
  if (v == null) return "var(--text-muted)";
  if (v > 0) return "#059669";
  if (v < 0) return "#dc2626";
  return "var(--text-secondary)";
}

function sharpeColor(s: number | null): string {
  if (s == null) return "var(--text-muted)";
  if (s >= 1)    return "#059669";
  if (s >= 0.5)  return "#B8975A";
  return "#dc2626";
}

// ── Month options for custom range ───────────────────────────────────────────
const _today = new Date();
const _toYM = `${_today.getFullYear()}-${String(_today.getMonth() + 1).padStart(2, "0")}`;
const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const CUSTOM_YEARS = Array.from({ length: _today.getFullYear() - 2019 + 1 }, (_, i) => String(2019 + i));

// ── Segmented Control ─────────────────────────────────────────────────────────
const RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: "ytd",    label: "מתחילת שנה" },
  { key: "12m",    label: "12 חודשים" },
  { key: "3y",     label: "3Y" },
  { key: "5y",     label: "5Y" },
  { key: "max",    label: "MAX" },
  { key: "custom", label: "Custom" },
];

function SegmentedControl({ value, onChange, accentColor }: {
  value: TimeRange; onChange: (v: TimeRange) => void; accentColor: string;
}) {
  return (
    <div style={{ display: "inline-flex", borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden" }}>
      {RANGE_OPTIONS.map((o, i) => {
        const active = value === o.key;
        return (
          <button key={o.key} onClick={() => onChange(o.key)} style={{
            padding: "6px 13px", fontSize: 12, fontWeight: active ? 700 : 400,
            border: "none",
            borderRight: i < RANGE_OPTIONS.length - 1 ? "1px solid var(--border)" : "none",
            cursor: "pointer",
            backgroundColor: active ? accentColor : "var(--bg-surface)",
            color: active ? "#fff" : "var(--text-secondary)",
            transition: "all 0.12s", whiteSpace: "nowrap",
          }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Fund Card ─────────────────────────────────────────────────────────────────
function FundCompareCard({ fund, color, isWinner, selectedYears }: {
  fund: Fund; color: string; isWinner: boolean; selectedYears: string[];
}) {
  const cumulative = computeCumulative(fund, selectedYears);
  const metrics = [
    { label: "ממוצע שנתי", value: pct(fund.avgAnnualReturn),  color: retColor(fund.avgAnnualReturn) },
    { label: "שארפ",        value: num(fund.sharpe),           color: sharpeColor(fund.sharpe) },
    { label: "מצטבר",       value: pct(cumulative),            color: retColor(cumulative) },
  ];

  return (
    <div style={{
      backgroundColor: "var(--bg-surface)", borderRadius: 10,
      border: "1px solid var(--border)", borderLeft: `3px solid ${color}`,
      padding: "16px 18px", boxShadow: "var(--shadow-card)",
    }}>
      {/* Winner badge or spacer — fixed height so all cards align */}
      <div style={{ height: 22, marginBottom: 6 }}>
        {isWinner && <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: 0.3 }}>↑ מובילה</span>}
      </div>

      {/* Name + classification */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.35, marginBottom: 3 }}>
          {fund.name}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {fund.classification || "—"}
        </div>
      </div>

      {/* 3 metrics */}
      <div style={{ display: "flex", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        {metrics.map((m, i) => (
          <div key={m.label} style={{
            flex: 1, textAlign: "center",
            borderRight: i < 2 ? "1px solid var(--border)" : "none",
            padding: "0 6px",
          }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: m.color, fontVariantNumeric: "tabular-nums" }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Compare Content ───────────────────────────────────────────────────────────
function CompareContent() {
  const clientKey   = useClientKey();
  const brand       = useBrand(clientKey);
  const searchParams = useSearchParams();
  const fundsParam  = searchParams.get("funds") || "";
  const fundIds     = useMemo(() => fundsParam.split(",").filter(Boolean), [fundsParam]);

  const [data, setData]                   = useState<FundsData | null>(null);
  const [allBenchmarks, setAllBenchmarks] = useState<Benchmark[]>([]);
  const benchmarksParam = searchParams.get("benchmarks") || "";
  const benchmarkIds    = useMemo(() => benchmarksParam.split(",").filter(Boolean), [benchmarksParam]);
  const [selectedBmIds, setSelectedBmIds] = useState<string[]>([]);

  const mode              = brand.features?.comparisonMode ?? "basic";
  const benchmarksEnabled = brand.features?.benchmarks ?? false;
  const comparisonEnabled = brand.features?.comparison ?? true;

  // Time range
  const [timeRange,     setTimeRange]     = useState<TimeRange>("3y");
  const [customFrom,    setCustomFrom]    = useState("2022-01");
  const [customTo,      setCustomTo]      = useState(_toYM);
  const [committedFrom, setCommittedFrom] = useState("2022-01");
  const [committedTo,   setCommittedTo]   = useState(_toYM);

  // Exact YYYY-MM range for chart (monthly data)
  const chartRange = useMemo(
    () => rangeToDateRange(timeRange, committedFrom, committedTo),
    [timeRange, committedFrom, committedTo],
  );

  // Annual year keys derived from chart range — for CompareTable row filtering
  const selectedYears = useMemo(
    () => dateRangeToYearKeys(chartRange.from, chartRange.to),
    [chartRange],
  );

  const selectStyle: React.CSSProperties = {
    padding: "4px 8px", borderRadius: 5, fontSize: 11,
    border: "1px solid var(--border)", cursor: "pointer",
    backgroundColor: "var(--bg-input)", color: "var(--text-primary)",
  };

  useEffect(() => {
    fetch(`/api/funds?client=${encodeURIComponent(clientKey)}`)
      .then((r) => r.json())
      .then(setData);
    if (benchmarksEnabled) {
      fetch(`/api/benchmarks?client=${encodeURIComponent(clientKey)}`)
        .then((r) => r.json())
        .then((bms: Benchmark[]) => {
          setAllBenchmarks(bms);
          if (benchmarkIds.length > 0)
            setSelectedBmIds(benchmarkIds.filter((id) => bms.some((b) => b.id === id)).slice(0, 2));
        });
    }
  }, [clientKey, benchmarksEnabled]);

  const funds: Fund[] = useMemo(() => {
    if (!data || fundIds.length === 0) return [];
    const all: Fund[] = [];
    for (const cat of data.categories)
      for (const f of cat.funds)
        if (fundIds.includes(f.id)) all.push(f);
    return fundIds.map((id) => all.find((f) => f.id === id)).filter(Boolean) as Fund[];
  }, [data, fundIds]);

  const selectedBenchmarks = useMemo(() =>
    selectedBmIds.map((id) => allBenchmarks.find((b) => b.id === id)).filter(Boolean) as Benchmark[],
  [selectedBmIds, allBenchmarks]);

  const toggleBenchmark = (id: string) => setSelectedBmIds((prev) => {
    if (prev.includes(id)) return prev.filter((x) => x !== id);
    if (prev.length >= 2) return prev;
    return [...prev, id];
  });

  const winnerIdx = useMemo(() => computeWinnerIdx(funds, selectedYears), [funds, selectedYears]);

  if (!data)
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>טוען נתונים...</div>;

  if (!comparisonEnabled)
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
        <p>תכונת ההשוואה אינה פעילה עבור לקוח זה.</p>
        <a href={withClient("/", clientKey)} style={{ color: "var(--accent)" }}>חזור לדוח</a>
      </div>
    );

  if (funds.length < 2)
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
        <p>יש לבחור לפחות 2 קרנות להשוואה.</p>
        <a href={withClient("/", clientKey)} style={{ color: "var(--accent)" }}>חזור לדוח</a>
      </div>
    );

  return (
    <ClientGate clientKey={clientKey}>
      <style>{`@media print { @page { size: A4 portrait; margin: 8mm 10mm 14mm 10mm; } }`}</style>
      <div style={{ minHeight: "100vh", ...brandCssVars(brand.primaryColor, brand.accentColor) } as React.CSSProperties}>

        {/* ============ SCREEN VERSION ============ */}
        <div className="no-print">

          {/* 1. Topbar */}
          <div style={{ height: 4, backgroundColor: brand.primaryColor }} />
          <div style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <BrandLogo brand={brand} height={28} variant="light" />
                <span style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 600 }}>השוואת קרנות</span>
                {brand.version && (
                  <span style={{ fontSize: 10, color: "var(--text-muted)", backgroundColor: "var(--bg-input)", padding: "2px 8px", borderRadius: 4, fontWeight: 500 }}>
                    v{brand.version}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => window.print()} style={{
                  backgroundColor: brand.primaryColor, color: "#fff", fontWeight: 700,
                  padding: "6px 18px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12,
                }}>
                  הדפסה / PDF
                </button>
                <a href={withClient("/", clientKey)} style={{
                  fontSize: 12, color: "var(--text-secondary)", textDecoration: "none",
                  padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)",
                }}>
                  ← חזור לרשימה
                </a>
              </div>
            </div>
          </div>

          {/* 2. Hero — segmented control only */}
          <div style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 24px 14px" }}>

              {/* Title + Segmented Control */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }} dir="rtl">
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
                  תשואות שנתיות לאורך זמן
                </span>
                <SegmentedControl value={timeRange} onChange={(range) => {
                if (range === "custom") {
                  // Initialize custom selectors from the current chart range — don't jump to hardcoded 2022-01
                  setCustomFrom(chartRange.from);
                  setCustomTo(chartRange.to);
                  setCommittedFrom(chartRange.from);
                  setCommittedTo(chartRange.to);
                }
                setTimeRange(range);
              }} accentColor={brand.primaryColor} />
              </div>

              {/* Custom range row */}
              {timeRange === "custom" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }} dir="rtl">
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>מ-</span>
                  <select value={customFrom.slice(5, 7)} onChange={(e) => setCustomFrom(`${customFrom.slice(0, 4)}-${e.target.value}`)} style={selectStyle}>
                    {MONTHS_HE.map((name, i) => <option key={i} value={String(i + 1).padStart(2, "0")}>{name}</option>)}
                  </select>
                  <select value={customFrom.slice(0, 4)} onChange={(e) => setCustomFrom(`${e.target.value}-${customFrom.slice(5, 7)}`)} style={selectStyle}>
                    {CUSTOM_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>עד</span>
                  <select value={customTo.slice(5, 7)} onChange={(e) => setCustomTo(`${customTo.slice(0, 4)}-${e.target.value}`)} style={selectStyle}>
                    {MONTHS_HE.map((name, i) => <option key={i} value={String(i + 1).padStart(2, "0")}>{name}</option>)}
                  </select>
                  <select value={customTo.slice(0, 4)} onChange={(e) => setCustomTo(`${e.target.value}-${customTo.slice(5, 7)}`)} style={selectStyle}>
                    {CUSTOM_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <button
                    onClick={() => { setCommittedFrom(customFrom); setCommittedTo(customTo); }}
                    style={{ padding: "5px 16px", borderRadius: 6, fontSize: 12, cursor: "pointer", backgroundColor: brand.primaryColor, color: "#fff", border: "none", fontWeight: 600 }}
                  >
                    הצג
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 3. Content — chart + cards + table, all same padding */}
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>

            {/* Chart — monthly data when available, annual fallback */}
            <CompareCharts
              funds={funds}
              accentColor={brand.primaryColor}
              from={chartRange.from}
              to={chartRange.to}
              benchmarks={selectedBenchmarks}
            />

            {/* Fund cards */}
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(funds.length, 4)}, 1fr)`,
              gap: 16,
              marginTop: 28,
              marginBottom: 24,
            }}>
              {funds.map((fund, i) => (
                <FundCompareCard
                  key={fund.id}
                  fund={fund}
                  color={FUND_COLORS[i % FUND_COLORS.length]}
                  isWinner={i === winnerIdx}
                  selectedYears={selectedYears}
                />
              ))}
            </div>

            {/* Benchmark selector */}
            {benchmarksEnabled && allBenchmarks.length > 0 && (
              <div style={{
                backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "12px 16px", marginBottom: 20,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>📊 מדדי ייחוס (עד 2)</span>
                  {selectedBmIds.length > 0 && (
                    <button onClick={() => setSelectedBmIds([])} style={{
                      fontSize: 10, padding: "3px 10px", borderRadius: 4,
                      border: "1px solid var(--border)", backgroundColor: "var(--bg-surface-alt)",
                      color: "var(--text-secondary)", cursor: "pointer",
                    }}>נקה</button>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {allBenchmarks.map((bm) => {
                    const active = selectedBmIds.includes(bm.id);
                    const atMax  = selectedBmIds.length >= 2 && !active;
                    return (
                      <button key={bm.id} onClick={() => toggleBenchmark(bm.id)} disabled={atMax} style={{
                        padding: "5px 14px", borderRadius: 6, fontSize: 12,
                        cursor: atMax ? "default" : "pointer",
                        border: `1px solid ${active ? "#6366f1" : "var(--border)"}`,
                        backgroundColor: active ? "#6366f115" : "var(--bg-surface)",
                        color: active ? "#6366f1" : atMax ? "var(--text-muted)" : "var(--text-secondary)",
                        fontWeight: active ? 700 : 400, opacity: atMax ? 0.4 : 1, transition: "all 0.15s",
                      }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, direction: "ltr" }}>
                          <span>{bm.currency === "USD" ? "$" : "₪"}</span>
                          <span>{bm.name}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. Compare table */}
            <CompareTable
              funds={funds}
              accentColor={brand.primaryColor}
              selectedYears={selectedYears}
              benchmarks={selectedBenchmarks}
              fundColors={funds.map((_, i) => i === 0 ? brand.primaryColor : FUND_COLORS[i])}
            />

            {/* Disclaimer */}
            {brand.footerDisclaimer && (
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  backgroundColor: "var(--bg-surface-alt)", borderRadius: 8, padding: "12px 18px",
                  fontSize: 10, color: "var(--text-muted)", lineHeight: 1.6,
                  border: "1px solid var(--border)", whiteSpace: "pre-line",
                }}>
                  {brand.footerDisclaimer}
                </div>
              </div>
            )}

            <div style={{ textAlign: "center", padding: "8px 0 20px", fontSize: 10, color: "var(--text-muted)" }}>
              {brand.showCredit && brand.creditText ? `All rights reserved — ${brand.creditText}` : brand.fullName ? `© ${brand.fullName}` : ""}
            </div>
          </div>
        </div>

        {/* ============ PRINT VERSION ============ */}
        <ComparePrint funds={funds} brand={brand} lastUpdated={data.lastUpdated} mode={mode} selectedYears={selectedYears} chartFrom={chartRange.from} chartTo={chartRange.to} benchmarks={selectedBenchmarks} />
      </div>
    </ClientGate>
  );
}

function ComparePrint({ funds, brand, lastUpdated, mode, selectedYears, chartFrom, chartTo, benchmarks }: {
  funds: Fund[];
  brand: BrandConfig;
  lastUpdated: string;
  mode: "basic" | "advanced";
  selectedYears?: string[];
  chartFrom?: string;
  chartTo?: string;
  benchmarks?: Benchmark[];
}) {
  const currentYear = new Date().getFullYear();
  const winnerIdx = computeWinnerIdx(funds, selectedYears || []);

  return (
    <div className="print-only" style={{ width: "100%", background: "white", color: "#1a1f2b", fontFamily: "Assistant, Arial, sans-serif", display: "flex", flexDirection: "column", height: "267mm", padding: "0 10mm", boxSizing: "border-box" }}>

      {/* ── Header ── */}
      <div style={{ position: "relative", textAlign: "center", marginBottom: 10, paddingBottom: 8, borderBottom: `2px solid ${brand.primaryColor}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logoLight || brand.logo || ""} alt={brand.name || ""}
          style={{ maxHeight: 32, width: "auto", objectFit: "contain" }} />
        <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", fontSize: "7pt", color: "#8893a4" }}>
          מעודכן ל: {formatDate(lastUpdated)}
        </div>
      </div>

      {/* ── Title ── */}
      <div style={{ textAlign: "center", marginBottom: 14 }}>
        <span style={{ fontSize: "16pt", color: brand.primaryColor, fontWeight: 700, letterSpacing: "0.5px" }}>
          השוואת קרנות
        </span>
      </div>

      {/* ── Table ── */}
      <CompareTable funds={funds} accentColor={brand.primaryColor} compact
        selectedYears={selectedYears} benchmarks={benchmarks}
        winnerIdx={winnerIdx} isPrint />

      {/* ── Chart ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", paddingTop: "0", paddingBottom: "0" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
          <CompareCharts funds={funds} accentColor={brand.primaryColor} compact benchmarks={benchmarks} from={chartFrom} to={chartTo} />
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="print-footer" style={{ borderTop: "1px solid #e5e7eb", padding: "6px 8px", background: "white", marginTop: "auto" }}>
        {brand.footerDisclaimer && (
          <div style={{ fontSize: "4.5pt", color: "#666", lineHeight: 1.4, marginBottom: 4 }}>
            {brand.footerDisclaimer}
          </div>
        )}
        <div style={{ fontSize: "5pt", color: "#999", textAlign: "center" }}>
          {brand.fullName ? `© ${currentYear} ${brand.fullName}. כל הזכויות שמורות` : `© ${currentYear}`}
          {brand.version ? ` | גרסה ${brand.version}` : ""}
          {brand.showCredit && brand.creditText ? ` | ${brand.creditText}` : ""}
        </div>
      </div>

    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>טוען...</div>}>
      <CompareContent />
    </Suspense>
  );
}
