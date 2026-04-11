"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useClientKey, withClient } from "@/lib/useClientKey";
import { useBrand } from "@/lib/useBrand";
import { useTheme } from "@/components/ThemeProvider";
import { FundsData, Benchmark } from "@/lib/types";
import ClientGate from "@/components/ClientGate";
import BrandLogo from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeProvider";
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

const ROLLING_RANGES = [
  { id: "12m", label: "12M" },
  { id: "24m", label: "24M" },
  { id: "36m", label: "36M" },
  { id: "60m", label: "60M" },
];

const CALENDAR_RANGES = [
  { id: "2020", label: "2020" },
  { id: "2021", label: "2021" },
  { id: "2022", label: "2022" },
  { id: "2023", label: "2023" },
  { id: "2024", label: "2024" },
  { id: "all",  label: "מ-2020" },
];

const COL_TOOLTIPS: Record<string, string> = {
  months:   "מספר החודשים המשותפים בין הקרן לבנצ'מרק בטווח הנבחר",
  consist:  "כמה פעמים הקרן הניבה תשואה גבוהה מהבנצ'מרק.\nמעל 60% טוב ✅  |  מתחת ל-40% חלש 🔴",
  avgGap:   "הפער הממוצע החודשי מול הבנצ'מרק.\nמראה כמה אלפא מייצר המנהל בממוצע",
  ir:       "Information Ratio — משלב כמה הקרן הכתה את המדד וכמה היתה עקבית.\nמעל 0.5 טוב ✅  |  מעל 1.0 מצוין ⭐  |  שלילי = הפסידה למדד 🔴",
  score:    "ממוצע עקביות vs בנצ'מרק ועקביות vs קטגוריה.\nכרגע מבוסס על בנצ'מרק בלבד עד שיצטברו נתוני קטגוריה",
};

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
/*  Column tooltip component (top-level — no nested components)              */
/* ══════════════════════════════════════════════════════════════════════════ */

function ColTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          background: "none",
          border: "1px solid var(--border)",
          borderRadius: "50%",
          width: 13, height: 13,
          fontSize: 8, cursor: "help",
          color: "var(--text-muted)",
          padding: 0, lineHeight: 1,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >?</button>
      {show && (
        <div style={{
          position: "absolute", zIndex: 200,
          top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 7, padding: "9px 12px",
          fontSize: 11, color: "var(--text-primary)",
          width: 230, boxShadow: "0 6px 20px rgba(0,0,0,0.16)",
          whiteSpace: "pre-wrap", lineHeight: 1.6,
          textAlign: "right", fontWeight: 400,
          direction: "rtl",
        }}>
          {text}
        </div>
      )}
    </span>
  );
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
/*  Tag + color helpers                                                       */
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

function scoreColor(score: number): string {
  if (score >= 55) return "#059669";
  if (score >= 45) return "#d97706";
  return "#dc2626";
}

function irColor(ir: number | null): string {
  if (ir === null) return "var(--text-muted)";
  if (ir > 0.5) return "#059669";
  if (ir < 0)   return "#dc2626";
  return "var(--text-secondary)";
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Benchmark label helper                                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

function buildBmLabel(
  categoryId: string,
  benchmarks: Benchmark[],
  config: ConsistencyConfig | null,
  timeRange: string
): { label: string; months: number; weightsText: string } {
  const blend = effectiveBlend(categoryId, config);
  if (!blend) return { label: "—", months: 0, weightsText: "" };

  const parts = Object.entries(blend).map(([id, w]) => {
    const bm = benchmarks.find((b) => b.id === id);
    const pct = Math.round(w * 100);
    return bm ? `${pct}% ${bm.name}` : id;
  });

  const weightsText = parts.join("\n");
  const rawMR       = blendBenchmarkReturns(blend, benchmarks);
  const filtered    = filterByTimeRange(rawMR, timeRange);
  return { label: parts.join(" + "), months: Object.keys(filtered).length, weightsText };
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
/*  Chart tooltip (top-level)                                                 */
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
      borderRadius: 6, padding: "8px 12px", fontSize: 11,
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
/*  Category summary card (top-level)                                         */
/* ══════════════════════════════════════════════════════════════════════════ */

function SummaryCard({
  avgIR, pctAbove50, topFund, primaryColor, fundsWithData,
}: {
  avgIR: number | null;
  pctAbove50: number;
  topFund: string;
  primaryColor: string;
  fundsWithData: number;
}) {
  const lowData = fundsWithData < 5;
  const dimColor = (c: string) => lowData ? "var(--text-muted)" : c;

  const stats = [
    {
      label: "IR ממוצע קטגוריה",
      value: avgIR !== null ? avgIR.toFixed(3) : "—",
      color: dimColor(avgIR !== null ? (avgIR > 0.5 ? "#059669" : avgIR < 0 ? "#dc2626" : "var(--text-primary)") : "var(--text-muted)"),
    },
    {
      label: "קרנות מעל 50% עקביות",
      value: `${pctAbove50.toFixed(0)}%`,
      color: dimColor(pctAbove50 >= 50 ? "#059669" : pctAbove50 >= 30 ? "#d97706" : "#dc2626"),
    },
    {
      label: "קרן מובילה",
      value: topFund || "—",
      color: dimColor(primaryColor),
      small: true,
    },
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12,
      }}>
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
              borderRadius: 10, padding: "14px 18px",
              opacity: lowData ? 0.75 : 1,
            }}
          >
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>{s.label}</div>
            <div style={{
              fontSize: s.small ? 13 : 22, fontWeight: 700, color: s.color,
              lineHeight: 1.2, wordBreak: "break-word",
            }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
      {lowData && (
        <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6, textAlign: "right" }}>
          ⚠️ מבוסס על {fundsWithData} קרנות בלבד — נתונים חלקיים
        </p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Main content                                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

function ConsistencyContent() {
  const clientKey      = useClientKey();
  const brand          = useBrand(clientKey);
  const { theme }      = useTheme();
  const isDark         = theme === "dark";

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

  /* ── compute rows + summary ─────────────────────────────────────────── */
  const { rows, bmInfo, bmMRFiltered, fundsWithData, totalFunds, summary } = useMemo(() => {
    const empty = {
      rows: [] as TableRow[],
      bmInfo: { label: "—", months: 0, weightsText: "" },
      bmMRFiltered: {} as Record<string, number>,
      fundsWithData: 0,
      totalFunds: 0,
      summary: { avgIR: null as number | null, pctAbove50: 0, topFund: "" },
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
    const fundsWithData = withResult.length;

    // Summary stats
    const irValues = withResult.map((r) => r.result!.ir).filter((v): v is number => v !== null);
    const avgIR    = irValues.length ? irValues.reduce((a, b) => a + b, 0) / irValues.length : null;
    const above50  = withResult.filter((r) => r.result!.score > 50).length;
    const pctAbove50 = fundsWithData > 0 ? (above50 / fundsWithData) * 100 : 0;
    const topFund    = withResult[0]?.name ?? "";

    return {
      rows, bmInfo, bmMRFiltered,
      fundsWithData, totalFunds: category.funds.length,
      summary: { avgIR, pctAbove50, topFund },
    };
  }, [fundsData, benchmarks, config, selectedCat, timeRange]);

  const loading    = !fundsData || !benchmarks.length || !config;

  // Chart colors per theme
  const fundColor = isDark ? "#4ade80" : "#1B3A2F";
  const bmColor   = "#B8975A";

  // Recharts grid/axis colors (must be hex, not CSS vars — per LESSONS.md)
  const gridColor  = isDark ? "#2d3a3a" : "#e5e7eb";
  const axisColor  = isDark ? "#6b7280" : "#9ca3af";

  return (
    <ClientGate clientKey={clientKey}>
      <div style={{ minHeight: "100vh", ...brandCssVars(brand.primaryColor, brand.accentColor) as React.CSSProperties }}>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <div style={{ height: 4, backgroundColor: brand.primaryColor }} />
        <div style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
          <div style={{ maxWidth: 1400, margin: "0 auto", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <BrandLogo brand={brand} height={28} variant="light" />
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{brand.mainTitle}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <a href={withClient("/", clientKey)}         style={navLinkStyle}>דוח</a>
              <a href={withClient("/charts", clientKey)}   style={navLinkStyle}>גרפים</a>
              <a href={withClient("/analysis", clientKey)} style={navLinkStyle}>ניתוח</a>
              <a href={withClient("/admin", clientKey)}    style={navLinkStyle}>ניהול</a>
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 24px" }}>

          {/* Title */}
          <div style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
              ניתוח עקביות קרנות
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, marginBottom: 0 }}>
              כמה חודשים הקרן עקפה את הבנצ'מרק — מבוסס על נתונים חודשיים מ-2020 ואילך
            </p>
          </div>

          {/* Category filter */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => { setSelectedCat(cat.id); setExpandedId(null); }}
                style={{
                  padding: "7px 18px", borderRadius: 8, fontSize: 12,
                  fontWeight: selectedCat === cat.id ? 700 : 400,
                  cursor: "pointer", transition: "all 0.15s",
                  backgroundColor: selectedCat === cat.id ? brand.primaryColor : "var(--bg-surface)",
                  color:           selectedCat === cat.id ? "#fff"              : "var(--text-secondary)",
                  border:          selectedCat === cat.id ? `1px solid ${brand.primaryColor}` : "1px solid var(--border)",
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* ── Time range filters ───────────────────────────────────────── */}
          <div style={{
            backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "12px 16px", marginBottom: 12,
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 88, textAlign: "right" }}>חלון מתגלגל:</span>
              <div style={{ display: "flex", gap: 6 }}>
                {ROLLING_RANGES.map((r) => {
                  const active = timeRange === r.id;
                  return (
                    <button key={r.id}
                      onClick={() => { setTimeRange(active ? "all" : r.id); setExpandedId(null); }}
                      style={{
                        padding: "4px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                        transition: "all 0.15s", fontWeight: active ? 700 : 400,
                        backgroundColor: active ? brand.primaryColor : "var(--bg-input)",
                        color:           active ? "#fff"              : "var(--text-secondary)",
                        border:          active ? `1px solid ${brand.primaryColor}` : "1px solid var(--border)",
                      }}
                    >{r.label}</button>
                  );
                })}
              </div>
            </div>
            <div style={{ height: 1, backgroundColor: "var(--border)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 88, textAlign: "right" }}>שנה קלנדרית:</span>
              <div style={{ display: "flex", gap: 6 }}>
                {CALENDAR_RANGES.map((r) => {
                  const active = timeRange === r.id;
                  return (
                    <button key={r.id}
                      onClick={() => { setTimeRange(r.id); setExpandedId(null); }}
                      style={{
                        padding: "4px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                        transition: "all 0.15s", fontWeight: active ? 700 : 400,
                        backgroundColor: active ? brand.primaryColor : "var(--bg-input)",
                        color:           active ? "#fff"              : "var(--text-secondary)",
                        border:          active ? `1px solid ${brand.primaryColor}` : "1px solid var(--border)",
                      }}
                    >{r.label}</button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Benchmark info bar */}
          {!loading && (
            <div style={{
              display: "flex", alignItems: "center", flexWrap: "wrap",
              backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "9px 16px", marginBottom: 16, fontSize: 12, gap: 0,
            }}>
              <span style={{ color: "var(--text-muted)", paddingLeft: 6 }}>בנצ'מרק:</span>
              <span style={{ fontWeight: 600, color: "var(--text-primary)", paddingLeft: 8 }}>{bmInfo.label}</span>
              {bmInfo.weightsText && (
                <span style={{ paddingLeft: 4 }}>
                  <ColTooltip text={`משקולות:\n${bmInfo.weightsText}`} />
                </span>
              )}
              <span style={{ color: "var(--border)", paddingLeft: 12 }}>|</span>
              <span style={{ color: "var(--text-secondary)", paddingLeft: 12 }}>{bmInfo.months} חודשים זמינים</span>
              <span style={{ color: "var(--border)", paddingLeft: 12 }}>|</span>
              <span style={{ color: "var(--text-secondary)" }}>מינימום 12 חודשים משותפים לחישוב</span>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              טוען נתונים...
            </div>
          )}

          {/* ── Summary card ─────────────────────────────────────────────── */}
          {!loading && fundsWithData > 0 && (
            <SummaryCard
              avgIR={summary.avgIR}
              pctAbove50={summary.pctAbove50}
              topFund={summary.topFund}
              primaryColor={brand.primaryColor}
              fundsWithData={fundsWithData}
            />
          )}

          {/* Table */}
          {!loading && rows.length > 0 && (
            <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: "var(--bg-input)", borderBottom: "1px solid var(--border)" }}>
                    <th style={thStyle("right")}>שם קרן</th>
                    <th style={thStyle("center")}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        חודשים <ColTooltip text={COL_TOOLTIPS.months} />
                      </span>
                    </th>
                    <th style={thStyle("center")}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        עקביות vs בנצ'מרק <ColTooltip text={COL_TOOLTIPS.consist} />
                      </span>
                    </th>
                    <th style={thStyle("center")}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        avgGap / חודש <ColTooltip text={COL_TOOLTIPS.avgGap} />
                      </span>
                    </th>
                    <th style={thStyle("center")}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        IR <ColTooltip text={COL_TOOLTIPS.ir} />
                      </span>
                    </th>
                    <th style={thStyle("center")}>תגיות</th>
                    <th style={thStyle("center")}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        ציון כולל <ColTooltip text={COL_TOOLTIPS.score} />
                      </span>
                    </th>
                    <th style={thStyle("center")}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const isNA       = !row.result;
                    const isExpanded = expandedId === row.id;
                    const borderBottom = (isExpanded || i < rows.length - 1) ? "1px solid var(--border)" : "none";
                    const chartData  = isExpanded ? buildChartData(row.filteredMR, bmMRFiltered) : null;
                    const tickInterval = chartData ? Math.max(0, Math.ceil(chartData.length / 8) - 1) : 0;

                    return (
                      <>
                        <tr
                          key={row.id}
                          style={{ borderBottom, backgroundColor: isExpanded ? "var(--bg-input)" : "transparent", opacity: isNA ? 0.4 : 1 }}
                        >
                          <td style={{ padding: "11px 16px", fontWeight: 500, color: "var(--text-primary)", textAlign: "right" }}>
                            {row.name}
                          </td>

                          {isNA ? (
                            <td colSpan={7} style={{ padding: "11px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
                              אין נתונים
                            </td>
                          ) : (
                            <>
                              <td style={{ padding: "11px 16px", color: "var(--text-secondary)", textAlign: "center" }}>
                                {row.sharedMonths}
                              </td>
                              <td style={{ padding: "11px 16px", textAlign: "center" }}>
                                <span style={{ fontWeight: 700, fontSize: 14, color: scoreColor(row.result!.score) }}>
                                  {row.result!.score.toFixed(1)}%
                                </span>
                                <span style={{ fontSize: 10, color: "var(--text-muted)", marginRight: 5 }}>
                                  ({row.result!.wins}/{row.result!.total})
                                </span>
                              </td>
                              <td style={{ padding: "11px 16px", textAlign: "center" }}>
                                <span style={{ fontWeight: 500, color: row.result!.avgGap >= 0 ? "#059669" : "#dc2626" }}>
                                  {row.result!.avgGap >= 0 ? "+" : ""}{(row.result!.avgGap * 100).toFixed(3)}%
                                </span>
                              </td>
                              <td style={{ padding: "11px 16px", textAlign: "center" }}>
                                {row.result!.ir != null ? (
                                  <span style={{ fontWeight: 600, color: irColor(row.result!.ir) }}>
                                    {row.result!.ir.toFixed(3)}
                                  </span>
                                ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                              </td>
                              <td style={{ padding: "11px 16px", textAlign: "center", fontSize: 15, letterSpacing: 2 }}>
                                {row.tags.length > 0 ? row.tags.join(" ") : (
                                  <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>
                                )}
                              </td>
                              <td style={{ padding: "11px 16px", textAlign: "center" }}>
                                <span style={{
                                  display: "inline-block", padding: "3px 10px", borderRadius: 6,
                                  fontSize: 12, fontWeight: 700,
                                  backgroundColor: row.result!.score >= 55 ? "#dcfce7" : row.result!.score >= 45 ? "#fef9c3" : "#fee2e2",
                                  color:           row.result!.score >= 55 ? "#166534" : row.result!.score >= 45 ? "#92400e" : "#991b1b",
                                }}>
                                  {row.result!.score.toFixed(1)}
                                </span>
                              </td>
                              <td style={{ padding: "11px 12px", textAlign: "center" }}>
                                <button
                                  onClick={() => setExpandedId(isExpanded ? null : row.id)}
                                  title={isExpanded ? "סגור גרף" : "הצג גרף"}
                                  style={{
                                    background: "none", border: "1px solid var(--border)",
                                    borderRadius: 5, cursor: "pointer", fontSize: 14, padding: "3px 7px",
                                    color: isExpanded ? brand.primaryColor : "var(--text-secondary)",
                                    backgroundColor: isExpanded ? (isDark ? "#1e2d2d" : "#f0fdf4") : "transparent",
                                    transition: "all 0.15s",
                                  }}
                                >
                                  📈
                                </button>
                              </td>
                            </>
                          )}
                        </tr>

                        {/* Expanded chart row */}
                        {isExpanded && chartData && (
                          <tr key={`${row.id}-chart`} style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}>
                            <td colSpan={8} style={{
                              padding: "16px 24px 20px",
                              backgroundColor: isDark ? "#111b1b" : "#f9fafb",
                            }}>
                              <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                                {row.name}
                                <span style={{ fontWeight: 400, color: "var(--text-muted)", marginRight: 8 }}>vs {bmInfo.label}</span>
                                <span style={{ fontWeight: 400, color: "var(--text-muted)", marginRight: 8 }}>— תשואה מצטברת</span>
                              </div>
                              {chartData.length >= 2 ? (
                                <ResponsiveContainer width="100%" height={200}>
                                  <LineChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                                    <XAxis
                                      dataKey="month"
                                      tickFormatter={fmtMonth}
                                      interval={tickInterval}
                                      tick={{ fontSize: 10, fill: axisColor }}
                                      stroke={gridColor}
                                    />
                                    <YAxis
                                      tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`}
                                      tick={{ fontSize: 10, fill: axisColor }}
                                      width={52}
                                      stroke={gridColor}
                                    />
                                    <Tooltip
                                      content={(props) => (
                                        <ChartTooltip
                                          active={props.active}
                                          payload={props.payload as unknown as { value: number; color: string; name: string }[]}
                                          label={props.label as string}
                                          isDark={isDark}
                                        />
                                      )}
                                    />
                                    <Legend
                                      formatter={(value) => (
                                        <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{value}</span>
                                      )}
                                    />
                                    <Line
                                      type="monotone" dataKey="fund" name={row.name}
                                      stroke={fundColor} strokeWidth={2} dot={false}
                                    />
                                    <Line
                                      type="monotone" dataKey="bm" name={bmInfo.label}
                                      stroke={bmColor} strokeWidth={2} dot={false} strokeDasharray="5 3"
                                    />
                                  </LineChart>
                                </ResponsiveContainer>
                              ) : (
                                <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "20px 0" }}>
                                  אין מספיק נתונים לגרף
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer note */}
          {!loading && (
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10, textAlign: "right" }}>
              * ציון כולל = עקביות vs בנצ'מרק בלבד (שלב א׳). עקביות vs קטגוריה — בקרוב.
              &nbsp;&nbsp;|&nbsp;&nbsp;
              נתונים חודשיים זמינים: {fundsWithData} קרנות מתוך {totalFunds} בקטגוריה זו.
            </p>
          )}

        </div>
      </div>
    </ClientGate>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Style helpers                                                             */
/* ══════════════════════════════════════════════════════════════════════════ */

function thStyle(align: "right" | "center"): React.CSSProperties {
  return {
    padding: "10px 16px",
    textAlign: align,
    fontWeight: 600,
    color: "var(--text-secondary)",
    fontSize: 11,
    whiteSpace: "nowrap",
  };
}

const navLinkStyle: React.CSSProperties = {
  fontSize: 12, color: "var(--text-secondary)", textDecoration: "none",
  padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)",
};

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
