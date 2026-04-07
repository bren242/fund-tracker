"use client";

import { Fund } from "@/lib/types";
import { pct, num, formatReportDate, returnColorInline } from "@/lib/format";

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
  recoveryMonths: number | null;
}

export function calculateDrawdown(
  monthlyReturns: Record<string, number> | undefined,
): DrawdownResult {
  if (!monthlyReturns) return { worstMonth: null, recoveryMonths: null };
  const entries = Object.entries(monthlyReturns)
    .filter(([, v]) => typeof v === "number")
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) return { worstMonth: null, recoveryMonths: null };

  const values = entries.map(([, v]) => v);
  const worstMonth = Math.min(...values);
  const worstIdx = values.indexOf(worstMonth);

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

  return { worstMonth, recoveryMonths };
}

/* ── MetricCell ── */
function MetricCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ textAlign: "center", padding: "0 2px" }}>
      <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginBottom: 4, whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

/* ── FundCard ── */
export default function FundCard({ fund }: { fund: Fund }) {
  const drawdown = calculateDrawdown(fund.monthlyReturns);
  const yearValues = YEAR_KEYS.map((y) => fund.returns[y.key]);
  const hasAnyYear = yearValues.some((v) => v !== null);
  const maxAbs = yearValues
    .filter((v): v is number => v !== null)
    .reduce((m, v) => Math.max(m, Math.abs(v)), 0.001);

  const recoveryDisplay = drawdown.recoveryMonths !== null
    ? `${drawdown.recoveryMonths} ח׳`
    : "—";

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
          color={drawdown.worstMonth !== null ? returnColorInline(drawdown.worstMonth) : "var(--text-muted)"}
        />
        <MetricCell
          label="התאוששות"
          value={recoveryDisplay}
          color={drawdown.recoveryMonths !== null ? "var(--text-primary)" : "var(--text-muted)"}
        />
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
              <div key={y.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", opacity }}>
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
                {/* Bar container (fixed height, bar grows from bottom) */}
                <div style={{ height: MAX_BAR_HEIGHT, display: "flex", alignItems: "flex-end", width: "100%", justifyContent: "center" }}>
                  <div style={{
                    width: "72%",
                    height: barHeight,
                    backgroundColor: isPos ? "var(--positive)" : "var(--negative)",
                    borderRadius: isPos ? "3px 3px 0 0" : "0 0 3px 3px",
                  }} />
                </div>
                {/* Year label */}
                <div style={{ fontSize: 7.5, color: "var(--text-muted)", marginTop: 3, whiteSpace: "nowrap" }}>
                  {y.isYtd ? "YTD" : y.label}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
