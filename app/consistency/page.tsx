"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useClientKey, withClient } from "@/lib/useClientKey";
import { useBrand } from "@/lib/useBrand";
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
  filteredMR: Record<string, number>;   // fund monthly returns (filtered, for chart)
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
/*  Effective blend (respects config override)                                */
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
): { label: string; months: number } {
  const blend = effectiveBlend(categoryId, config);
  if (!blend) return { label: "—", months: 0 };

  const parts = Object.entries(blend).map(([id, w]) => {
    const bm = benchmarks.find((b) => b.id === id);
    const pct = Math.round(w * 100);
    return bm ? `${pct}% ${bm.name}` : id;
  });

  const rawMR    = blendBenchmarkReturns(blend, benchmarks);
  const filtered = filterByTimeRange(rawMR, timeRange);
  return { label: parts.join(" + "), months: Object.keys(filtered).length };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Chart data builder                                                        */
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
/*  Chart tooltip                                                             */
/* ══════════════════════════════════════════════════════════════════════════ */

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; color: string; name: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
      borderRadius: 6, padding: "8px 12px", fontSize: 11,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color, fontWeight: 500 }}>
          {p.name}: {p.value >= 0 ? "+" : ""}{p.value.toFixed(2)}%
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Main content                                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

function ConsistencyContent() {
  const clientKey = useClientKey();
  const brand     = useBrand(clientKey);

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

  /* ── compute table rows ─────────────────────────────────────────────── */
  const { rows, bmInfo, bmMRFiltered, fundsWithData, totalFunds } = useMemo(() => {
    const empty = {
      rows: [] as TableRow[],
      bmInfo: { label: "—", months: 0 },
      bmMRFiltered: {} as Record<string, number>,
      fundsWithData: 0,
      totalFunds: 0,
    };
    if (!fundsData || !benchmarks.length) return empty;

    const category = fundsData.categories.find((c) => c.id === selectedCat);
    if (!category) return empty;

    const thresholds = config?.thresholds ?? { redScore: 40, starIR: 0.5 };
    const blend      = effectiveBlend(selectedCat, config);
    const rawBmMR    = blend ? blendBenchmarkReturns(blend, benchmarks) : {};
    const bmMRFiltered = filterByTimeRange(rawBmMR, timeRange);
    const bmInfo       = buildBmLabel(selectedCat, benchmarks, config, timeRange);

    const rows: TableRow[] = category.funds.map((fund) => {
      const rawMR     = fund.monthlyReturns ?? {};
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

    const fundsWithData = rows.filter((r) => r.result).length;
    return { rows, bmInfo, bmMRFiltered, fundsWithData, totalFunds: category.funds.length };
  }, [fundsData, benchmarks, config, selectedCat, timeRange]);

  const loading = !fundsData || !benchmarks.length || !config;
  const accentGold = brand.accentColor || "#c8a96b";

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
              <span style={{ fontWeight: 600, color: "var(--text-primary)", paddingLeft: 16 }}>{bmInfo.label}</span>
              <span style={{ color: "var(--border)", paddingLeft: 16 }}>|</span>
              <span style={{ color: "var(--text-secondary)", paddingLeft: 16 }}>{bmInfo.months} חודשים זמינים</span>
              <span style={{ color: "var(--border)", paddingLeft: 16 }}>|</span>
              <span style={{ color: "var(--text-secondary)" }}>מינימום 12 חודשים משותפים לחישוב</span>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              טוען נתונים...
            </div>
          )}

          {/* Table */}
          {!loading && rows.length > 0 && (
            <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: "var(--bg-input)", borderBottom: "1px solid var(--border)" }}>
                    <th style={thStyle("right")}>שם קרן</th>
                    <th style={thStyle("center")}>חודשים</th>
                    <th style={thStyle("center")}>עקביות vs בנצ'מרק</th>
                    <th style={thStyle("center")}>avgGap / חודש</th>
                    <th style={thStyle("center")}>IR</th>
                    <th style={thStyle("center")}>תגיות</th>
                    <th style={thStyle("center")}>ציון כולל</th>
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
                          {/* שם קרן */}
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
                                    backgroundColor: isExpanded ? "var(--bg-surface)" : "transparent",
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
                            <td colSpan={8} style={{ padding: "16px 24px 20px", backgroundColor: "var(--bg-surface)" }}>
                              <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
                                {row.name}
                                <span style={{ fontWeight: 400, color: "var(--text-muted)", marginRight: 8 }}>vs {bmInfo.label}</span>
                                <span style={{ fontWeight: 400, color: "var(--text-muted)", marginRight: 8 }}>— תשואה מצטברת</span>
                              </div>
                              <ResponsiveContainer width="100%" height={200}>
                                <LineChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                  <XAxis
                                    dataKey="month"
                                    tickFormatter={fmtMonth}
                                    interval={tickInterval}
                                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                                  />
                                  <YAxis
                                    tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`}
                                    tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                                    width={52}
                                  />
                                  <Tooltip content={<ChartTooltip />} />
                                  <Legend
                                    formatter={(value) => (
                                      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{value}</span>
                                    )}
                                  />
                                  <Line
                                    type="monotone" dataKey="fund" name={row.name}
                                    stroke="#059669" strokeWidth={2} dot={false}
                                  />
                                  <Line
                                    type="monotone" dataKey="bm" name={bmInfo.label}
                                    stroke={accentGold} strokeWidth={2} dot={false} strokeDasharray="5 3"
                                  />
                                </LineChart>
                              </ResponsiveContainer>
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
