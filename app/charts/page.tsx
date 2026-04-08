"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip,
  CartesianGrid, Cell, ZAxis, Label, LabelList,
  ReferenceLine, ReferenceArea,
} from "recharts";
import { FundsData, Fund } from "@/lib/types";
import { ThemeToggle } from "@/components/ThemeProvider";
import { formatDate } from "@/lib/format";
import { useBrand } from "@/lib/useBrand";
import { useClientKey, withClient } from "@/lib/useClientKey";
import BrandLogo from "@/components/BrandLogo";
import ClientGate from "@/components/ClientGate";
import { brandCssVars } from "@/lib/colors";
import { useFilters } from "@/lib/useFilters";
import FilterBar from "@/components/FilterBar";

/* ------------------------------------------------------------------ */
/*  Year range helpers                                                  */
/* ------------------------------------------------------------------ */
const ALL_YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

const YEAR_KEYS: Partial<Record<number, keyof Fund["returns"]>> = {
  2019: "y2019", 2020: "y2020", 2021: "y2021", 2022: "y2022",
  2023: "y2023", 2024: "y2024", 2025: "y2025", 2026: "ytd2026",
};

function computeRangeReturn(fund: Fund, fromYear: number, toYear: number): number | null {
  const vals: number[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    const key = YEAR_KEYS[y];
    if (!key) continue;
    const v = fund.returns[key];
    if (v !== null && v !== undefined) vals.push(v);
  }
  if (vals.length === 0) return null;
  const product = vals.reduce((acc, v) => acc * (1 + v), 1);
  return Math.pow(product, 1 / vals.length) - 1;
}

function yearLabel(y: number) {
  return y === 2026 ? "2026 (YTD)" : String(y);
}

/* ------------------------------------------------------------------ */
/*  Scatter helpers                                                    */
/* ------------------------------------------------------------------ */
interface ScatterPoint {
  idx: number;
  name: string;
  x: number;
  y: number;
  sharpe: number | null;
  aum: number | null;
  rank: "top" | "bottom" | "normal";
  currency?: "ILS" | "USD";
}

type ValidPoint = Omit<ScatterPoint, "rank" | "idx">;

function buildScatterData(funds: Fund[], fromYear: number, toYear: number): ScatterPoint[] {
  const valid: ValidPoint[] = [];
  for (const f of funds) {
    const ret = computeRangeReturn(f, fromYear, toYear);
    if (ret === null || f.stdDev === null) continue;
    valid.push({ name: f.name, x: ret * 100, y: f.stdDev * 100, sharpe: f.sharpe, aum: f.aumMillions, currency: f.currency });
  }

  const withSharpe = valid.filter((p) => p.sharpe !== null);
  const sortedBySharpe = [...withSharpe].sort((a, b) => (b.sharpe ?? -Infinity) - (a.sharpe ?? -Infinity));
  const topNames = new Set(sortedBySharpe.slice(0, 2).map((p) => p.name));
  const bottomNames = new Set(sortedBySharpe.slice(-2).map((p) => p.name));

  return valid.map((p, i) => ({
    ...p,
    idx: i + 1,
    rank: p.sharpe !== null && topNames.has(p.name) ? "top" as const
        : p.sharpe !== null && bottomNames.has(p.name) ? "bottom" as const
        : "normal" as const,
  }));
}

const COLORS = { top: "#1B3A2F", bottom: "#dc2626", normal: "#64748b" };

/* ── AUM → dot radius ── */
function dotRadius(aum: number | null): number {
  if (aum === null) return 5;
  if (aum > 2000) return 10;
  if (aum >= 500) return 7;
  return 5;
}

/* ── Sharpe badge helper ── */
function SharpeBadge({ value }: { value: number | null }) {
  if (value === null) return <span style={{ color: "#94a3b8" }}>—</span>;
  let bg: string, fg: string;
  if (value >= 2) { bg = "#DCFCE7"; fg = "#166534"; }
  else if (value >= 1) { bg = "#FEF9C3"; fg = "#854D0E"; }
  else { bg = "#FEE2E2"; fg = "#991B1B"; }
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 999,
      backgroundColor: bg, color: fg, fontSize: 11, fontWeight: 600, lineHeight: 1.5,
    }}>
      {value.toFixed(2)}
    </span>
  );
}

/* ── Explanation block ── */
function ChartExplanation() {
  return (
    <div className="no-print" style={{
      backgroundColor: "#F8FAFC", borderRadius: 10,
      padding: "12px 18px", marginBottom: 12, fontSize: 12,
      color: "#64748B", lineHeight: 1.7, direction: "rtl",
      border: "1px solid #e2e8f0",
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: "#1B3A2F", fontSize: 13 }}>הסבר הגרף</div>
      <div>ציר אופקי — תשואה שנתית ממוצעת &nbsp;|&nbsp; ציר אנכי — סטיית תקן</div>
      <div>
        <span style={{ color: "#1B3A2F", fontWeight: 600 }}>ירוק</span> = שארפ גבוה &nbsp;|&nbsp;
        <span style={{ color: "#dc2626", fontWeight: 600 }}>אדום</span> = שארפ נמוך &nbsp;|&nbsp;
        קווים מקווקווים = ממוצע הקטגוריה &nbsp;|&nbsp;
        גודל נקודה = AUM
      </div>
    </div>
  );
}

/* ── Insights block ── */
function InsightsBlock({
  points, avgX, avgY, currencyFilter,
}: {
  points: ScatterPoint[];
  avgX: number;
  avgY: number;
  currencyFilter: "all" | "ILS" | "USD";
}) {
  if (points.length < 2) return null;

  const sentences: string[] = [];

  const returns = points.map((p) => p.x);
  const minR = Math.min(...returns);
  const maxR = Math.max(...returns);
  sentences.push(`טווח התשואות בקטגוריה: ${minR.toFixed(1)}%–${maxR.toFixed(1)}% (פיזור של ${(maxR - minR).toFixed(1)}%)`);

  const holyGrail = points.filter((p) => p.x > avgX && p.y < avgY);
  if (holyGrail.length > 0) {
    sentences.push(`${holyGrail.length} קרנות בגביע הקדוש — תשואה גבוהה עם סיכון נמוך`);
  } else {
    sentences.push("אין קרנות בגביע הקדוש בתקופה זו");
  }

  const withSharpe = points.filter((p) => p.sharpe !== null);
  if (withSharpe.length > 0) {
    const best = withSharpe.reduce((a, b) => (b.sharpe! > a.sharpe! ? b : a));
    sentences.push(
      `הקרן הבולטת: ${best.name} — שארפ ${best.sharpe!.toFixed(2)}, תשואה ${best.x.toFixed(2)}%, סטיית תקן ${best.y.toFixed(2)}%`
    );
  }

  if (currencyFilter === "all") {
    const currencies = new Set(points.map((p) => p.currency).filter(Boolean));
    if (currencies.size >= 2) {
      sentences.push("⚠️ הגרף כולל קרנות בשקל ובדולר — ההשוואה עלולה להיות מטעה");
    }
  }

  return (
    <div className="no-print" style={{
      backgroundColor: "#F0FDF4", borderRadius: 10, padding: "14px 18px",
      border: "1px solid #bbf7d0", direction: "rtl",
      maxWidth: 710, margin: "14px auto 0",
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#14532d", marginBottom: 10 }}>תובנות אוטומטיות</div>
      {sentences.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6, fontSize: 12, color: "#166534", lineHeight: 1.6 }}>
          <span style={{ color: "#1B3A2F", fontWeight: 700, flexShrink: 0, marginTop: 1 }}>●</span>
          <span>{s}</span>
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Main Page                                                          */
/* ================================================================== */
function ChartsContent() {
  const clientKey = useClientKey();
  const [data, setData] = useState<FundsData | null>(null);
  const brand = useBrand(clientKey);

  const [fromYear, setFromYear] = useState<number>(2020);
  const [toYear, setToYear] = useState<number>(2025);
  const [currencyFilter, setCurrencyFilter] = useState<"all" | "ILS" | "USD">("all");

  useEffect(() => {
    fetch(`/api/funds?client=${encodeURIComponent(clientKey)}`).then((r) => r.json()).then((d: FundsData) => {
      setData(d);
    });
  }, [clientKey]);

  const {
    group, category, classification, search,
    options, setFilter, clearAll, filtered, activeFilterCount, ALL,
  } = useFilters(data?.categories || []);

  const funds = useMemo(
    () => filtered.flatMap((cat) => cat.funds),
    [filtered],
  );

  const fundsByCurrency = useMemo(() => {
    if (currencyFilter === "all") return funds;
    return funds.filter((f) => f.currency === currencyFilter);
  }, [funds, currencyFilter]);

  const selectedCategoryLabel = useMemo(() => {
    if (category !== ALL) return category;
    if (group !== ALL) return group;
    return "כל הקרנות";
  }, [group, category, ALL]);

  const periodLabel = useMemo(() => {
    if (fromYear === toYear) return yearLabel(fromYear);
    return `${fromYear}–${toYear}`;
  }, [fromYear, toYear]);

  const points = useMemo(
    () => buildScatterData(fundsByCurrency, fromYear, toYear),
    [fundsByCurrency, fromYear, toYear],
  );
  const topFunds = points.filter((p) => p.rank === "top");
  const bottomFunds = points.filter((p) => p.rank === "bottom");

  const avgX = points.length > 0 ? points.reduce((s, p) => s + p.x, 0) / points.length : 0;
  const avgY = points.length > 0 ? points.reduce((s, p) => s + p.y, 0) / points.length : 0;

  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "#64748B" }}>טוען נתונים...</div>;

  const selectStyle: React.CSSProperties = {
    fontSize: 12, padding: "6px 12px", borderRadius: 8,
    border: "1px solid #e2e8f0", backgroundColor: "#fff",
    color: "#1B3A2F", cursor: "pointer", fontWeight: 500,
  };

  return (
    <ClientGate clientKey={clientKey}>
    <style>{`@media print { @page { size: A4 portrait; margin: 8mm 10mm 16mm 10mm; } }`}</style>
    <div style={{ minHeight: "100vh", backgroundColor: "#FAFBFC", ...brandCssVars(brand.primaryColor, brand.accentColor) } as React.CSSProperties}>
      {/* Thin brand color bar */}
      <div style={{ height: 3, background: `linear-gradient(90deg, #1B3A2F 0%, #B8975A 100%)` }} />

      {/* Header — screen only */}
      <div className="no-print" style={{ backgroundColor: "#fff", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <BrandLogo brand={brand} height={28} variant="light" />
          </div>
          <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>עדכון: {formatDate(data.lastUpdated)}</span>
            {brand.version && (
              <span style={{ fontSize: 10, color: "#94a3b8", backgroundColor: "#f1f5f9", padding: "2px 8px", borderRadius: 4, fontWeight: 500 }}>
                v{brand.version}
              </span>
            )}
            <button
              onClick={() => window.print()}
              style={{ backgroundColor: "#1B3A2F", color: "#fff", fontWeight: 600, padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, letterSpacing: "0.02em" }}
            >
              הדפסה / PDF
            </button>
            <a href={withClient("/", clientKey)} style={{ fontSize: 12, color: "#64748B", textDecoration: "none", padding: "5px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontWeight: 500 }}>דוח</a>
            {brand.features?.dataCompletion && (
              <a href={withClient("/data-completion", clientKey)} style={{ fontSize: 12, color: "#64748B", textDecoration: "none", padding: "5px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontWeight: 500 }}>השלמת נתונים</a>
            )}
            <a href={withClient("/admin", clientKey)} style={{ fontSize: 12, color: "#64748B", textDecoration: "none", padding: "5px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontWeight: 500 }}>ניהול</a>
            <ThemeToggle />
          </div>
          <div className="print-only" style={{ fontSize: 12, color: "#1B3A2F" }}>
            עדכון: {formatDate(data.lastUpdated)}
          </div>
        </div>
      </div>

      {/* ── Hero title — upgrade 5 ── */}
      <div className="no-print" style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 0", direction: "rtl" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1B3A2F", margin: 0, letterSpacing: "-0.01em" }}>סיכון מול תשואה</h1>
        <p style={{ fontSize: 14, color: "#64748B", margin: "6px 0 0", fontWeight: 400 }}>ניתוח השוואתי של קרנות השקעה לפי קטגוריה ותקופה</p>
      </div>

      {/* ── Unified filter area — upgrade 6 ── */}
      <div className="no-print" style={{
        maxWidth: 1100, margin: "20px auto 0", padding: "20px 24px",
        backgroundColor: "#F8FAFC", borderRadius: 12, border: "1px solid #e2e8f0",
        direction: "rtl",
      }}>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* Group: Category filters */}
          <div style={{ flex: "1 1 auto", minWidth: 300 }}>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>קטגוריה</div>
            <FilterBar
              group={group}
              category={category}
              classification={classification}
              search={search}
              options={options}
              activeFilterCount={activeFilterCount}
              onGroupChange={(v) => setFilter("group", v)}
              onCategoryChange={(v) => setFilter("category", v)}
              onClassificationChange={(v) => setFilter("classification", v)}
              onSearchChange={(v) => setFilter("search", v)}
              onClearAll={clearAll}
              accentColor="#1B3A2F"
            />
          </div>

          {/* Divider */}
          <div style={{ width: 1, alignSelf: "stretch", backgroundColor: "#e2e8f0", minHeight: 40 }} />

          {/* Group: Period */}
          <div>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>תקופה</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <select
                value={fromYear}
                onChange={(e) => { const v = Number(e.target.value); setFromYear(v); if (v > toYear) setToYear(v); }}
                style={selectStyle}
              >
                {ALL_YEARS.map((y) => <option key={y} value={y}>{yearLabel(y)}</option>)}
              </select>
              <span style={{ fontSize: 14, color: "#94a3b8" }}>—</span>
              <select
                value={toYear}
                onChange={(e) => setToYear(Number(e.target.value))}
                style={selectStyle}
              >
                {ALL_YEARS.filter((y) => y >= fromYear).map((y) => <option key={y} value={y}>{yearLabel(y)}</option>)}
              </select>
            </div>
          </div>

          {/* Divider */}
          <div style={{ width: 1, alignSelf: "stretch", backgroundColor: "#e2e8f0", minHeight: 40 }} />

          {/* Group: Currency */}
          <div>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>מטבע</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {(["all", "ILS", "USD"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrencyFilter(c)}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 8,
                    border: "1px solid", cursor: "pointer", transition: "all 0.15s",
                    backgroundColor: currencyFilter === c ? "#1B3A2F" : "#fff",
                    color: currencyFilter === c ? "#fff" : "#64748B",
                    borderColor: currencyFilter === c ? "#1B3A2F" : "#e2e8f0",
                  }}
                >
                  {c === "all" ? "הכל" : c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px" }}>

      {/* All content in one table — thead repeats on every printed page */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead className="print-only">
          <tr><td style={{ padding: 0, borderBottom: `2px solid ${brand.secondaryColor}`, background: "white" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody><tr>
              <td style={{ width: "120px", textAlign: "right", verticalAlign: "middle", padding: "6px 8px" }}>
                <span style={{ fontSize: "7pt", color: "#64748B", whiteSpace: "nowrap" }}>מעודכן ל: {formatDate(data.lastUpdated)}</span>
              </td>
              <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                <span style={{ fontSize: "11pt", color: "#1B3A2F", fontWeight: 700 }}>סיכון מול תשואה</span>
              </td>
              <td style={{ width: "120px", textAlign: "left", verticalAlign: "middle", padding: "6px 8px" }}>
                {(brand.logoLight || brand.logo) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={brand.logoLight || brand.logo} alt={brand.name || ""} style={{ maxHeight: 32, width: "auto", objectFit: "contain" }} />
                )}
              </td>
            </tr></tbody></table>
          </td></tr>
          <tr><td style={{ height: 14, padding: 0, border: "none", background: "white", lineHeight: 0, fontSize: 0 }} /></tr>
        </thead>
        <tbody>
          {/* 1. Category title (print) */}
          <tr><td style={{ textAlign: "center", padding: "20px 0 10px" }}>
            <span className="print-only" style={{ fontSize: "13pt", fontWeight: 700, color: "#B8975A", borderBottom: "2px solid #B8975A", paddingBottom: 4 }}>
              {selectedCategoryLabel}
            </span>
          </td></tr>

          {/* 2. Explanation + Period info + Chart */}
          <tr><td style={{ padding: "24px 0 0" }}>
            <ChartExplanation />
            {/* Period display */}
            <div style={{
              fontSize: 13, color: "#64748B", direction: "rtl",
              marginBottom: 14, textAlign: "center",
            }}>
              מציג נתונים לתקופה:&nbsp;
              <strong style={{ color: "#1B3A2F", fontWeight: 600 }}>{yearLabel(fromYear)} – {yearLabel(toYear)}</strong>
              &nbsp;|&nbsp;{points.length} קרנות
            </div>
          </td></tr>

          <tr><td style={{ textAlign: "center", padding: "4px 0 16px" }}>
            <div className="chart-card" style={{
              backgroundColor: "#fff", borderRadius: 16,
              boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
              border: "1px solid #e2e8f0", padding: 28, display: "inline-block", position: "relative",
            }}>
              {points.length < 2 ? (
                <div style={{ textAlign: "center", padding: 60, color: "#94a3b8", fontSize: 14 }}>אין מספיק נתונים להצגה</div>
              ) : (
                <ScatterChart width={660} height={380} margin={{ top: 16, right: 30, bottom: 36, left: 36 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" dataKey="x" tick={{ fontSize: 12, fill: "#94a3b8" }} stroke="#e2e8f0" tickLine={{ stroke: "#e2e8f0" }}>
                    <Label value="(%) תשואה" position="bottom" offset={14} style={{ fontSize: 13, fill: "#1B3A2F", fontWeight: 500 }} />
                  </XAxis>
                  <YAxis type="number" dataKey="y" tick={{ fontSize: 12, fill: "#94a3b8" }} stroke="#e2e8f0" tickLine={{ stroke: "#e2e8f0" }}>
                    <Label value="(%) ס״ת" angle={-90} position="insideLeft" offset={-14} style={{ fontSize: 13, fill: "#1B3A2F", fontWeight: 500, textAnchor: "middle" }} />
                  </YAxis>
                  <ZAxis dataKey="aum" range={[50, 400]} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine x={avgX} stroke="#cbd5e1" strokeDasharray="5 5" strokeWidth={1} />
                  <ReferenceLine y={avgY} stroke="#cbd5e1" strokeDasharray="5 5" strokeWidth={1} />
                  <ReferenceArea x1={avgX} x2={9999} y1={-9999} y2={avgY} fill="#1B3A2F" fillOpacity={0.02} />
                  <ReferenceArea x1={-9999} x2={avgX} y1={avgY} y2={9999} fill="#dc2626" fillOpacity={0.02} />
                  <Scatter data={points}>
                    <LabelList dataKey="idx" position="top" className="scatter-label" style={{ fontSize: 9, fontWeight: 600, fill: "#64748B" }} />
                    {points.map((p, i) => (
                      <Cell
                        key={i}
                        fill={COLORS[p.rank]}
                        fillOpacity={0.85}
                        stroke="#fff"
                        strokeWidth={2}
                        r={dotRadius(p.aum)}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              )}
              {/* Quadrant labels */}
              {points.length >= 2 && (<>
                <div className="no-print" style={{ position: "absolute", top: 48, left: 68, fontSize: 10, color: "#dc2626", opacity: 0.5, pointerEvents: "none", direction: "rtl", letterSpacing: "0.01em" }}>
                  סיכון גבוה, תשואה נמוכה
                </div>
                <div className="no-print" style={{ position: "absolute", top: 48, right: 60, fontSize: 10, color: "#f59e0b", opacity: 0.5, pointerEvents: "none", direction: "rtl", letterSpacing: "0.01em" }}>
                  אגרסיבי
                </div>
                <div className="no-print" style={{ position: "absolute", bottom: 68, left: 68, fontSize: 10, color: "#94a3b8", opacity: 0.5, pointerEvents: "none", direction: "rtl", letterSpacing: "0.01em" }}>
                  הגנתי
                </div>
                <div className="no-print" style={{ position: "absolute", bottom: 68, right: 60, fontSize: 10, color: "#1B3A2F", fontWeight: 700, opacity: 0.7, pointerEvents: "none", direction: "rtl", letterSpacing: "0.01em" }}>
                  ✦ הגביע הקדוש
                </div>
              </>)}
            </div>

            <InsightsBlock points={points} avgX={avgX} avgY={avgY} currencyFilter={currencyFilter} />
          </td></tr>

          {/* 3. Legend table (print) — upgrade 1+2 typography & table */}
          <tr><td style={{ textAlign: "center", padding: "0 0" }}>
            {points.length >= 2 && <PrintLegend points={points} periodLabel={periodLabel} />}
          </td></tr>

          {/* 4. Top / Bottom cards — upgrade 4 */}
          <tr><td style={{ padding: "20px 0 0" }}>
            {points.length >= 2 && (
              <div className="rank-cards-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <RankCard title="מובילות" funds={topFunds} color="#1B3A2F" periodLabel={periodLabel} variant="top" />
                <RankCard title="מפגרות" funds={bottomFunds} color="#dc2626" periodLabel={periodLabel} variant="bottom" />
              </div>
            )}
          </td></tr>

        </tbody>
      </table>

      </div>{/* end max-width wrapper */}

      {/* Fixed print footer */}
      <div className="print-footer print-only" style={{ borderTop: "1px solid #ccc" }}>
        {brand.footerDisclaimer && (
          <div style={{ padding: "3px 8px", fontSize: "4.5pt", color: "#666", lineHeight: 1.3, background: "white" }}>
            {brand.footerDisclaimer}
          </div>
        )}
        <div style={{ padding: "2px 8px 3px", fontSize: "5pt", color: "#999", textAlign: "center", background: "white", borderTop: brand.footerDisclaimer ? "1px solid #e5e5e5" : "none" }}>
          {brand.fullName ? `© ${new Date().getFullYear()} ${brand.fullName}. כל הזכויות שמורות` : `© ${new Date().getFullYear()}`}
          {brand.version ? ` | גרסה ${brand.version}` : ""}
          {brand.showCredit && brand.creditText ? ` | ${brand.creditText}` : ""}
        </div>
      </div>

      <div className="no-print" style={{ textAlign: "center", padding: "20px 0 32px", fontSize: 11, color: "#94a3b8", letterSpacing: 0.2 }}>
        {brand.showCredit && brand.creditText ? `All rights reserved — ${brand.creditText}` : brand.fullName ? `© ${brand.fullName}` : ""}
      </div>
    </div>
    </ClientGate>
  );
}

/* ================================================================== */
/*  Sub-components                                                     */
/* ================================================================== */

/* ── Tooltip card — upgrade 3 ── */
function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterPoint }> }) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  return (
    <div style={{
      backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
      padding: 12, fontSize: 12, direction: "rtl",
      boxShadow: "0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)",
      minWidth: 180,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#1B3A2F", fontSize: 13 }}>{p.name}</div>
      <div style={{ display: "flex", gap: 12, color: "#64748B", fontSize: 12, lineHeight: 1.8 }}>
        <span>תשואה <strong style={{ color: "#1B3A2F" }}>{p.x.toFixed(2)}%</strong></span>
        <span>ס״ת <strong style={{ color: "#64748B" }}>{p.y.toFixed(2)}%</strong></span>
        {p.sharpe != null && <span>שארפ <strong style={{ color: "#1B3A2F" }}>{p.sharpe.toFixed(2)}</strong></span>}
      </div>
      {p.aum != null && (
        <div style={{ marginTop: 4, fontSize: 11, color: "#94a3b8" }}>AUM {p.aum.toLocaleString()} מ׳</div>
      )}
      {p.currency && (
        <div style={{ marginTop: 2, fontSize: 11, color: "#94a3b8" }}>{p.currency}</div>
      )}
    </div>
  );
}

/* ── Rank card — upgrade 4 ── */
function RankCard({ title, funds, color, periodLabel, variant }: {
  title: string; funds: ScatterPoint[]; color: string; periodLabel: string; variant: "top" | "bottom";
}) {
  const bgColor = variant === "top" ? "#F0FDF4" : "#FEF2F2";
  const borderColor = variant === "top" ? "#bbf7d0" : "#fecaca";
  return (
    <div style={{
      backgroundColor: bgColor, borderRadius: 12, padding: 20,
      border: `1px solid ${borderColor}`,
      boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      position: "relative",
    }}>
      <h4 style={{ fontSize: 14, fontWeight: 700, color, margin: "0 0 4px 0", letterSpacing: "0.01em" }}>{title}</h4>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 16 }}>תקופה: {periodLabel}</div>
      {funds.map((f, i) => (
        <div key={f.name} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 0",
          borderBottom: i < funds.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
          fontSize: 13, position: "relative",
        }}>
          {/* Ranking circle */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 24, height: 24, borderRadius: "50%", backgroundColor: color,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0,
            }}>
              {i + 1}
            </div>
            <span style={{ fontWeight: 500, color: "#1B3A2F" }}>{f.name}</span>
          </div>
          <div style={{ display: "flex", gap: 14, color: "#64748B", fontSize: 12, alignItems: "center" }}>
            <span>תשואה <b style={{ color }}>{f.x.toFixed(2)}%</b></span>
            <span>ס״ת {f.y.toFixed(2)}%</span>
            {f.sharpe !== null && <SharpeBadge value={f.sharpe} />}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Print legend — upgrade 1+2 ── */
function PrintLegend({ points, periodLabel }: { points: ScatterPoint[]; periodLabel: string }) {
  const sorted = [...points].sort((a, b) => a.idx - b.idx);
  return (
    <table className="print-only-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, direction: "rtl", marginBottom: 20 }}>
      <thead>
        <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
          <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#64748B", letterSpacing: "0.05em", fontSize: 11, width: 40 }}>#</th>
          <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 500, color: "#64748B", letterSpacing: "0.05em", fontSize: 11 }}>קרן</th>
          <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#64748B", letterSpacing: "0.05em", fontSize: 11 }}>תשואה ({periodLabel})</th>
          <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#64748B", letterSpacing: "0.05em", fontSize: 11 }}>ס״ת</th>
          <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#64748B", letterSpacing: "0.05em", fontSize: 11 }}>שארפ</th>
          <th style={{ padding: "10px 16px", textAlign: "center", fontWeight: 500, color: "#64748B", letterSpacing: "0.05em", fontSize: 11 }}>AUM (מ׳)</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((p, i) => {
          const borderLeft = p.rank === "top" ? "3px solid #1B3A2F" : p.rank === "bottom" ? "3px solid #DC2626" : "3px solid transparent";
          return (
            <tr
              key={p.name}
              className="legend-row"
              style={{ borderLeft, transition: "background-color 0.15s" }}
              onMouseOver={(e) => { e.currentTarget.style.backgroundColor = "#F0FDF4"; }}
              onMouseOut={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <td style={{ padding: "14px 16px", textAlign: "center", fontWeight: 600, fontSize: 11, color: "#94a3b8" }}>
                {i + 1}
              </td>
              <td style={{ padding: "14px 16px", fontWeight: 500, color: "#1B3A2F" }}>
                {p.name}
              </td>
              <td style={{ padding: "14px 16px", textAlign: "center", fontWeight: 700, fontSize: 14, color: "#1B3A2F" }}>
                {p.x.toFixed(2)}%
              </td>
              <td style={{ padding: "14px 16px", textAlign: "center", color: "#64748B", fontSize: 12 }}>{p.y.toFixed(2)}%</td>
              <td style={{ padding: "14px 16px", textAlign: "center" }}>
                <SharpeBadge value={p.sharpe} />
              </td>
              <td style={{ padding: "14px 16px", textAlign: "center", color: "#64748B", fontSize: 12 }}>{p.aum != null ? p.aum.toLocaleString() : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function ChartsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#64748B" }}>טוען...</div>}>
      <ChartsContent />
    </Suspense>
  );
}
