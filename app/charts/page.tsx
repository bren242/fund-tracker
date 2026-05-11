"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip,
  CartesianGrid, ZAxis, Label,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from "recharts";
import { FundsData, Fund } from "@/lib/types";
import { useTheme } from "@/components/ThemeProvider";
import { formatReportDate } from "@/lib/format";
import { useBrand } from "@/lib/useBrand";
import { useClientKey } from "@/lib/useClientKey";
import ClientGate from "@/components/ClientGate";
import { brandCssVars } from "@/lib/colors";
import { useFilters } from "@/lib/useFilters";

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
/*  Scatter helpers                                                     */
/* ------------------------------------------------------------------ */
interface ScatterPoint {
  idx: number;
  name: string;
  x: number;
  y: number;
  sharpe: number | null;
  aum: number | null;
  rank: "holy-grail" | "top" | "normal" | "bottom";
  hero?: boolean;
  currency?: "ILS" | "USD";
}

type ValidPoint = Omit<ScatterPoint, "rank" | "idx" | "hero">;

function buildScatterData(funds: Fund[], fromYear: number, toYear: number): ScatterPoint[] {
  const seen = new Set<string>();
  const valid: ValidPoint[] = [];
  for (const f of funds) {
    if (seen.has(f.name)) continue;
    seen.add(f.name);
    const ret = computeRangeReturn(f, fromYear, toYear);
    if (ret === null || f.stdDev === null) continue;
    valid.push({ name: f.name, x: ret * 100, y: f.stdDev * 100, sharpe: f.sharpe, aum: f.aumMillions, currency: f.currency });
  }

  const avgX = valid.length > 0 ? valid.reduce((s, p) => s + p.x, 0) / valid.length : 0;
  const avgY = valid.length > 0 ? valid.reduce((s, p) => s + p.y, 0) / valid.length : 0;

  const withSharpe = valid.filter((p) => p.sharpe !== null);
  const sortedBySharpe = [...withSharpe].sort((a, b) => (b.sharpe ?? -Infinity) - (a.sharpe ?? -Infinity));

  const heroName = sortedBySharpe.length > 0 ? sortedBySharpe[0].name : null;

  // holy-grail: high return + low risk quadrant
  const holyGrailNames = new Set(valid.filter((p) => p.x > avgX && p.y < avgY).map((p) => p.name));

  // top: high sharpe but outside holy-grail quadrant
  const topNames = new Set(
    sortedBySharpe.filter((p) => !holyGrailNames.has(p.name)).slice(0, 2).map((p) => p.name),
  );

  // bottom: low sharpe, below average return
  const bottomCandidates = sortedBySharpe.slice(-2).filter((p) => p.x < avgX);
  const bottomNames = new Set(bottomCandidates.map((p) => p.name));

  return valid.map((p, i) => ({
    ...p,
    idx: i + 1,
    hero: p.name === heroName,
    rank: holyGrailNames.has(p.name) ? ("holy-grail" as const)
        : topNames.has(p.name)       ? ("top" as const)
        : bottomNames.has(p.name)    ? ("bottom" as const)
        : ("normal" as const),
  }));
}

const COLORS = { "holy-grail": "#1B3A2F", top: "#5C8A6F", normal: "#9CA3AF", bottom: "#B45353" };
const COLORS_DARK = { "holy-grail": "#4ade80", top: "#86efac", normal: "#94a3b8", bottom: "#f87171" };

function dotRadius(aum: number | null): number {
  if (aum === null) return 5;
  if (aum > 2000) return 10;
  if (aum >= 500) return 7;
  return 5;
}

/* ── Sharpe badge ── */
function SharpeBadge({ value }: { value: number | null }) {
  if (value === null) return <span style={{ color: "var(--text-muted)" }}>—</span>;
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

/* ── ? Help popover ── */
function ChartHelpPopover({ dark }: { dark: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "absolute", top: 14, left: 14, zIndex: 20 }}>
      <button
        onClick={() => setOpen(!open)}
        title="הסבר הגרף"
        style={{
          width: 24, height: 24, borderRadius: "50%",
          border: `1px solid ${dark ? "rgba(255,255,255,0.18)" : "rgba(27,58,47,0.2)"}`,
          background: dark ? "rgba(255,255,255,0.06)" : "rgba(27,58,47,0.05)",
          color: dark ? "rgba(255,255,255,0.45)" : "rgba(27,58,47,0.45)",
          fontSize: 11, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          lineHeight: 1, transition: "background 150ms",
        }}
      >?</button>
      {open && (
        <div style={{
          position: "absolute", left: 0, top: 30,
          width: 270,
          background: dark ? "#1c2230" : "#fff",
          border: `1px solid ${dark ? "#2a3244" : "#e2e8f0"}`,
          borderRadius: 10, padding: "14px 16px 12px",
          boxShadow: "0 8px 28px rgba(0,0,0,0.13)",
          fontSize: 12, lineHeight: 1.75, color: "var(--text-secondary)",
          direction: "rtl",
        }}>
          <button
            onClick={() => setOpen(false)}
            style={{ position: "absolute", top: 8, left: 10, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14, padding: 0, lineHeight: 1 }}
          >✕</button>
          <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--text-primary)", fontSize: 13 }}>הסבר הגרף</div>
          <div style={{ marginBottom: 2 }}>ציר אופקי — תשואה שנתית ממוצעת</div>
          <div style={{ marginBottom: 10 }}>ציר אנכי — סטיית תקן (סיכון)</div>
          {[
            { color: "#1B3A2F", label: "גביע קדוש — תשואה גבוהה, סיכון נמוך" },
            { color: "#5C8A6F", label: "מובילות — שארפ גבוה" },
            { color: "#9CA3AF", label: "ממוצע" },
            { color: "#B45353", label: "מפגרות — שארפ נמוך" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span>{label}</span>
            </div>
          ))}
          <div style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 11, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
            גודל נקודה = AUM &nbsp;|&nbsp; קווים מקווקווים = ממוצע
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Insights card ── */
function InsightsBlock({
  points, avgX, avgY, currencyFilter, dark,
}: {
  points: ScatterPoint[];
  avgX: number;
  avgY: number;
  currencyFilter: "all" | "ILS" | "USD";
  dark: boolean;
}) {
  if (points.length < 2) return null;

  interface Insight { text: string; icon: string; }
  const insights: Insight[] = [];

  const returns = points.map((p) => p.x);
  const minR = Math.min(...returns);
  const maxR = Math.max(...returns);
  insights.push({
    text: `טווח התשואות בקטגוריה: ${minR.toFixed(1)}%–${maxR.toFixed(1)}% (פיזור של ${(maxR - minR).toFixed(1)}%)`,
    icon: "↔",
  });

  const holyGrail = points.filter((p) => p.x > avgX && p.y < avgY);
  insights.push({
    text: holyGrail.length > 0
      ? `${holyGrail.length} קרנות בגביע הקדוש — תשואה גבוהה עם סיכון נמוך`
      : "אין קרנות בגביע הקדוש בתקופה זו",
    icon: "✦",
  });

  if (currencyFilter === "all") {
    const currencies = new Set(points.map((p) => p.currency).filter(Boolean));
    if (currencies.size >= 2) {
      insights.push({ text: "הגרף כולל קרנות בשקל ובדולר — ההשוואה עלולה להיות מטעה", icon: "⚠️" });
    }
  }

  return (
    <div className="no-print" style={{
      border: `1px solid ${dark ? "rgba(74,222,128,0.15)" : "rgba(27, 58, 47, 0.12)"}`,
      background: dark
        ? "linear-gradient(135deg, rgba(20,83,45,0.15) 0%, rgba(15,60,35,0.1) 100%)"
        : "linear-gradient(135deg, #F4F3EF 0%, #FAF9F6 100%)",
      padding: "20px 24px",
      borderRadius: 16,
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      direction: "rtl",
      margin: "14px 0 0",
    }}>
      <div style={{
        fontSize: 11, fontWeight: 600,
        color: dark ? "rgba(74,222,128,0.6)" : "#9ca3af",
        textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 14,
      }}>
        תובנות אוטומטיות
      </div>
      {insights.map((insight, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "6px 4px", marginBottom: 2,
          fontSize: 13, color: dark ? "#c9d8cf" : "#1a2e26", lineHeight: 1.6,
        }}>
          <span style={{
            fontSize: insight.icon === "⚠️" ? 13 : 14, flexShrink: 0, marginTop: 2,
            color: insight.icon === "⚠️" ? "#f59e0b" : (dark ? "rgba(74,222,128,0.5)" : "#9ca3af"),
          }}>
            {insight.icon}
          </span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{insight.text}</span>
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
  const { theme } = useTheme();
  const dark = theme === "dark";
  const router = useRouter();
  const prefix = `/${clientKey}`;
  const navigate = (path: string) => router.push(`${prefix}${path}`);

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
  const topFunds = points.filter((p) => p.rank === "top" || p.rank === "holy-grail");
  const bottomFunds = points.filter((p) => p.rank === "bottom");

  const avgX = points.length > 0 ? points.reduce((s, p) => s + p.x, 0) / points.length : 0;
  const avgY = points.length > 0 ? points.reduce((s, p) => s + p.y, 0) / points.length : 0;

  const colorMap = dark ? COLORS_DARK : COLORS;
  const primary = brand.primaryColor || "#1B3A2F";
  const features = brand.features;

  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>טוען נתונים...</div>;

  const selectStyle: React.CSSProperties = {
    fontSize: 12, padding: "5px 10px", borderRadius: 8,
    border: "1px solid #e2e8f0", backgroundColor: "#fff",
    color: "#1a2e26", cursor: "pointer", fontWeight: 500,
    outline: "none",
  };

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: "5px 13px", borderRadius: 20, fontSize: 12, border: "none",
    cursor: "pointer", whiteSpace: "nowrap",
    background: active ? primary : "#F4F3EF",
    color: active ? "#fff" : "#6b7280",
    fontWeight: active ? 600 : 400,
    transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
    flexShrink: 0,
  });

  const hasGroupOrCat = group !== ALL || category !== ALL;

  return (
    <ClientGate clientKey={clientKey}>
    <style>{`
      @media print { @page { size: A4 portrait; margin: 8mm 10mm 16mm 10mm; } }
      @keyframes bubbleIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
    `}</style>
    <div style={{
      minHeight: "100vh",
      background: dark ? "var(--bg-page)" : "linear-gradient(180deg, #F4F3EF 0px, #ffffff 600px)",
      ...brandCssVars(brand.primaryColor, brand.accentColor) as React.CSSProperties,
    }}>

      {/* ── Sticky controls bar ── */}
      <div className="no-print" style={{ position: "sticky", top: 52, zIndex: 99, background: "#FAFAF7" }}>

        {/* ROW 1 (44px) — sub-tabs right, search+dropdowns+reset left */}
        <div style={{
          height: 44, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 28px", direction: "rtl", borderBottom: "0.5px solid #eaecee",
        }}>
          {/* Right: Sub-tabs with feature locking */}
          <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>
            {[
              { label: "דירוג",   path: "/analysis",       active: false, locked: false },
              { label: "השוואה",  path: "/compare",        active: false, locked: features?.comparison === false },
              { label: "גרף",     path: "/charts",         active: true,  locked: false },
              { label: "עקביות",  path: "/consistency/v2", active: false, locked: features?.consistencyAnalysis === false },
            ].map(({ label, path, active, locked }) => (
              <button key={label}
                onClick={() => { if (!active && !locked) navigate(path); }}
                style={{
                  padding: "6px 15px", borderRadius: 20, fontSize: 13, border: "none",
                  cursor: active || locked ? "default" : "pointer", whiteSpace: "nowrap",
                  background: active ? primary : "#F4F3EF",
                  color: active ? "#fff" : locked ? "#c4c9d0" : "#6b7280",
                  fontWeight: active ? 600 : 400,
                  transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
                  flexShrink: 0, opacity: locked ? 0.6 : 1,
                }}
              >{locked ? `🔒 ${label}` : label}</button>
            ))}
          </div>

          {/* Left: search + group select + category select + reset */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{ position: "relative" }}>
              <input
                type="text" value={search}
                onChange={(e) => setFilter("search", e.target.value)}
                placeholder="חיפוש קרן..."
                style={{
                  padding: "6px 30px 6px 10px", borderRadius: 8,
                  border: search ? `1.5px solid ${primary}` : "1px solid #e2e8f0",
                  fontSize: 12, width: 150, outline: "none",
                  background: "#fff", color: "#1a2e26", direction: "rtl",
                  transition: "border-color 200ms cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
              <span style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#9ca3af", pointerEvents: "none" }}>🔍</span>
              {search && (
                <button onClick={() => setFilter("search", "")} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
              )}
            </div>

            <div style={{ position: "relative" }}>
              <select
                value={group}
                onChange={(e) => { setFilter("group", e.target.value); setFilter("category", ALL); }}
                style={{ ...selectStyle, paddingRight: 22, border: group !== ALL ? `1.5px solid ${primary}` : "1px solid #e2e8f0", color: group !== ALL ? primary : "#6b7280", fontWeight: group !== ALL ? 600 : 400, background: group !== ALL ? `${primary}08` : "#fff", appearance: "none", WebkitAppearance: "none" }}
              >
                <option value={ALL}>כל הקבוצות</option>
                {options.groups.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 9, color: group !== ALL ? primary : "#9ca3af", lineHeight: 1 }}>▾</span>
            </div>

            <div style={{ position: "relative" }}>
              <select
                value={category}
                onChange={(e) => setFilter("category", e.target.value)}
                style={{ ...selectStyle, paddingRight: 22, border: category !== ALL ? `1.5px solid ${primary}` : "1px solid #e2e8f0", color: category !== ALL ? primary : "#6b7280", fontWeight: category !== ALL ? 600 : 400, background: category !== ALL ? `${primary}08` : "#fff", appearance: "none", WebkitAppearance: "none" }}
              >
                <option value={ALL}>כל הקטגוריות</option>
                {options.categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 9, color: category !== ALL ? primary : "#9ca3af", lineHeight: 1 }}>▾</span>
            </div>

            {activeFilterCount > 0 && (
              <button
                onClick={clearAll}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, border: `1px solid ${primary}30`, background: `${primary}08`, color: primary, fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)", whiteSpace: "nowrap" }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", background: primary, color: "#fff", fontSize: 9, fontWeight: 700 }}>
                  {activeFilterCount}
                </span>
                איפוס
              </button>
            )}
          </div>
        </div>

        {/* ROW 2 (40px) — slide-down when group/category selected */}
        <div style={{
          maxHeight: hasGroupOrCat ? 40 : 0,
          overflow: "hidden",
          transition: "max-height 200ms cubic-bezier(0.4, 0, 0.2, 1)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 28px", direction: "rtl",
          borderBottom: hasGroupOrCat ? "0.5px solid #eaecee" : "none",
        }}>
          {/* Right: Classification pills */}
          <div style={{ display: "flex", gap: 5, alignItems: "center", overflow: "hidden", flexShrink: 1, minWidth: 0 }}>
            {options.classifications.length >= 2 && [ALL, ...options.classifications].map((cls) => (
              <button key={cls} onClick={() => setFilter("classification", cls)} style={pillStyle(classification === cls)}>
                {cls === ALL ? "הכל" : cls}
              </button>
            ))}
          </div>

          {/* Left: Period + Currency + count */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <select value={fromYear} onChange={(e) => { const v = Number(e.target.value); setFromYear(v); if (v > toYear) setToYear(v); }} style={selectStyle}>
                {ALL_YEARS.map((y) => <option key={y} value={y}>{yearLabel(y)}</option>)}
              </select>
              <span style={{ fontSize: 12, color: "#9ca3af" }}>—</span>
              <select value={toYear} onChange={(e) => setToYear(Number(e.target.value))} style={selectStyle}>
                {ALL_YEARS.filter((y) => y >= fromYear).map((y) => <option key={y} value={y}>{yearLabel(y)}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", gap: 3 }}>
              {(["all", "ILS", "USD"] as const).map((c) => (
                <button key={c} onClick={() => setCurrencyFilter(c)} style={pillStyle(currencyFilter === c)}>
                  {c === "all" ? "הכל" : c}
                </button>
              ))}
            </div>

            <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
              {points.length} קרנות
            </span>
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
                  <span style={{ fontSize: "7pt", color: "#64748B", whiteSpace: "nowrap" }}>מעודכן ל: {formatReportDate(data.lastUpdated)}</span>
                </td>
                <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                  <span style={{ fontSize: "11pt", color: "#1B3A2F", fontWeight: 700 }}>סיכום מול תשואה</span>
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
            {/* Category title (print) */}
            <tr><td style={{ textAlign: "center", padding: "20px 0 10px" }}>
              <span className="print-only" style={{ fontSize: "13pt", fontWeight: 700, color: "#B8975A", borderBottom: "2px solid #B8975A", paddingBottom: 4 }}>
                {selectedCategoryLabel}
              </span>
            </td></tr>

            {/* Hero chart */}
            <tr><td style={{ padding: "8px 0 16px" }}>
              <div
                className="chart-card"
                style={{
                  width: "100%",
                  height: "min(calc(100vh - 220px), 680px)",
                  minHeight: 400,
                  background: dark
                    ? "linear-gradient(160deg, #1a2828 0%, #1E2A2A 100%)"
                    : "linear-gradient(160deg, #F6F5F1 0%, #FAFAF7 100%)",
                  borderRadius: 20,
                  boxShadow: dark
                    ? "0 4px 32px rgba(0,0,0,0.22)"
                    : "0 4px 32px rgba(27,58,47,0.07)",
                  border: dark
                    ? "1px solid rgba(255,255,255,0.06)"
                    : "1px solid rgba(27,58,47,0.1)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <ChartHelpPopover dark={dark} />

                {points.length < 2 ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", fontSize: 14 }}>
                    אין מספיק נתונים להצגה
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 40, right: 60, bottom: 60, left: 60 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={dark ? "#2D3748" : "#e5e8ec"} strokeOpacity={0.6} />
                        <XAxis
                          type="number" dataKey="x"
                          tick={{ fontSize: 11, fill: dark ? "#CBD5E1" : "#94a3b8" }}
                          stroke={dark ? "#2D3748" : "#dde1e7"}
                          tickLine={false}
                          axisLine={{ stroke: dark ? "#2D3748" : "#dde1e7" }}
                        >
                          <Label value="(%) תשואה" position="bottom" offset={18}
                            style={{ fontSize: 12, fill: dark ? "#94a3b8" : "#64748b", fontWeight: 500 }} />
                        </XAxis>
                        <YAxis
                          type="number" dataKey="y"
                          tick={{ fontSize: 11, fill: dark ? "#CBD5E1" : "#94a3b8" }}
                          stroke={dark ? "#2D3748" : "#dde1e7"}
                          tickLine={false}
                          axisLine={{ stroke: dark ? "#2D3748" : "#dde1e7" }}
                        >
                          <Label value="(%) ס״ת" angle={-90} position="insideLeft" offset={-18}
                            style={{ fontSize: 12, fill: dark ? "#94a3b8" : "#64748b", fontWeight: 500, textAnchor: "middle" }} />
                        </YAxis>
                        <ZAxis dataKey="aum" range={[40, 360]} />
                        <Tooltip content={<CustomTooltip dark={dark} />} />
                        <ReferenceLine x={avgX} stroke={dark ? "#4A5568" : "#c4cdd6"} strokeDasharray="5 5" strokeWidth={1} />
                        <ReferenceLine y={avgY} stroke={dark ? "#4A5568" : "#c4cdd6"} strokeDasharray="5 5" strokeWidth={1} />

                        {/* Quadrant fills */}
                        <ReferenceArea x1={avgX} x2={99999}  y1={-99999} y2={avgY}   fill={dark ? "#4ade80" : "#1B3A2F"} fillOpacity={0.03} />
                        <ReferenceArea x1={-99999} x2={avgX} y1={avgY}   y2={99999}  fill="#B45353" fillOpacity={dark ? 0.04 : 0.025} />

                        <Scatter
                          data={points}
                          shape={(props: any) => {
                            const { cx, cy, payload } = props;
                            if (!payload || !isFinite(cx) || !isFinite(cy)) return null;
                            const r = dotRadius(payload.aum);
                            const color = colorMap[payload.rank as keyof typeof colorMap] || colorMap.normal;
                            const isHero = payload.hero === true;
                            const delay = ((payload.idx || 1) - 1) * 30;
                            const truncName = payload.name && payload.name.length > 16
                              ? payload.name.slice(0, 16) + "…"
                              : payload.name;
                            const heroLabel = isHero
                              ? `${truncName} · ${payload.x.toFixed(1)}%`
                              : null;
                            const labelW = heroLabel ? Math.min(heroLabel.length * 6.5 + 16, 180) : 0;
                            const labelX = cx - labelW / 2;
                            const labelY = cy - r - 30;
                            return (
                              <g style={{ animation: `bubbleIn 350ms ease-out ${delay}ms both` }}>
                                {isHero && (
                                  <circle cx={cx} cy={cy} r={r + 7} fill="none"
                                    stroke={color} strokeWidth={2} strokeOpacity={0.55} />
                                )}
                                <circle
                                  cx={cx} cy={cy} r={r}
                                  fill={color}
                                  fillOpacity={0.88}
                                  stroke={dark ? "#1a2828" : "#fff"}
                                  strokeWidth={1.5}
                                />
                                <text
                                  x={cx} y={cy - r - 5}
                                  textAnchor="middle"
                                  fontSize={8} fontWeight={600}
                                  fill={dark ? "#6B7280" : "#94a3b8"}
                                  style={{ pointerEvents: "none", userSelect: "none" }}
                                >
                                  {payload.idx}
                                </text>
                                {isHero && heroLabel && (
                                  <g>
                                    <rect
                                      x={labelX} y={labelY - 13}
                                      width={labelW} height={18}
                                      rx={9}
                                      fill={dark ? "#1a2828" : "#fff"}
                                      stroke={color}
                                      strokeWidth={1.5}
                                      strokeOpacity={0.7}
                                    />
                                    <text
                                      x={cx} y={labelY - 1}
                                      textAnchor="middle"
                                      fontSize={10} fontWeight={700}
                                      fill={color}
                                      style={{ pointerEvents: "none", userSelect: "none" }}
                                    >
                                      {heroLabel}
                                    </text>
                                  </g>
                                )}
                              </g>
                            );
                          }}
                        />
                      </ScatterChart>
                    </ResponsiveContainer>

                    {/* Quadrant labels — overlaid, not in SVG */}
                    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                      <div style={{ position: "absolute", top: 44, left: 64, fontSize: 10, fontWeight: 600, color: dark ? "rgba(248,113,113,0.28)" : "rgba(180,83,83,0.28)", letterSpacing: "1.5px", textTransform: "uppercase" }}>
                        סיכון גבוה · תשואה נמוכה
                      </div>
                      <div style={{ position: "absolute", top: 44, right: 64, fontSize: 10, fontWeight: 600, color: dark ? "rgba(148,163,184,0.28)" : "rgba(100,116,139,0.28)", letterSpacing: "1.5px", textTransform: "uppercase" }}>
                        אגרסיבי
                      </div>
                      <div style={{ position: "absolute", bottom: 68, left: 64, fontSize: 10, fontWeight: 600, color: dark ? "rgba(148,163,184,0.28)" : "rgba(100,116,139,0.28)", letterSpacing: "1.5px", textTransform: "uppercase" }}>
                        הגנתי
                      </div>
                      <div style={{ position: "absolute", bottom: 68, right: 64, fontSize: 10, fontWeight: 600, color: dark ? "rgba(74,222,128,0.28)" : "rgba(27,58,47,0.22)", letterSpacing: "1.5px", textTransform: "uppercase" }}>
                        גביע קדוש
                      </div>
                    </div>
                  </>
                )}
              </div>

              <InsightsBlock points={points} avgX={avgX} avgY={avgY} currencyFilter={currencyFilter} dark={dark} />
            </td></tr>

            {/* Legend table */}
            <tr><td style={{ padding: "0 0" }}>
              {points.length >= 2 && <PrintLegend points={points} periodLabel={periodLabel} dark={dark} />}
            </td></tr>

            {/* Top / Bottom cards */}
            <tr><td style={{ padding: "20px 0 0" }}>
              {points.length >= 2 && (
                <div className="rank-cards-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <RankCard title="מובילות" funds={topFunds} color={colorMap["holy-grail"]} periodLabel={periodLabel} variant="top" dark={dark} />
                  <RankCard title="מפגרות" funds={bottomFunds} color={colorMap.bottom} periodLabel={periodLabel} variant="bottom" dark={dark} />
                </div>
              )}
            </td></tr>

          </tbody>
        </table>

      </div>

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

      <div className="no-print" style={{ textAlign: "center", padding: "20px 0 32px", fontSize: 11, color: "var(--text-muted)", letterSpacing: 0.2 }}>
        {brand.showCredit && brand.creditText ? `All rights reserved — ${brand.creditText}` : brand.fullName ? `© ${brand.fullName}` : ""}
      </div>
    </div>
    </ClientGate>
  );
}

/* ================================================================== */
/*  Sub-components                                                     */
/* ================================================================== */

/* ── Tooltip card ── */
function CustomTooltip({ active, payload, dark }: { active?: boolean; payload?: Array<{ payload: ScatterPoint }>; dark?: boolean }) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  const rankColors: Record<string, string> = dark
    ? { "holy-grail": "#4ade80", top: "#86efac", normal: "#94a3b8", bottom: "#f87171" }
    : { "holy-grail": "#1B3A2F", top: "#5C8A6F", normal: "#9CA3AF", bottom: "#B45353" };
  const color = rankColors[p.rank] || rankColors.normal;
  return (
    <div style={{
      backgroundColor: dark ? "#1c2230" : "#fff",
      border: `1px solid ${dark ? "#2a3244" : "#e2e8f0"}`,
      borderRadius: 10,
      padding: "12px 16px",
      fontSize: 12,
      direction: "rtl",
      boxShadow: dark ? "0 4px 16px rgba(0,0,0,0.35)" : "0 4px 16px rgba(0,0,0,0.09)",
      minWidth: 190,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8, color: dark ? "#e2e6ea" : "#1B3A2F", fontSize: 13 }}>{p.name}</div>
      <div style={{ display: "grid", gridTemplateColumns: "auto auto auto", gap: "4px 16px", color: dark ? "#8893a4" : "#64748B", fontSize: 12, lineHeight: 1.8, fontVariantNumeric: "tabular-nums" }}>
        <span>תשואה <strong style={{ color }}>{p.x.toFixed(2)}%</strong></span>
        <span>ס״ת <strong style={{ color: dark ? "#e2e6ea" : "#64748B" }}>{p.y.toFixed(2)}%</strong></span>
        {p.sharpe != null && <span>שארפ <strong style={{ color }}>{p.sharpe.toFixed(2)}</strong></span>}
      </div>
      {p.aum != null && (
        <div style={{ marginTop: 6, fontSize: 11, color: dark ? "#5a6577" : "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
          AUM {p.aum.toLocaleString()} מ׳
          {p.currency && <span style={{ marginRight: 8 }}>{p.currency}</span>}
        </div>
      )}
    </div>
  );
}

/* ── Rank card ── */
function RankCard({ title, funds, color, periodLabel, variant, dark }: {
  title: string; funds: ScatterPoint[]; color: string; periodLabel: string; variant: "top" | "bottom"; dark: boolean;
}) {
  let bgColor: string, borderColor: string;
  if (variant === "top") {
    bgColor = dark ? "rgba(20,83,45,0.2)" : "#DCFCE7";
    borderColor = dark ? "rgba(74,222,128,0.25)" : "#86efac";
  } else {
    bgColor = dark ? "rgba(153,27,27,0.15)" : "#FEE2E2";
    borderColor = dark ? "rgba(248,113,113,0.25)" : "#fca5a5";
  }
  return (
    <div style={{ backgroundColor: bgColor, borderRadius: 12, padding: 20, border: `1px solid ${borderColor}`, boxShadow: dark ? "none" : "0 1px 3px rgba(0,0,0,0.08)", position: "relative" }}>
      <h4 style={{ fontSize: 14, fontWeight: 700, color, margin: "0 0 4px 0", letterSpacing: "0.01em" }}>{title}</h4>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16 }}>תקופה: {periodLabel}</div>
      {funds.map((f, i) => (
        <div key={f.name} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 0",
          borderBottom: i < funds.length - 1 ? `1px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}` : "none",
          fontSize: 13, position: "relative",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", backgroundColor: color, display: "flex", alignItems: "center", justifyContent: "center", color: dark ? "#0d1117" : "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              {i + 1}
            </div>
            <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{f.name}</span>
          </div>
          <div style={{ display: "flex", gap: 14, color: "var(--text-secondary)", fontSize: 12, alignItems: "center" }}>
            <span>תשואה <b style={{ color }}>{f.x.toFixed(2)}%</b></span>
            <span>ס״ת {f.y.toFixed(2)}%</span>
            {f.sharpe !== null && <SharpeBadge value={f.sharpe} />}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Print legend (polished) ── */
function PrintLegend({ points, periodLabel, dark }: { points: ScatterPoint[]; periodLabel: string; dark: boolean }) {
  const sorted = [...points].sort((a, b) => a.idx - b.idx);
  const thStyle: React.CSSProperties = {
    padding: "10px 16px", fontWeight: 600, color: "#6B6B6B",
    letterSpacing: "0.5px", fontSize: 11, textTransform: "uppercase",
  };
  return (
    <table className="print-only-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, direction: "rtl", marginBottom: 20 }}>
      <thead>
        <tr style={{ borderBottom: `2px solid ${dark ? "#2a3244" : "#e2e8f0"}` }}>
          <th style={{ ...thStyle, textAlign: "center", width: 40 }}>#</th>
          <th style={{ ...thStyle, textAlign: "right" }}>קרן</th>
          <th style={{ ...thStyle, textAlign: "center" }}>תשואה ({periodLabel})</th>
          <th style={{ ...thStyle, textAlign: "center" }}>ס״ת</th>
          <th style={{ ...thStyle, textAlign: "center" }}>שארפ</th>
          <th style={{ ...thStyle, textAlign: "center" }}>AUM (מ׳)</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((p, i) => {
          const borderRight = p.rank === "holy-grail" || p.rank === "top"
            ? `3px solid ${dark ? "#4ade80" : "#1B3A2F"}`
            : p.rank === "bottom"
              ? `3px solid ${dark ? "#f87171" : "#DC2626"}`
              : "3px solid transparent";
          return (
            <tr
              key={p.name}
              style={{ borderRight, borderBottom: "1px solid rgba(0,0,0,0.06)", cursor: "pointer", transition: "background-color 200ms cubic-bezier(0.4, 0, 0.2, 1)" }}
              onMouseOver={(e) => { e.currentTarget.style.backgroundColor = "rgba(27, 58, 47, 0.03)"; }}
              onMouseOut={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              <td style={{ padding: "14px 16px", textAlign: "center", fontWeight: 600, fontSize: 11, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", opacity: 0.5 }}>{i + 1}</td>
              <td style={{ padding: "14px 16px", fontWeight: 500, color: "var(--text-primary)" }}>{p.name}</td>
              <td style={{ padding: "14px 16px", textAlign: "center", fontWeight: 700, fontSize: 14, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{p.x.toFixed(2)}%</td>
              <td style={{ padding: "14px 16px", textAlign: "center", color: "var(--text-secondary)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{p.y.toFixed(2)}%</td>
              <td style={{ padding: "14px 16px", textAlign: "center" }}><SharpeBadge value={p.sharpe} /></td>
              <td style={{ padding: "14px 16px", textAlign: "center", color: "var(--text-secondary)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{p.aum != null ? p.aum.toLocaleString() : "—"}</td>
            </tr>
          );
        })}
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
