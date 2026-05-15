"use client";

import { useEffect, useState, useMemo, Suspense, useRef } from "react";
import dynamic from "next/dynamic";
import { FundsData, Fund, Benchmark } from "@/lib/types";
import { sortBenchmarks } from "@/lib/benchmarkSort";
import { pct, num, formatDate, formatReportDate } from "@/lib/format";
import { getAvgAnnualReturn, getLastUpdated, getLatestMonthly, getLatestMonthAcrossFunds } from "@/lib/fundDerived";
import { useBrand } from "@/lib/useBrand";
import { useClientKey, withClient } from "@/lib/useClientKey";
import { useSearchParams } from "next/navigation";
import { BrandConfig } from "@/config/brand";
import ClientGate from "@/components/ClientGate";
import SubTabsBar from "@/components/SubTabsBar";
import CompareSummary from "@/components/CompareSummary"; // print only
import CompareTable from "@/components/CompareTable";
import { brandCssVars } from "@/lib/colors";
import DateRangePicker, { DateRangeValue } from "@/components/DateRangePicker";
import { rangeToDateRange, DEFAULT_RANGE } from "@/lib/dateRange";

const CompareCharts  = dynamic(() => import("@/components/CompareCharts"),  { ssr: false });
const CompareYearBars = dynamic(() => import("@/components/CompareYearBars"), { ssr: false });

// ── Palette ──────────────────────────────────────────────────────────────────
const FUND_COLORS = ["#1B3A2F", "#B8975A", "#2563eb", "#9333ea"];

// ── fallback "now" for when latestMonth not yet loaded ────────────────────────
const _today = new Date();
const _toYM  = `${_today.getFullYear()}-${String(_today.getMonth() + 1).padStart(2, "0")}`;

const ALL_YEAR_KEYS = ["ytd2026", "y2025", "y2024", "y2023", "y2022", "y2021", "y2020", "y2019"];

const YEAR_KEY_TO_NUM: Record<string, number> = {
  ytd2026: 2026, y2025: 2025, y2024: 2024, y2023: 2023,
  y2022: 2022,   y2021: 2021, y2020: 2020, y2019: 2019,
};

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
    { get: (f) => getLatestMonthly(f) },
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


// ── Year Buttons (year-mode — NOX) ───────────────────────────────────────────
const YEAR_BTN_OPTIONS: { key: string; label: string }[] = [
  { key: "2020",    label: "2020" },
  { key: "2021",    label: "2021" },
  { key: "2022",    label: "2022" },
  { key: "2023",    label: "2023" },
  { key: "2024",    label: "2024" },
  { key: "2025",    label: "2025" },
  { key: "ytd2026", label: "YTD 2026" },
];
type YearBtnKey = typeof YEAR_BTN_OPTIONS[number]["key"];

function YearButtons({ values, onToggle, accentColor }: {
  values: YearBtnKey[]; onToggle: (v: YearBtnKey) => void; accentColor: string;
}) {
  return (
    <div style={{ display: "inline-flex", borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden" }}>
      {YEAR_BTN_OPTIONS.map((o, i) => {
        const active = values.includes(o.key);
        return (
          <button key={o.key} onClick={() => onToggle(o.key)} style={{
            padding: "6px 13px", fontSize: 12, fontWeight: active ? 700 : 400,
            border: "none",
            borderRight: i < YEAR_BTN_OPTIONS.length - 1 ? "1px solid var(--border)" : "none",
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
function FundCompareCard({ fund, color, isWinner, selectedYears, isYearMode }: {
  fund: Fund; color: string; isWinner: boolean; selectedYears: string[]; isYearMode: boolean;
}) {
  const cumulative = computeCumulative(fund, selectedYears);
  const lastUpdated = getLastUpdated(fund);
  const metrics = [
    { label: "תשואה ממוצעת שנתית", value: pct(getAvgAnnualReturn(fund)), color: retColor(getAvgAnnualReturn(fund)) },
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
      <div style={{ marginBottom: lastUpdated ? 8 : 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.35, marginBottom: 3 }}>
          {fund.name}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {fund.classification || "—"}
        </div>
      </div>

      {/* Update date */}
      {lastUpdated && (
        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>
          {isYearMode ? "עודכן לאחרונה" : "מעודכן ל"}: {formatReportDate(lastUpdated)}
        </div>
      )}

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
  const [rangeValue, setRangeValue] = useState<DateRangeValue>({ range: DEFAULT_RANGE });
  const [showPrint,  setShowPrint]  = useState(false);

  // Year mode: when no fund has monthlyReturns (e.g. NOX)
  const [isYearMode, setIsYearMode]             = useState(false);
  const [selectedYearKeys, setSelectedYearKeys] = useState<YearBtnKey[]>(["2025"]);
  const modeDetected = useRef(false);

  const toggleYear = (k: YearBtnKey) => {
    setSelectedYearKeys((prev) => {
      if (prev.includes(k)) {
        if (prev.length === 1) return prev; // must keep at least one
        return prev.filter((x) => x !== k);
      }
      return [...prev, k];
    });
  };

  // Chronologically sorted (for chart legend + stable cards/table reference)
  const sortedYearKeys = useMemo(() => {
    const yearNum = (k: string) => (k === "ytd2026" ? 2026 : parseInt(k));
    return [...selectedYearKeys].sort((a, b) => yearNum(a) - yearNum(b));
  }, [selectedYearKeys]);

  useEffect(() => {
    fetch(`/api/funds?client=${encodeURIComponent(clientKey)}`)
      .then((r) => r.json())
      .then(setData);
    if (benchmarksEnabled) {
      fetch(`/api/benchmarks?client=${encodeURIComponent(clientKey)}`)
        .then((r) => r.json())
        .then((bms: Benchmark[]) => {
          setAllBenchmarks(sortBenchmarks(bms));
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

  // Detect year-mode once funds arrive (no monthly data → NOX)
  useEffect(() => {
    if (modeDetected.current || funds.length === 0) return;
    const hasMonthly = funds.some(f => f.monthlyReturns && Object.keys(f.monthlyReturns).length > 0);
    if (!hasMonthly) setIsYearMode(true);
    modeDetected.current = true;
  }, [funds]);

  // Latest month with actual fund data — used to anchor preset ranges
  const latestMonth = useMemo(
    () => getLatestMonthAcrossFunds(funds),
    [funds],
  );

  // Exact YYYY-MM range for chart (non-year-mode only — year mode uses its own bar chart)
  const chartRange = useMemo(() => {
    const r = rangeToDateRange(rangeValue.range, latestMonth, rangeValue.from, rangeValue.to);
    return r ?? { from: "2019-01", to: latestMonth ?? _toYM };
  }, [rangeValue, latestMonth]);

  // Year keys for cards/table — first selected year in year mode
  const selectedYears = useMemo(() => {
    if (isYearMode) {
      const k = selectedYearKeys[0];
      return [k === "ytd2026" ? "ytd2026" : `y${k}`];
    }
    return dateRangeToYearKeys(chartRange.from, chartRange.to);
  }, [isYearMode, selectedYearKeys, chartRange]);

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

        {/* Sub-tabs row */}
        <SubTabsBar
          client={clientKey}
          active="השוואה"
          features={brand.features}
          primaryColor={brand.primaryColor || "#1B3A2F"}
          slot={
            <button
              onClick={() => { setShowPrint(true); setTimeout(() => window.print(), 300); }}
              style={{ backgroundColor: brand.primaryColor, color: "#fff", fontWeight: 700, padding: "6px 18px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12 }}
            >
              הדפסה / PDF
            </button>
          }
        />

        {/* ============ SCREEN VERSION ============ */}
        <div className="no-print">

          {/* Hero — segmented control only */}
          <div style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 24px 14px" }}>

              {/* Title + Segmented Control / Year Buttons */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }} dir="rtl">
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
                  תשואות שנתיות לאורך זמן
                </span>
                {isYearMode ? (
                  <YearButtons values={selectedYearKeys} onToggle={toggleYear} accentColor={brand.primaryColor} />
                ) : (
                  <DateRangePicker
                    value={rangeValue}
                    onChange={setRangeValue}
                    latestAvailableMonth={latestMonth}
                    syncToUrl={true}
                  />
                )}
              </div>
            </div>
          </div>

          {/* 3. Content — chart + cards + table, all same padding */}
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>

            {/* Chart — bar chart in year mode, line chart otherwise */}
            {isYearMode ? (
              <CompareYearBars
                funds={funds}
                yearKeys={sortedYearKeys}
                accentColor={brand.primaryColor}
              />
            ) : (
              <CompareCharts
                funds={funds}
                accentColor={brand.primaryColor}
                from={chartRange.from}
                to={chartRange.to}
                benchmarks={selectedBenchmarks}
              />
            )}

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
                  isYearMode={isYearMode}
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
              fromYYYYMM={isYearMode ? undefined : chartRange.from}
              toYYYYMM={isYearMode ? undefined : chartRange.to}
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
        {showPrint && <ComparePrint funds={funds} brand={brand} lastUpdated={data.lastUpdated} mode={mode} selectedYears={selectedYears} chartFrom={chartRange.from} chartTo={chartRange.to} benchmarks={selectedBenchmarks} />}
      </div>
    </ClientGate>
  );
}

/* ================================================================== */
/*  Print-only comparison report — UNTOUCHED                           */
/* ================================================================== */
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

  return (
    <div className="print-only" style={{ width: "100%", background: "white", color: "#1a1f2b" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8pt", lineHeight: 1.4 }}>
        <thead>
          {/* === HEADER ROW 1: Logo + Date === */}
          <tr>
            <td style={{ padding: "6px 8px 4px", background: "white" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody><tr>
                <td style={{ textAlign: "right", verticalAlign: "middle" }}>
                  <span style={{ fontSize: "7pt", color: "#8893a4", whiteSpace: "nowrap" }}>מעודכן ל: {formatDate(lastUpdated)}</span>
                </td>
                <td style={{ textAlign: "left", verticalAlign: "middle", width: "120px" }}>
                  {(brand.logoLight || brand.logo) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={brand.logoLight || brand.logo} alt={brand.name || ""} style={{ maxHeight: 30, width: "auto", objectFit: "contain" }} />
                  )}
                </td>
              </tr></tbody></table>
            </td>
          </tr>
          {/* === HEADER ROW 2: Title === */}
          <tr>
            <td style={{ padding: "2px 0 8px", borderBottom: `2px solid ${brand.secondaryColor}`, background: "white", textAlign: "center" }}>
              <span style={{ fontSize: "14pt", color: brand.primaryColor, fontWeight: 700, letterSpacing: "0.5px" }}>
                השוואת קרנות
              </span>
            </td>
          </tr>
          {/* Spacer */}
          <tr><td style={{ height: 8, padding: 0, border: "none", background: "white", lineHeight: 0, fontSize: 0 }} /></tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: 0 }}>
              {/* Compact summary strip */}
              <CompareSummary funds={funds} accentColor={brand.primaryColor} compact selectedYears={selectedYears} />

              {/* Comparison table */}
              <CompareTable funds={funds} accentColor={brand.primaryColor} compact selectedYears={selectedYears} benchmarks={benchmarks} fromYYYYMM={chartFrom} toYYYYMM={chartTo} />

              {/* Divider between table and chart */}
              {mode === "advanced" && (
                <>
                  <div style={{ borderTop: "1px solid #dfe3e8", margin: "10px 0" }} />
                  <CompareCharts funds={funds} accentColor={brand.primaryColor} compact benchmarks={benchmarks} from={chartFrom} to={chartTo} />
                </>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Fixed print footer */}
      <div className="print-footer" style={{ borderTop: "1px solid #ccc" }}>
        {brand.footerDisclaimer && (
          <div style={{ padding: "3px 8px", fontSize: "4.5pt", color: "#666", lineHeight: 1.3, background: "white" }}>
            {brand.footerDisclaimer}
          </div>
        )}
        <div style={{ padding: "2px 8px 3px", fontSize: "5pt", color: "#999", textAlign: "center", background: "white", borderTop: brand.footerDisclaimer ? "1px solid #e5e5e5" : "none" }}>
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
