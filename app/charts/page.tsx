"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip,
  CartesianGrid, Cell, ZAxis, Label, LabelList,
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
/*  Chart uses annual average data only — no year selection             */
/* ------------------------------------------------------------------ */
const RETURN_KEY = "_avg";
const RETURN_LABEL = "תשואה שנתית ממוצעת";


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

function getReturnValue(fund: Fund, key: string): number | null {
  if (key === "_avg") return fund.avgAnnualReturn;
  return (fund.returns as Record<string, number | null>)[key] ?? null;
}

function buildScatterData(funds: Fund[], returnKey: string): ScatterPoint[] {
  const valid = funds
    .map((f) => {
      const ret = getReturnValue(f, returnKey);
      if (ret === null || f.stdDev === null) return null;
      return { name: f.name, x: ret * 100, y: f.stdDev * 100, sharpe: f.sharpe, aum: f.aumMillions };
    })
    .filter((p): p is Omit<ScatterPoint, "rank" | "idx"> => p !== null);

  const sorted = [...valid].sort((a, b) => b.x - a.x);
  const topNames = new Set(sorted.slice(0, 2).map((p) => p.name));
  const bottomNames = new Set(sorted.slice(-2).map((p) => p.name));

  return valid.map((p, i) => ({
    ...p,
    idx: i + 1,
    rank: topNames.has(p.name) ? "top" as const : bottomNames.has(p.name) ? "bottom" as const : "normal" as const,
  }));
}

const COLORS = { top: "#059669", bottom: "#dc2626", normal: "#64748b" };

/* ================================================================== */
/*  Main Page                                                          */
/* ================================================================== */
function ChartsContent() {
  const clientKey = useClientKey();
  const [data, setData] = useState<FundsData | null>(null);
  const brand = useBrand(clientKey);

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

  const points = useMemo(
    () => buildScatterData(funds, RETURN_KEY),
    [funds],
  );
  const topFunds = points.filter((p) => p.rank === "top");
  const bottomFunds = points.filter((p) => p.rank === "bottom");

  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>טוען נתונים...</div>;

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

      {/* Filter bar — same as report page */}
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

          {/* 2. Chart — centered */}
          <tr><td style={{ textAlign: "center", padding: "8px 0 16px" }}>
            <div className="chart-card" style={{ backgroundColor: "var(--bg-surface)", borderRadius: 12, boxShadow: "var(--shadow-card)", border: "1px solid var(--border)", padding: 24, display: "inline-block" }}>
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
                  <Scatter data={points}>
                    <LabelList dataKey="idx" position="top" className="scatter-label" style={{ fontSize: 9, fontWeight: 700, fill: "#1a1f2b" }} />
                    {points.map((p, i) => (
                      <Cell key={i} fill={COLORS[p.rank]} fillOpacity={1} stroke={COLORS[p.rank]} strokeWidth={2} />
                    ))}
                  </Scatter>
                </ScatterChart>
              )}
            </div>
          </td></tr>

          {/* 3. Legend table — centered via .print-only-table CSS */}
          <tr><td style={{ textAlign: "center", padding: "0 20px" }}>
            {points.length >= 2 && <PrintLegend points={points} returnLabel={RETURN_LABEL} />}
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

function PrintLegend({ points, returnLabel }: { points: ScatterPoint[]; returnLabel: string }) {
  const sorted = [...points].sort((a, b) => a.idx - b.idx);
  return (
    <table className="print-only-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, direction: "rtl", marginBottom: 20 }}>
      <thead>
        <tr style={{ backgroundColor: "#f1f5f9", borderBottom: "2px solid #cbd5e1" }}>
          <th style={{ padding: "7px 8px", textAlign: "center", fontWeight: 600, color: "#334155", width: 36 }}>#</th>
          <th style={{ padding: "7px 8px", textAlign: "right", fontWeight: 600, color: "#334155" }}>קרן</th>
          <th style={{ padding: "7px 8px", textAlign: "center", fontWeight: 600, color: "#334155" }}>תשואה ({returnLabel})</th>
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
