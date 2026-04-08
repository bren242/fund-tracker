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
/*  Year range helpers — improvement 1+2                               */
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
}

type ValidPoint = Omit<ScatterPoint, "rank" | "idx">;

function buildScatterData(funds: Fund[], fromYear: number, toYear: number): ScatterPoint[] {
  const valid: ValidPoint[] = [];
  for (const f of funds) {
    const ret = computeRangeReturn(f, fromYear, toYear);
    if (ret === null || f.stdDev === null) continue;
    valid.push({ name: f.name, x: ret * 100, y: f.stdDev * 100, sharpe: f.sharpe, aum: f.aumMillions });
  }

  // Rank by Sharpe (only funds that have a valid Sharpe value)
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

const COLORS = { top: "#059669", bottom: "#dc2626", normal: "#64748b" };

/* ── Explanation block ── */
function ChartExplanation() {
  return (
    <div className="no-print" style={{
      backgroundColor: "var(--bg-surface-alt)", borderRadius: 10,
      padding: "12px 18px", marginBottom: 16, fontSize: 12,
      color: "var(--text-secondary)", lineHeight: 1.7, direction: "rtl",
      border: "1px solid var(--border)",
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--text-primary)", fontSize: 13 }}>הסבר הגרף</div>
      <div>ציר אופקי — תשואה שנתית ממוצעת &nbsp;|&nbsp; ציר אנכי — סטיית תקן</div>
      <div>
        <span style={{ color: "#059669", fontWeight: 600 }}>ירוק</span> = שארפ גבוה &nbsp;|&nbsp;
        <span style={{ color: "#dc2626", fontWeight: 600 }}>אדום</span> = שארפ נמוך &nbsp;|&nbsp;
        קווים מקווקווים = ממוצע הקטגוריה
      </div>
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

  // Local chart controls — fully independent from report page selectors
  const [fromYear, setFromYear] = useState<number>(2020);
  const [toYear, setToYear] = useState<number>(2025);

  useEffect(() => {
    fetch(`/api/funds?client=${encodeURIComponent(clientKey)}`).then((r) => r.json()).then((d: FundsData) => {
      setData(d);
    });
  }, [clientKey]);

  // Shared cascading filters — same hook as report page
  const {
    group, category, classification, search,
    options, setFilter, clearAll, filtered, activeFilterCount, ALL,
  } = useFilters(data?.categories || []);

  // Flatten all funds from filtered categories for the chart
  const funds = useMemo(
    () => filtered.flatMap((cat) => cat.funds),
    [filtered],
  );

  // Label for print header
  const selectedCategoryLabel = useMemo(() => {
    if (category !== ALL) return category;
    if (group !== ALL) return group;
    return "כל הקרנות";
  }, [group, category, ALL]);

  // Dynamic period label for legend header
  const periodLabel = useMemo(() => {
    if (fromYear === toYear) return yearLabel(fromYear);
    return `${fromYear}–${toYear}`;
  }, [fromYear, toYear]);

  const points = useMemo(
    () => buildScatterData(funds, fromYear, toYear),
    [funds, fromYear, toYear],
  );
  const topFunds = points.filter((p) => p.rank === "top");
  const bottomFunds = points.filter((p) => p.rank === "bottom");

  // Quadrant reference lines — average of all plotted points
  const avgX = points.length > 0 ? points.reduce((s, p) => s + p.x, 0) / points.length : 0;
  const avgY = points.length > 0 ? points.reduce((s, p) => s + p.y, 0) / points.length : 0;

  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>טוען נתונים...</div>;

  const selectStyle: React.CSSProperties = {
    fontSize: 12, padding: "3px 8px", borderRadius: 6,
    border: "1px solid var(--border)", backgroundColor: "var(--bg-input)",
    color: "var(--text-primary)", cursor: "pointer",
  };

  return (
    <ClientGate clientKey={clientKey}>
    {/* Print: portrait, no browser headers/footers */}
    <style>{`@media print { @page { size: A4 portrait; margin: 8mm 10mm 16mm 10mm; } }`}</style>
    <div style={{ minHeight: "100vh", ...brandCssVars(brand.primaryColor, brand.accentColor) } as React.CSSProperties}>
      {/* Thin brand color bar */}
      <div style={{ height: 4, backgroundColor: brand.primaryColor }} />
      {/* Header — screen only */}
      <div className="no-print" style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <BrandLogo brand={brand} height={28} variant="light" />
            <span style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 600 }}>סיכון מול תשואה</span>
          </div>
          <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>עדכון: {formatDate(data.lastUpdated)}</span>
            {brand.version && (
              <span style={{ fontSize: 10, color: "var(--text-muted)", backgroundColor: "var(--bg-input)", padding: "2px 8px", borderRadius: 4, fontWeight: 500 }}>
                v{brand.version}
              </span>
            )}
            <button
              onClick={() => window.print()}
              style={{ backgroundColor: brand.primaryColor, color: "#fff", fontWeight: 700, padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12 }}
            >
              הדפסה / PDF
            </button>
            <a href={withClient("/", clientKey)} style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)" }}>דוח</a>
            {brand.features?.dataCompletion && (
              <a href={withClient("/data-completion", clientKey)} style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)" }}>השלמת נתונים</a>
            )}
            <a href={withClient("/admin", clientKey)} style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)" }}>ניהול</a>
            <ThemeToggle />
          </div>
          <div className="print-only" style={{ fontSize: 12, color: "var(--text-primary)" }}>
            עדכון: {formatDate(data.lastUpdated)}
          </div>
        </div>
      </div>

      {/* Category + fund filters */}
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
        accentColor={brand.primaryColor}
      />

      {/* Local chart controls — year range selector (improvement 1+2) */}
      <div className="no-print" style={{
        backgroundColor: "var(--bg-surface-alt)", borderBottom: "1px solid var(--border)",
        padding: "8px 20px", display: "flex", alignItems: "center", gap: 24,
        flexWrap: "wrap", direction: "rtl",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>תקופה:</span>
          <select
            value={fromYear}
            onChange={(e) => { const v = Number(e.target.value); setFromYear(v); if (v > toYear) setToYear(v); }}
            style={selectStyle}
          >
            {ALL_YEARS.map((y) => <option key={y} value={y}>{yearLabel(y)}</option>)}
          </select>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>
          <select
            value={toYear}
            onChange={(e) => setToYear(Number(e.target.value))}
            style={selectStyle}
          >
            {ALL_YEARS.filter((y) => y >= fromYear).map((y) => <option key={y} value={y}>{yearLabel(y)}</option>)}
          </select>
        </div>
      </div>

      {/* All content in one table — thead repeats on every printed page */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead className="print-only">
          <tr><td style={{ padding: 0, borderBottom: `2px solid ${brand.secondaryColor}`, background: "white" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody><tr>
              <td style={{ width: "120px", textAlign: "right", verticalAlign: "middle", padding: "6px 8px" }}>
                <span style={{ fontSize: "7pt", color: "#5a6577", whiteSpace: "nowrap" }}>מעודכן ל: {formatDate(data.lastUpdated)}</span>
              </td>
              <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                <span style={{ fontSize: "11pt", color: brand.primaryColor, fontWeight: 700 }}>סיכון מול תשואה</span>
              </td>
              <td style={{ width: "120px", textAlign: "left", verticalAlign: "middle", padding: "6px 8px" }}>
                {(brand.logoLight || brand.logo) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={brand.logoLight || brand.logo} alt={brand.name || ""} style={{ maxHeight: 32, width: "auto", objectFit: "contain" }} />
                )}
              </td>
            </tr></tbody></table>
          </td></tr>
          {/* Spacer row — creates gap BELOW the border on every page */}
          <tr><td style={{ height: 14, padding: 0, border: "none", background: "white", lineHeight: 0, fontSize: 0 }} /></tr>
        </thead>
        <tbody>
          {/* 1. Category title */}
          <tr><td style={{ textAlign: "center", padding: "20px 0 10px" }}>
            <span className="print-only" style={{ fontSize: "13pt", fontWeight: 700, color: brand.secondaryColor, borderBottom: `2px solid ${brand.secondaryColor}`, paddingBottom: 4 }}>
              {selectedCategoryLabel}
            </span>
          </td></tr>

          {/* 2. Explanation + Chart */}
          <tr><td style={{ padding: "8px 20px 0" }}>
            <ChartExplanation />
          </td></tr>
          <tr><td style={{ textAlign: "center", padding: "8px 0 16px" }}>
            <div className="chart-card" style={{ backgroundColor: "var(--bg-surface)", borderRadius: 12, boxShadow: "var(--shadow-card)", border: "1px solid var(--border)", padding: 24, display: "inline-block", position: "relative" }}>
              {points.length < 2 ? (
                <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)", fontSize: 14 }}>אין מספיק נתונים להצגה</div>
              ) : (
                <ScatterChart width={660} height={380} margin={{ top: 16, right: 30, bottom: 36, left: 36 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" />
                  <XAxis type="number" dataKey="x" tick={{ fontSize: 12, fill: "#5a6577" }} stroke="#d1d5db" tickLine={{ stroke: "#d1d5db" }}>
                    <Label value="(%) תשואה" position="bottom" offset={14} style={{ fontSize: 13, fill: "#1a1f2b", fontWeight: 500 }} />
                  </XAxis>
                  <YAxis type="number" dataKey="y" tick={{ fontSize: 12, fill: "#5a6577" }} stroke="#d1d5db" tickLine={{ stroke: "#d1d5db" }}>
                    <Label value="(%) ס״ת" angle={-90} position="insideLeft" offset={-14} style={{ fontSize: 13, fill: "#1a1f2b", fontWeight: 500, textAnchor: "middle" }} />
                  </YAxis>
                  <ZAxis range={[70, 70]} />
                  <Tooltip content={<CustomTooltip />} />
                  {/* Quadrant dividers */}
                  <ReferenceLine x={avgX} stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={1.5} />
                  <ReferenceLine y={avgY} stroke="#94a3b8" strokeDasharray="5 5" strokeWidth={1.5} />
                  {/* Quadrant shading */}
                  <ReferenceArea x1={avgX} x2={9999} y1={-9999} y2={avgY} fill="#059669" fillOpacity={0.03} />
                  <ReferenceArea x1={-9999} x2={avgX} y1={avgY} y2={9999} fill="#dc2626" fillOpacity={0.03} />
                  <Scatter data={points}>
                    <LabelList dataKey="idx" position="top" className="scatter-label" style={{ fontSize: 9, fontWeight: 700, fill: "#1a1f2b" }} />
                    {points.map((p, i) => (
                      <Cell key={i} fill={COLORS[p.rank]} fillOpacity={1} stroke={COLORS[p.rank]} strokeWidth={2} />
                    ))}
                  </Scatter>
                </ScatterChart>
              )}
              {/* Quadrant labels — absolute overlay, hidden on print */}
              {points.length >= 2 && (<>
                {/* top-left: high stdDev, low return */}
                <div className="no-print" style={{ position: "absolute", top: 45, left: 65, fontSize: 11, color: "#dc2626", opacity: 0.6, pointerEvents: "none", direction: "rtl" }}>
                  סיכון גבוה, תשואה נמוכה
                </div>
                {/* top-right: high stdDev, high return */}
                <div className="no-print" style={{ position: "absolute", top: 45, right: 58, fontSize: 11, color: "#f59e0b", opacity: 0.6, pointerEvents: "none", direction: "rtl" }}>
                  אגרסיבי
                </div>
                {/* bottom-left: low stdDev, low return */}
                <div className="no-print" style={{ position: "absolute", bottom: 64, left: 65, fontSize: 11, color: "#64748b", opacity: 0.6, pointerEvents: "none", direction: "rtl" }}>
                  הגנתי
                </div>
                {/* bottom-right: low stdDev, high return */}
                <div className="no-print" style={{ position: "absolute", bottom: 64, right: 58, fontSize: 11, color: "#059669", fontWeight: 700, opacity: 0.8, pointerEvents: "none", direction: "rtl" }}>
                  ✦ הגביע הקדוש
                </div>
              </>)}
            </div>
          </td></tr>

          {/* 3. Legend table — centered via .print-only-table CSS */}
          <tr><td style={{ textAlign: "center", padding: "0 20px" }}>
            {points.length >= 2 && <PrintLegend points={points} periodLabel={periodLabel} />}
          </td></tr>

          {/* 4. Top / Bottom cards — centered via .rank-cards-grid CSS */}
          <tr><td style={{ textAlign: "center", padding: "14px 20px 0" }}>
            {points.length >= 2 && (
              <div className="rank-cards-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <RankCard title="מובילות" funds={topFunds} color="#059669" bg="rgba(5,150,105,0.08)" border="rgba(5,150,105,0.2)" />
                <RankCard title="מפגרות" funds={bottomFunds} color="#dc2626" bg="rgba(220,38,38,0.08)" border="rgba(220,38,38,0.2)" />
              </div>
            )}
          </td></tr>

        </tbody>
      </table>

      {/* Fixed print footer — pinned to bottom of every printed page */}
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

      <div className="no-print" style={{ textAlign: "center", padding: "8px 0 20px", fontSize: 10, color: "var(--text-muted)", letterSpacing: 0.2 }}>
        {brand.showCredit && brand.creditText ? `All rights reserved — ${brand.creditText}` : brand.fullName ? `© ${brand.fullName}` : ""}
      </div>
    </div>
    </ClientGate>
  );
}

/* ================================================================== */
/*  Sub-components                                                     */
/* ================================================================== */


function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterPoint }> }) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  return (
    <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10,
      padding: "12px 16px", fontSize: 13, direction: "rtl", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
      <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--text-primary)", fontSize: 14 }}>{p.name}</div>
      <TipRow label="תשואה" value={p.x.toFixed(2) + "%"} />
      <TipRow label="ס״ת" value={p.y.toFixed(2) + "%"} />
      {p.sharpe != null && <TipRow label="שארפ" value={p.sharpe.toFixed(2)} />}
      {p.aum != null && <TipRow label="AUM" value={p.aum.toLocaleString() + " מ׳"} />}
    </div>
  );
}

function TipRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 20, lineHeight: 1.8 }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function RankCard({ title, funds, color, bg, border }: {
  title: string; funds: ScatterPoint[]; color: string; bg: string; border: string;
}) {
  return (
    <div style={{ backgroundColor: bg, borderRadius: 12, padding: "16px 20px", border: `1.5px solid ${border}` }}>
      <h4 style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 12, margin: "0 0 12px 0", letterSpacing: 0.2 }}>{title}</h4>
      {funds.map((f) => (
        <div key={f.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "7px 0", borderBottom: "1px solid rgba(128,128,128,0.1)", fontSize: 13 }}>
          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{f.name}</span>
          <div style={{ display: "flex", gap: 16, color: "var(--text-secondary)", fontSize: 12 }}>
            <span>תשואה: <b style={{ color }}>{f.x.toFixed(2)}%</b></span>
            <span>ס״ת: {f.y.toFixed(2)}%</span>
            {f.sharpe !== null && <span>שארפ: {f.sharpe.toFixed(2)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function PrintLegend({ points, periodLabel }: { points: ScatterPoint[]; periodLabel: string }) {
  const sorted = [...points].sort((a, b) => a.idx - b.idx);
  return (
    <table className="print-only-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, direction: "rtl", marginBottom: 20 }}>
      <thead>
        <tr style={{ backgroundColor: "#f1f5f9", borderBottom: "2px solid #cbd5e1" }}>
          <th style={{ padding: "7px 8px", textAlign: "center", fontWeight: 600, color: "#334155", width: 36 }}>#</th>
          <th style={{ padding: "7px 8px", textAlign: "right", fontWeight: 600, color: "#334155" }}>קרן</th>
          <th style={{ padding: "7px 8px", textAlign: "center", fontWeight: 600, color: "#334155" }}>תשואה שנתית ממוצעת ({periodLabel})</th>
          <th style={{ padding: "7px 8px", textAlign: "center", fontWeight: 600, color: "#334155" }}>ס״ת</th>
          <th style={{ padding: "7px 8px", textAlign: "center", fontWeight: 600, color: "#334155" }}>שארפ</th>
          <th style={{ padding: "7px 8px", textAlign: "center", fontWeight: 600, color: "#334155" }}>AUM (מ׳)</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((p, i) => (
          <tr key={p.name} style={{ borderBottom: "1px solid #e2e8f0", backgroundColor: i % 2 === 0 ? "white" : "#f8fafc" }}>
            <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, fontSize: 10,
              color: p.rank === "top" ? COLORS.top : p.rank === "bottom" ? COLORS.bottom : "#475569" }}>
              {p.idx}
            </td>
            <td style={{ padding: "6px 8px", fontWeight: p.rank !== "normal" ? 600 : 400,
              color: p.rank === "top" ? COLORS.top : p.rank === "bottom" ? COLORS.bottom : "#1e293b" }}>
              {p.name}
            </td>
            <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 600,
              color: p.rank === "top" ? COLORS.top : p.rank === "bottom" ? COLORS.bottom : "#1e293b" }}>
              {p.x.toFixed(2)}%
            </td>
            <td style={{ padding: "6px 8px", textAlign: "center", color: "#475569" }}>{p.y.toFixed(2)}%</td>
            <td style={{ padding: "6px 8px", textAlign: "center", color: "#475569" }}>{p.sharpe != null ? p.sharpe.toFixed(2) : "—"}</td>
            <td style={{ padding: "6px 8px", textAlign: "center", color: "#475569" }}>{p.aum != null ? p.aum.toLocaleString() : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ChartsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>טוען...</div>}>
      <ChartsContent />
    </Suspense>
  );
}
