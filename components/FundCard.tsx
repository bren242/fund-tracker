"use client";

import { Fund } from "@/lib/types";
import { pct, num, formatReportDate, returnColorInline } from "@/lib/format";
import { useState, useEffect } from "react";

/* ── Year keys to display ── */
type ReturnYear = keyof Fund["returns"];

const YEAR_KEYS: { key: ReturnYear; label: string; isYtd: boolean }[] = [
  { key: "y2020", label: "2020", isYtd: false },
  { key: "y2021", label: "2021", isYtd: false },
  { key: "y2022", label: "2022", isYtd: false },
  { key: "y2023", label: "2023", isYtd: false },
  { key: "y2024", label: "2024", isYtd: false },
  { key: "y2025", label: "2025", isYtd: false },
  { key: "ytd2026", label: "2026", isYtd: true },
];

const MAX_BAR_HEIGHT = 56;

/* ── Drawdown calc ── */
interface DrawdownResult {
  worstMonth: number | null;
  worstMonthKey: string | null;
  recoveryMonths: number | null;
  noRecovery: boolean;
}

export function calculateDrawdown(
  monthlyReturns: Record<string, number> | undefined,
): DrawdownResult {
  if (!monthlyReturns) return { worstMonth: null, worstMonthKey: null, recoveryMonths: null, noRecovery: false };
  const entries = Object.entries(monthlyReturns)
    .filter(([, v]) => typeof v === "number")
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) return { worstMonth: null, worstMonthKey: null, recoveryMonths: null, noRecovery: false };

  const keys = entries.map(([k]) => k);
  const values = entries.map(([, v]) => v);
  const worstMonth = Math.min(...values);
  const worstIdx = values.indexOf(worstMonth);
  const worstMonthKey = keys[worstIdx];

  // Peak cumulative before worst month
  let peak = 1;
  let cumBefore = 1;
  for (let i = 0; i < worstIdx; i++) {
    cumBefore *= 1 + values[i];
    if (cumBefore > peak) peak = cumBefore;
  }

  // Cumulative through worst month
  let cumAtWorst = 1;
  for (let i = 0; i <= worstIdx; i++) cumAtWorst *= 1 + values[i];

  // Recovery months
  let recoveryMonths: number | null = null;
  let cum = cumAtWorst;
  for (let i = worstIdx + 1; i < values.length; i++) {
    cum *= 1 + values[i];
    if (cum >= peak) { recoveryMonths = i - worstIdx; break; }
  }

  // No recovery: worst is last month or not enough months after to confirm recovery
  const noRecovery = recoveryMonths === null && worstIdx >= 0;

  return { worstMonth, worstMonthKey, recoveryMonths, noRecovery };
}

/** Convert monthlyReturns key (e.g. "2024-03") to MM/YYYY display */
function monthKeyToDisplay(key: string | null, fund: Fund): string {
  if (!key) return "";
  // Keys are like "2024-03" or similar date-sortable format
  const match = key.match(/^(\d{4})-(\d{2})$/);
  if (match) return `${match[2]}/${match[1]}`;
  // Fallback: try using lastReportDate + index calculation
  return key;
}

/* ── MetricCell ── */
function MetricCell({ label, value, subValue, color }: { label: string; value: string; subValue?: string; color: string }) {
  return (
    <div style={{ textAlign: "center", padding: "0 2px" }}>
      <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginBottom: 4, whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
      {subValue && (
        <div style={{ fontSize: 8.5, color: "var(--text-muted)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{subValue}</div>
      )}
    </div>
  );
}

/* ── Tooltip for info icon ── */
function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center", cursor: "help" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="no-print" style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 14, height: 14, borderRadius: "50%",
        backgroundColor: "var(--bg-surface-alt)", border: "1px solid var(--border)",
        fontSize: 8.5, fontWeight: 700, color: "var(--text-muted)", lineHeight: 1,
        marginRight: 3,
      }}>i</span>
      {show && (
        <div className="no-print" style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
          backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
          borderRadius: 6, padding: "6px 10px", fontSize: 10, color: "var(--text-secondary)",
          whiteSpace: "nowrap", zIndex: 50, boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          pointerEvents: "none",
        }}>
          {text}
        </div>
      )}
    </span>
  );
}

/* ── Bar Tooltip ── */
function BarTooltip({ value, year, visible }: { value: string; year: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="no-print" style={{
      position: "absolute", bottom: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)",
      backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
      borderRadius: 5, padding: "3px 7px", fontSize: 9, fontWeight: 600,
      color: "var(--text-primary)", whiteSpace: "nowrap", zIndex: 40,
      boxShadow: "0 2px 6px rgba(0,0,0,0.1)", pointerEvents: "none",
    }}>
      {year}: {value}
    </div>
  );
}

/* ── Monthly Line Chart (SVG) ── */
function MonthlyLineChart({ monthlyReturns }: { monthlyReturns: Record<string, number> }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const entries = Object.entries(monthlyReturns)
    .filter(([, v]) => typeof v === "number")
    .sort((a, b) => a[0].localeCompare(b[0]));

  if (entries.length < 12) return null;

  const values = entries.map(([, v]) => v * 100);
  const maxAbs = Math.max(...values.map(Math.abs), 0.01);
  const chartH = 60;
  const padTop = 8;
  const padBot = 8;
  const drawH = chartH - padTop - padBot;
  const zeroY = padTop + (maxAbs / (2 * maxAbs)) * drawH;

  const points = values.map((v, i) => {
    const x = entries.length === 1 ? 50 : (i / (entries.length - 1)) * 100;
    const y = padTop + ((maxAbs - v) / (2 * maxAbs)) * drawH;
    return { x, y, v, key: entries[i][0] };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${zeroY} L ${points[0].x} ${zeroY} Z`;

  return (
    <div style={{ marginTop: 10, position: "relative" }}>
      <svg
        viewBox={`0 0 100 ${chartH}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: chartH, display: "block" }}
      >
        <defs>
          <linearGradient id="monthlyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#059669" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Zero line */}
        <line x1="0" y1={zeroY} x2="100" y2={zeroY} stroke="var(--text-muted)" strokeWidth="0.3" strokeDasharray="1 1" />
        {/* Area fill */}
        <path d={areaPath} fill="url(#monthlyGrad)" />
        {/* Line */}
        <path d={linePath} fill="none" stroke="#059669" strokeWidth="0.6" />
        {/* Hover targets */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x} cy={p.y} r="2"
            fill={hoveredIdx === i ? "#059669" : "transparent"}
            stroke={hoveredIdx === i ? "#059669" : "transparent"}
            strokeWidth="0.5"
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          />
        ))}
      </svg>
      {/* Tooltip */}
      {hoveredIdx !== null && (
        <div className="no-print" style={{
          position: "absolute",
          left: `${points[hoveredIdx].x}%`,
          top: 0, transform: "translateX(-50%)",
          backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
          borderRadius: 5, padding: "3px 7px", fontSize: 9, fontWeight: 600,
          color: "var(--text-primary)", whiteSpace: "nowrap", zIndex: 40,
          boxShadow: "0 2px 6px rgba(0,0,0,0.1)", pointerEvents: "none",
        }}>
          {(() => {
            const key = points[hoveredIdx].key;
            const m = key.match(/^(\d{4})-(\d{2})$/);
            const label = m ? `${m[2]}/${m[1]}` : key;
            return `${label}: ${points[hoveredIdx].v.toFixed(2)}%`;
          })()}
        </div>
      )}
    </div>
  );
}

/* ── FundCard ── */
export default function FundCard({ fund }: { fund: Fund }) {
  const [animated, setAnimated] = useState(false);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(t);
  }, []);

  const drawdown = calculateDrawdown(fund.monthlyReturns);
  const yearValues = YEAR_KEYS.map((y) => fund.returns[y.key]);
  const hasAnyYear = yearValues.some((v) => v !== null);
  const maxAbs = yearValues
    .filter((v): v is number => v !== null)
    .reduce((m, v) => Math.max(m, Math.abs(v)), 0.001);

  // Recovery display logic
  let recoveryDisplay: string;
  let recoveryColor: string;
  if (drawdown.recoveryMonths !== null) {
    recoveryDisplay = `${drawdown.recoveryMonths} ח׳`;
    recoveryColor = "var(--text-primary)";
  } else if (drawdown.noRecovery) {
    recoveryDisplay = "טרם הושגה";
    recoveryColor = "#F59E0B";
  } else {
    recoveryDisplay = "—";
    recoveryColor = "var(--text-muted)";
  }

  // Worst month date display
  const worstMonthDate = monthKeyToDisplay(drawdown.worstMonthKey, fund);

  // Monthly returns count for line chart
  const monthlyCount = fund.monthlyReturns ? Object.keys(fund.monthlyReturns).filter(k => typeof fund.monthlyReturns![k] === "number").length : 0;

  return (
    <div style={{
      backgroundColor: "var(--bg-surface)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      padding: "16px 18px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.07)",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Print animation override */}
      <style>{`@media print { .bar-animated { transform: scaleY(1) !important; transition: none !important; } }`}</style>

      {/* ── Header ── */}
      <div style={{ marginBottom: 12 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 7,
          flexWrap: "wrap", marginBottom: 5, direction: "rtl",
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.35 }}>
            {fund.name}
          </span>
          {fund.currency && (
            <span style={{
              fontSize: 10, fontWeight: 700, flexShrink: 0,
              color: fund.currency === "USD" ? "#1d4ed8" : "#059669",
              backgroundColor: fund.currency === "USD" ? "#dbeafe" : "#d1fae5",
              padding: "2px 7px", borderRadius: 4,
            }}>
              {fund.currency}
            </span>
          )}
          {fund.classification && (
            <span style={{
              fontSize: 10, color: "var(--text-secondary)", flexShrink: 0,
              backgroundColor: "var(--bg-surface-alt)",
              padding: "2px 7px", borderRadius: 4,
              border: "1px solid var(--border-table)",
            }}>
              {fund.classification}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", direction: "rtl" }}>
          {[
            fund.manager || null,
            fund.lastReportDate ? `עדכון ${formatReportDate(fund.lastReportDate)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>

      {/* ── Metrics row ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr 1fr",
        gap: 4,
        padding: "11px 0",
        borderTop: "1px solid var(--border-table)",
        borderBottom: "1px solid var(--border-table)",
        marginBottom: 14,
      }}>
        <MetricCell
          label="ממוצע שנתי"
          value={pct(fund.avgAnnualReturn)}
          color={returnColorInline(fund.avgAnnualReturn)}
        />
        <MetricCell
          label="חודש גרוע"
          value={drawdown.worstMonth !== null ? pct(drawdown.worstMonth) : "—"}
          subValue={worstMonthDate || undefined}
          color={drawdown.worstMonth !== null ? returnColorInline(drawdown.worstMonth) : "var(--text-muted)"}
        />
        <div style={{ textAlign: "center", padding: "0 2px" }}>
          <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginBottom: 4, whiteSpace: "nowrap", display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
            התאוששות
            <InfoTooltip text="מספר החודשים שנדרשו לקרן לחזור לשיא שלפני הירידה החדה ביותר" />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: recoveryColor, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
            {recoveryDisplay}
          </div>
        </div>
        <MetricCell
          label="שארפ"
          value={fund.sharpe !== null ? num(fund.sharpe) : "—"}
          color={fund.sharpe !== null ? returnColorInline(fund.sharpe) : "var(--text-muted)"}
        />
      </div>

      {/* ── Year bar chart ── */}
      {hasAnyYear && (
        <div style={{ display: "flex", gap: 3, direction: "ltr" }}>
          {YEAR_KEYS.map((y, i) => {
            const val = yearValues[i];
            const opacity = y.isYtd ? 0.65 : 1;

            if (val === null) {
              return (
                <div key={y.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", opacity: 0.25 }}>
                  <div style={{ height: 11 }} />
                  <div style={{ height: MAX_BAR_HEIGHT, display: "flex", alignItems: "flex-end", width: "100%", justifyContent: "center" }}>
                    <div style={{ width: "70%", height: 3, backgroundColor: "var(--border)" }} />
                  </div>
                  <div style={{ fontSize: 7.5, color: "var(--text-muted)", marginTop: 3 }}>{y.label}</div>
                </div>
              );
            }

            const barHeight = Math.max(3, Math.round((Math.abs(val) / maxAbs) * MAX_BAR_HEIGHT));
            const isPos = val >= 0;

            return (
              <div
                key={y.key}
                style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", opacity, position: "relative" }}
                onMouseEnter={() => setHoveredBar(i)}
                onMouseLeave={() => setHoveredBar(null)}
              >
                {/* Value label */}
                <div style={{
                  fontSize: 7.5,
                  color: returnColorInline(val),
                  fontVariantNumeric: "tabular-nums",
                  height: 11,
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  lineHeight: 1,
                }}>
                  {(val * 100).toFixed(1)}%
                </div>
                {/* Bar container */}
                <div style={{ height: MAX_BAR_HEIGHT, display: "flex", alignItems: "flex-end", width: "100%", justifyContent: "center", position: "relative" }}>
                  {/* Zero line */}
                  <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0,
                    height: 1, backgroundColor: "var(--border-table)", opacity: 0.5,
                  }} />
                  <div
                    className="bar-animated"
                    style={{
                      width: "72%",
                      height: barHeight,
                      background: isPos
                        ? "linear-gradient(to top, #059669, #34d399)"
                        : "linear-gradient(to bottom, #dc2626, #f87171)",
                      borderRadius: isPos ? "4px 4px 0 0" : "0 0 4px 4px",
                      transformOrigin: "bottom",
                      transform: animated ? "scaleY(1)" : "scaleY(0)",
                      transition: `transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.06}s`,
                    }}
                  />
                </div>
                {/* Hover tooltip */}
                <BarTooltip
                  value={`${(val * 100).toFixed(2)}%`}
                  year={y.isYtd ? "YTD " + y.label : y.label}
                  visible={hoveredBar === i}
                />
                {/* Year label */}
                <div style={{ fontSize: 7.5, color: "var(--text-muted)", marginTop: 3, whiteSpace: "nowrap" }}>
                  {y.isYtd ? "YTD" : y.label}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Monthly line chart ── */}
      {monthlyCount >= 12 && fund.monthlyReturns && (
        <MonthlyLineChart monthlyReturns={fund.monthlyReturns} />
      )}
    </div>
  );
}
