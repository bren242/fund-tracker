"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Category, Fund } from "@/lib/types";
import { pct, num, returnColorInline, formatReportDate } from "@/lib/format";
import FundOnePagerModal from "./FundOnePagerModal";
import { useBrand } from "@/lib/useBrand";
import { getYTD, getAnnualReturn, getSharpe, getStdDev, getAvgAnnualReturn, getLatestMonthly, getLastUpdated } from "@/lib/fundDerived";
import { computePeriodWithCoverage, type PeriodResult } from "@/lib/period-coverage";

// ── Types ──────────────────────────────────────────────────────────────────
type TimeRange     = "ytd" | "12m" | "3y" | "5y" | "max" | "custom";
type YearKey       = "2020" | "2021" | "2022" | "2023" | "2024" | "2025" | "ytd2026" | "avg";
type NoxSelectYear = "2020" | "2021" | "2022" | "2023" | "2024" | "2025" | "ytd2026";

// ── Constants ──────────────────────────────────────────────────────────────
const MONTH_HE: Record<string, string> = {
  "01": "ינו", "02": "פבר", "03": "מרץ", "04": "אפר",
  "05": "מאי", "06": "יוני", "07": "יול", "08": "אוג",
  "09": "ספט", "10": "אוק", "11": "נוב", "12": "דצמ",
};

const MONTH_HE_FULL: Record<string, string> = {
  "01": "ינואר", "02": "פברואר", "03": "מרץ", "04": "אפריל",
  "05": "מאי", "06": "יוני", "07": "יולי", "08": "אוגוסט",
  "09": "ספטמבר", "10": "אוקטובר", "11": "נובמבר", "12": "דצמבר",
};

function fmtUpdateCell(fund: Fund): string {
  return formatReportDate(getLastUpdated(fund));
}

function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

type UpdateStatus = "current" | "recent" | "stale" | "missing";

const YEAR_OPTIONS: { key: YearKey; label: string }[] = [
  { key: "2020",    label: "2020" },
  { key: "2021",    label: "2021" },
  { key: "2022",    label: "2022" },
  { key: "2023",    label: "2023" },
  { key: "2024",    label: "2024" },
  { key: "2025",    label: "2025" },
  { key: "ytd2026", label: "YTD 2026" },
  { key: "avg",     label: "ממוצע שנתי" },
];

const NOX_YEAR_OPTIONS: { key: NoxSelectYear; label: string }[] = [
  { key: "2020",    label: "2020" },
  { key: "2021",    label: "2021" },
  { key: "2022",    label: "2022" },
  { key: "2023",    label: "2023" },
  { key: "2024",    label: "2024" },
  { key: "2025",    label: "2025" },
  { key: "ytd2026", label: "YTD" },
];

const TIME_RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: "ytd",    label: "YTD" },
  { key: "12m",   label: "12M" },
  { key: "3y",    label: "3Y" },
  { key: "5y",    label: "5Y" },
  { key: "max",   label: "MAX" },
  { key: "custom", label: "Custom" },
];

const TOTAL_COLS = 6; // name | date | monthly | period | avg | sharpe

// ── Date helpers (module-level, evaluated once) ────────────────────────────
const _today = new Date();
const _toYM = `${_today.getFullYear()}-${String(_today.getMonth() + 1).padStart(2, "0")}`;

function subtractMonths(ym: string, months: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 - months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const RANGES: Record<Exclude<TimeRange, "custom">, { from: string | null; to: string }> = {
  ytd:  { from: `${_today.getFullYear()}-01`, to: _toYM },
  "12m": { from: subtractMonths(_toYM, 12),   to: _toYM },
  "3y":  { from: subtractMonths(_toYM, 36),   to: _toYM },
  "5y":  { from: subtractMonths(_toYM, 60),   to: _toYM },
  max:   { from: null,                         to: _toYM },
};

/** Expected months for each named range (0 = MAX, no expectation) */
const RANGE_EXPECTED: Record<Exclude<TimeRange, "custom">, { label: "YTD" | "12M" | "3Y" | "5Y" | "MAX"; months: number }> = {
  ytd:  { label: "YTD", months: _today.getMonth() + 1 },
  "12m": { label: "12M", months: 12 },
  "3y":  { label: "3Y",  months: 36 },
  "5y":  { label: "5Y",  months: 60 },
  max:   { label: "MAX", months: 0 },
};

// Month options: 2019-01 → current month
const MONTH_OPTIONS: { value: string; label: string }[] = (() => {
  const opts: { value: string; label: string }[] = [];
  let year = 2019, month = 1;
  while (
    year < _today.getFullYear() ||
    (year === _today.getFullYear() && month <= _today.getMonth() + 1)
  ) {
    const mm = String(month).padStart(2, "0");
    opts.push({ value: `${year}-${mm}`, label: `${MONTH_HE_FULL[mm]} ${year}` });
    if (++month > 12) { month = 1; year++; }
  }
  return opts;
})();

// ── Helpers ────────────────────────────────────────────────────────────────
function calcRangeReturn(
  monthlyReturns: Record<string, number> | undefined,
  fromYearMonth: string | null,
  toYearMonth: string,
  startDate?: string
): number | null {
  if (!monthlyReturns) return null;
  const startYYYYMM = startDate ? startDate.slice(0, 7) : null;
  const keys = Object.keys(monthlyReturns)
    .filter(k => {
      if (fromYearMonth !== null && k < fromYearMonth) return false;
      if (startYYYYMM !== null && k < startYYYYMM) return false;
      if (k > toYearMonth) return false;
      return true;
    })
    .sort();
  if (keys.length === 0) return null;
  return keys.reduce((acc, k) => acc * (1 + monthlyReturns[k]), 1) - 1;
}

function calcCumulative(fund: Fund): number | null {
  if (fund.monthlyReturns) {
    const startYYYYMM = fund.startDate ? fund.startDate.slice(0, 7) : null;
    const keys = Object.keys(fund.monthlyReturns)
      .filter(k => typeof fund.monthlyReturns![k] === "number" && (startYYYYMM === null || k >= startYYYYMM))
      .sort();
    if (keys.length > 0)
      return keys.reduce((acc, k) => acc * (1 + fund.monthlyReturns![k]), 1) - 1;
  }
  // Fallback: yearly returns
  const yearly = ["y2019","y2020","y2021","y2022","y2023","y2024","y2025","ytd2026"] as const;
  const vals = yearly.map(k => (fund.returns as Record<string, number | null>)[k]).filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  return vals.reduce((acc, v) => acc * (1 + v), 1) - 1;
}

function getYearReturn(fund: Fund, year: YearKey): number | null {
  if (year === "avg") return getAvgAnnualReturn(fund);
  if (year === "ytd2026") return getYTD(fund, 2026);
  return getAnnualReturn(fund, parseInt(year));
}

function calcNoxMultiReturn(fund: Fund, years: NoxSelectYear[]): number | null {
  if (years.length === 0) return null;
  const getVal = (y: NoxSelectYear): number | null =>
    y === "ytd2026" ? (fund.returns?.ytd2026 ?? null) : getAnnualReturn(fund, parseInt(y));
  if (years.length === 1) return getVal(years[0]);
  const vals: number[] = [];
  for (const y of years) {
    const v = getVal(y);
    if (v === null) return null;
    vals.push(v);
  }
  return Math.pow(vals.reduce((a, r) => a * (1 + r), 1), 1 / vals.length) - 1;
}

/** ממוצע שנתי מ-y2020 עד y2025 — שנים עם ערך בלבד (YTD לא נכלל) */
function calcAnnualAvgFromReturns(fund: Fund): number | null {
  const years = [2020, 2021, 2022, 2023, 2024, 2025] as const;
  const vals = years.map(y => getAnnualReturn(fund, y)).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function sharpeColor(s: number | null): string {
  if (s === null) return "var(--text-muted)";
  if (s >= 1)   return "#059669";
  if (s >= 0.5) return "#B8975A";
  return "#dc2626";
}

function getClassBadge(cls: string): { label: string; bg: string; color: string } | null {
  const c = cls.toLowerCase();
  if (c.includes("מולטי") || c.includes("multi")) return { label: "MULTI", bg: "#eef2fb", color: "#3a5fa0" };
  if (c.includes("אג"))                           return { label: "BOND",  bg: "#fdf5e8", color: "#8a6020" };
  if (c.includes("לונג") || c.includes("long"))  return { label: "LONG",  bg: "#e8f5ee", color: "#1B3A2F" };
  return null;
}

// ── Segmented Control ──────────────────────────────────────────────────────
function SegmentedControl({ value, onChange }: { value: TimeRange; onChange: (v: TimeRange) => void }) {
  return (
    <div style={{
      display: "inline-flex",
      background: "#F4F3EF",
      borderRadius: 5,
      padding: 2,
      flexShrink: 0,
    }}>
      {TIME_RANGE_OPTIONS.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            style={{
              padding: "4px 9px", fontSize: 11,
              fontWeight: active ? 500 : 400,
              border: "none",
              borderRadius: active ? 3 : 0,
              cursor: "pointer",
              backgroundColor: active ? "#1B3A2F" : "transparent",
              color: active ? "#ffffff" : "rgba(27, 58, 47, 0.6)",
              transition: "all 0.12s",
              whiteSpace: "nowrap",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── NOX Year Selector (multi-select) ──────────────────────────────────────
function NoxYearSelector({ selected, onToggle }: {
  selected: NoxSelectYear[];
  onToggle: (y: NoxSelectYear) => void;
}) {
  return (
    <div style={{
      display: "inline-flex",
      background: "#F4F3EF",
      borderRadius: 5,
      padding: 2,
      flexShrink: 0,
    }}>
      {NOX_YEAR_OPTIONS.map((o) => {
        const active = selected.includes(o.key);
        return (
          <button
            key={o.key}
            onClick={() => onToggle(o.key)}
            style={{
              padding: "4px 9px", fontSize: 11,
              fontWeight: active ? 500 : 400,
              border: "none",
              borderRadius: active ? 3 : 0,
              cursor: "pointer",
              backgroundColor: active ? "#c8a96b" : "transparent",
              color: active ? "#ffffff" : "rgba(27, 58, 47, 0.6)",
              transition: "all 0.12s",
              whiteSpace: "nowrap",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Year Selector (no-monthly mode) ───────────────────────────────────────
function YearSelector({ value, onChange }: { value: YearKey; onChange: (v: YearKey) => void }) {
  return (
    <div style={{
      display: "inline-flex",
      flexWrap: "wrap",
      background: "#e8e8ed",
      borderRadius: 10,
      padding: 3,
      gap: 0,
    }}>
      {YEAR_OPTIONS.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            style={{
              padding: "6px 13px", fontSize: 12,
              fontWeight: active ? 600 : 400,
              border: "none",
              borderRadius: active ? 8 : 0,
              cursor: "pointer",
              backgroundColor: active ? "#ffffff" : "transparent",
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
              color: active ? "var(--text-primary)" : "#666",
              transition: "all 0.12s",
              whiteSpace: "nowrap",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Category Pills ─────────────────────────────────────────────────────────
function CategoryPills({ sections, active, onSelect, onHover }: {
  sections: string[]; active: string; onSelect: (v: string) => void;
  onHover?: (section: string | null) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {["הכל", ...sections].map(s => {
        const isActive = active === s;
        return (
          <button
            key={s}
            onClick={() => onSelect(s)}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(27, 58, 47, 0.3)";
                (e.currentTarget as HTMLButtonElement).style.color = "#1B3A2F";
              }
              onHover?.(s !== "הכל" ? s : null);
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(27, 58, 47, 0.15)";
                (e.currentTarget as HTMLButtonElement).style.color = "rgba(27, 58, 47, 0.65)";
              }
            }}
            style={{
              padding: "4px 11px", borderRadius: 11, fontSize: 11,
              fontWeight: isActive ? 500 : 400, cursor: "pointer",
              border: `0.5px solid ${isActive ? "#1B3A2F" : "rgba(27, 58, 47, 0.15)"}`,
              backgroundColor: isActive ? "#1B3A2F" : "#ffffff",
              color: isActive ? "#ffffff" : "rgba(27, 58, 47, 0.65)",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

// ── Monthly Pills ──────────────────────────────────────────────────────────
function MonthlyPills({ monthlyReturns }: { monthlyReturns?: Record<string, number> }) {
  if (!monthlyReturns) {
    return <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>נתונים חודשיים יתווספו בקרוב</span>;
  }
  const entries = Object.entries(monthlyReturns)
    .filter(([, v]) => typeof v === "number")
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 12)
    .reverse();

  if (entries.length === 0) {
    return <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>נתונים חודשיים יתווספו בקרוב</span>;
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {entries.map(([key, val]) => {
        const match = key.match(/^(\d{4})-(\d{2})$/);
        const monthLabel = match ? (MONTH_HE[match[2]] || match[2]) : key;
        const yearLabel  = match ? `'${match[1].slice(2)}` : "";
        const isPos = val > 0.00005;
        const isNeg = val < -0.00005;
        return (
          <div
            key={key}
            title={`${key}: ${(val * 100).toFixed(2)}%`}
            style={{
              padding: "2px 7px", borderRadius: 6, fontSize: 10,
              fontVariantNumeric: "tabular-nums",
              backgroundColor: isPos ? "#d1fae5" : isNeg ? "#fee2e2" : "var(--bg-surface-alt)",
              color: isPos ? "#065f46" : isNeg ? "#991b1b" : "var(--text-muted)",
              border: `1px solid ${isPos ? "#a7f3d0" : isNeg ? "#fca5a5" : "var(--border-table)"}`,
            }}
          >
            {monthLabel}{yearLabel} {isPos ? "+" : ""}{(val * 100).toFixed(1)}%
          </div>
        );
      })}
    </div>
  );
}

// ── Accordion Panel ────────────────────────────────────────────────────────
function AccordionPanel({ fund, isNox }: { fund: Fund; isNox?: boolean }) {
  const cumulative = calcCumulative(fund);
  const derivedStdDev = getStdDev(fund);
  const derivedSharpe = getSharpe(fund);

  const sep = <span style={{ color: "var(--text-muted)", margin: "0 5px" }}>·</span>;
  const lbl = (t: string) => <span style={{ color: "var(--text-muted)", marginLeft: 3 }}>{t}</span>;

  return (
    <tr>
      <td colSpan={TOTAL_COLS} style={{ padding: 0 }}>
        <div style={{
          backgroundColor: "var(--bg-surface-alt)",
          borderTop: "1px solid var(--border-table)",
          borderBottom: "1px solid var(--border-table)",
          padding: "12px 24px",
          direction: "rtl",
        }}>
          {/* Single info line */}
          <div style={{
            display: "flex", flexWrap: "wrap", alignItems: "center",
            marginBottom: 12, fontSize: 12, color: "var(--text-secondary)",
            lineHeight: 1.8, fontVariantNumeric: "tabular-nums",
          }}>
            <span>{lbl("מנהל")}{fund.manager || "—"}</span>
            {sep}
            <span>{lbl("סיווג")}{fund.classification || "—"}</span>
            {sep}
            <span>{lbl("הקמה")}{fund.startDate ? `${fund.startDate.slice(5, 7)}/${fund.startDate.slice(0, 4)}` : "—"}</span>
            {sep}
            <span>{lbl("AUM")}{fund.aumMillions != null ? ` ${fund.aumMillions.toLocaleString()} מ׳` : "—"}</span>
            {sep}
            <span>{lbl("מצטבר")}<span style={{ color: returnColorInline(cumulative) }}>{pct(cumulative)}</span></span>
            {sep}
            <span>{lbl("סטיית תקן")}{derivedStdDev != null ? `${(derivedStdDev * 100).toFixed(2)}%` : "—"}</span>
            {sep}
            <span>{lbl("שארפ")}<span style={{ color: "#B8975A" }}>{derivedSharpe != null ? num(derivedSharpe) : "—"}</span></span>
          </div>

          {/* Monthly pills */}
          {isNox ? (
            fund.noxMtdLog && Object.keys(fund.noxMtdLog).length > 0 ? (
              <div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>היסטוריית חודשים</div>
                <MonthlyPills monthlyReturns={
                  Object.fromEntries(Object.entries(fund.noxMtdLog).sort((a, b) => b[0].localeCompare(a[0])))
                } />
              </div>
            ) : null
          ) : (
            <div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>12 חודשים אחרונים</div>
              <MonthlyPills monthlyReturns={fund.monthlyReturns} />
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Fund Row ───────────────────────────────────────────────────────────────
function FundRowV2({
  fund, even, comparisonEnabled, isSelected, onToggle, selectionDisabled,
  accentColor, periodReturn, periodResult, annualAvg, isOpen, onToggleAccordion, isFirst,
  aiAvailable, onOpenAi, consistencyHref, latestMonth, timeRange, isNox,
}: {
  fund: Fund;
  even: boolean;
  comparisonEnabled?: boolean;
  isSelected?: boolean;
  onToggle?: (id: string) => void;
  selectionDisabled?: boolean;
  accentColor?: string;
  periodReturn: number | null;
  /** Full coverage result for time-range mode — drives sub-label and period CAGR */
  periodResult?: PeriodResult | null;
  annualAvg?: number | null;
  isOpen: boolean;
  onToggleAccordion: () => void;
  isFirst?: boolean;
  aiAvailable?: boolean;
  onOpenAi?: (fundId: string) => void;
  /** Link to the per-fund consistency page. When provided, shows a "📊" button. */
  consistencyHref?: string;
  latestMonth: string | null;
  timeRange: TimeRange;
  isNox?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const bg = even ? "#ffffff" : "#fafafa";
  const classBadge = getClassBadge(fund.classification || "");
  const derivedSharpe = getSharpe(fund);
  const derivedMonthly = isNox
    ? (fund.noxMtdLog && fund.lastMonth && fund.noxMtdLog[fund.lastMonth] !== undefined
        ? fund.noxMtdLog[fund.lastMonth]
        : null)
    : getLatestMonthly(fund);
  const shColor = sharpeColor(derivedSharpe);

  // Update-status for lastUpdated column
  const fundLastUpdated = getLastUpdated(fund);
  let updateStatus: UpdateStatus = "missing";
  if (fundLastUpdated && latestMonth) {
    const diff = monthDiff(fundLastUpdated, latestMonth);
    if (diff === 0)      updateStatus = "current";
    else if (diff <= 2)  updateStatus = "recent";
    else                 updateStatus = "stale";
  } else if (fundLastUpdated) {
    updateStatus = "stale";
  }
  const updateCellStyle: React.CSSProperties =
    updateStatus === "current" ? { color: "#0f172a", fontWeight: 600 } :
    updateStatus === "recent"  ? { color: "#475569", fontWeight: 500 } :
    updateStatus === "stale"   ? { color: "#94a3b8", fontWeight: 400 } :
                                 { color: "#cbd5e1", fontWeight: 400 };

  // Period sub-label — driven by coverage result when available
  let periodSubLabel: React.ReactNode = null;
  if (periodResult) {
    if (periodResult.status === "partial") {
      // Amber label: actual duration + start date
      periodSubLabel = (
        <div style={{ fontSize: "75%", fontWeight: 400, color: "#f59e0b", marginTop: 2, letterSpacing: 0 }}>
          {periodResult.effectiveLabel}
        </div>
      );
    } else if (periodResult.status === "full" && timeRange === "max" && periodResult.effectiveFromYM) {
      // MAX: grey label showing actual duration + start month (Hebrew style)
      const months = periodResult.monthsActual;
      const years = Math.floor(months / 12);
      const [y, m] = periodResult.effectiveFromYM.split("-");
      const fromLabel = `${m}/${y}`;
      const duration = months < 12
        ? (months === 1 ? "חודש" : `${months} חודשים`)
        : years === 1 ? "שנה"
        : years === 2 ? "שנתיים"
        : `${years} שנים`;
      periodSubLabel = (
        <div style={{ fontSize: "75%", fontWeight: 400, color: "#94a3b8", marginTop: 2, letterSpacing: 0 }}>
          {duration} · מ-{fromLabel}
        </div>
      );
    }
  }

  const cell: React.CSSProperties = {
    padding: "8px 10px",
    borderBottom: "none",
    fontVariantNumeric: "tabular-nums",
    textAlign: "center",
    whiteSpace: "nowrap",
    fontSize: 11,
  };

  return (
    <tr
      onClick={onToggleAccordion}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundColor: bg,
        cursor: "pointer",
        borderInlineStart: comparisonEnabled && isSelected
          ? `2px solid ${accentColor || "var(--accent)"}` : "none",
        transform: hovered ? "translateY(-1px)" : "none",
        boxShadow: hovered ? "0 2px 12px rgba(0,0,0,0.06)" : "none",
        transition: "transform 0.15s ease, box-shadow 0.15s ease, background 0.12s",
      }}
    >
      {/* Name */}
      <td style={{ ...cell, textAlign: "right", paddingRight: 12, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {comparisonEnabled && (
            <input
              type="checkbox"
              checked={isSelected || false}
              disabled={selectionDisabled && !isSelected}
              onChange={(e) => { e.stopPropagation(); onToggle?.(fund.id); }}
              onClick={(e) => e.stopPropagation()}
              className="no-print"
              style={{
                cursor: selectionDisabled && !isSelected ? "not-allowed" : "pointer",
                width: 14, height: 14, flexShrink: 0,
                accentColor: accentColor || "#1B3A2F",
                opacity: isSelected ? 1 : hovered ? (selectionDisabled ? 0.35 : 1) : 0,
                transition: "opacity 0.12s",
              }}
              title={selectionDisabled && !isSelected ? "מקסימום 4 קרנות להשוואה" : "בחר להשוואה"}
            />
          )}
          <div
            style={{ flex: 1, minWidth: 0, cursor: comparisonEnabled && !(selectionDisabled && !isSelected) ? "pointer" : "inherit" }}
            onClick={comparisonEnabled ? (e) => { e.stopPropagation(); if (!(selectionDisabled && !isSelected)) onToggle?.(fund.id); } : undefined}
          >
            <div style={{ fontWeight: 600, color: "#1D1D1F", fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fund.name}</div>
            {fund.classification && (
              <div style={{ color: "#86868B", fontSize: 12, fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fund.classification}</div>
            )}
          </div>
          {fund.currency && (
            <span style={{
              fontSize: 9, fontWeight: 700, flexShrink: 0, padding: "1px 5px", borderRadius: 3,
              color: fund.currency === "USD" ? "#1d4ed8" : "#059669",
              backgroundColor: fund.currency === "USD" ? "#dbeafe" : "#d1fae5",
            }}>{fund.currency}</span>
          )}
          {classBadge && (
            <span style={{
              fontSize: "9px", fontWeight: 700, flexShrink: 0, padding: "1px 5px", borderRadius: 3,
              color: classBadge.color, backgroundColor: classBadge.bg,
            }}>{classBadge.label}</span>
          )}
          {aiAvailable && onOpenAi && (
            <button
              className="no-print"
              onClick={(e) => { e.stopPropagation(); onOpenAi(fund.id); }}
              title="סיכום קרן מבוסס AI"
              style={{
                fontSize: 10, fontWeight: 700, flexShrink: 0,
                padding: "2px 7px", borderRadius: 4,
                border: "1px solid var(--border)",
                background: hovered ? "rgba(27,58,47,0.06)" : "transparent",
                color: hovered ? "var(--text-primary)" : "var(--text-secondary)",
                cursor: "pointer", letterSpacing: 0.5,
                transition: "all 0.15s", lineHeight: 1.4,
              }}
            >AI</button>
          )}
          {consistencyHref && (
            <a
              className="no-print"
              href={consistencyHref}
              title="עקביות קרן"
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: 10, fontWeight: 700, flexShrink: 0,
                padding: "2px 7px", borderRadius: 4,
                border: "1px solid var(--border)",
                background: hovered ? "rgba(27,58,47,0.06)" : "transparent",
                color: hovered ? "var(--text-primary)" : "var(--text-secondary)",
                cursor: "pointer", letterSpacing: 0.3,
                transition: "all 0.15s", lineHeight: 1.4,
                textDecoration: "none", display: "inline-flex", alignItems: "center",
              }}
            >
              עקביות
            </a>
          )}
          <span style={{
            fontSize: 10, color: "var(--text-muted)", flexShrink: 0,
            display: "inline-block", transition: "transform 0.2s ease",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}>▾</span>
        </div>
      </td>

      {/* Last report date */}
      <td style={{ ...cell, fontSize: 13, ...updateCellStyle }}>
        {updateStatus === "missing" ? (
          <span style={{ color: "#cbd5e1" }}>—</span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {updateStatus === "current" && (
              <span style={{
                width: 4, height: 4, borderRadius: "50%", flexShrink: 0,
                backgroundColor: "rgba(16,185,129,0.7)", display: "inline-block",
              }} />
            )}
            {fmtUpdateCell(fund)}
          </span>
        )}
      </td>

      {/* Monthly return */}
      <td style={{ ...cell, fontSize: 15, fontWeight: 600, color: returnColorInline(derivedMonthly) }}>{pct(derivedMonthly)}</td>

      {/* Period return (computed from monthlyReturns) */}
      <td style={{ ...cell, fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px", color: returnColorInline(periodReturn) }}>
        {pct(periodReturn)}
        {periodSubLabel}
      </td>

      {/* Avg annual — yearMode: computed from y2020-y2025; time-range mode: period CAGR */}
      {(() => {
        const v = annualAvg !== undefined
          ? annualAvg
          : periodResult?.cagr ?? getAvgAnnualReturn(fund);
        return (
          <td style={{ ...cell, fontSize: 15, fontWeight: 500, color: returnColorInline(v) }}>{pct(v)}</td>
        );
      })()}

      {/* Sharpe with dot */}
      <td style={{ ...cell, fontSize: 14, fontWeight: 400, color: "#555" }}>
        {derivedSharpe != null ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              backgroundColor: shColor, display: "inline-block",
            }} />
            <span style={{ color: shColor }}>{num(derivedSharpe)}</span>
          </span>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>—</span>
        )}
      </td>
    </tr>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function FundTableV2({
  categories,
  comparisonEnabled,
  selectedFundIds,
  onToggleFund,
  accentColor,
  clientKey,
}: {
  categories: Category[];
  comparisonEnabled?: boolean;
  selectedFundIds?: Set<string>;
  onToggleFund?: (id: string) => void;
  accentColor?: string;
  /** Passed from parent; required for the AI One-Pager feature. */
  clientKey?: string;
}) {
  const [timeRange, setTimeRange]             = useState<TimeRange>("3y");
  const [customFrom, setCustomFrom]           = useState("2022-01");
  const [customTo, setCustomTo]               = useState(_toYM);
  const [activeFilter, setActiveFilter]       = useState("הכל");
  const [activeClassification, setActiveClassification] = useState<string | null>(null);
  const [hoveredSection, setHoveredSection]   = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [openAccordions, setOpenAccordions]   = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery]         = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Brand — read once per clientKey; used to gate aiReport feature flag
  const brand = useBrand(clientKey || "");
  const isNox = clientKey === "nox";

  // AI One-Pager: available only if (1) brand.features.aiReport is on AND
  //               (2) ANTHROPIC_API_KEY is configured on the server
  const [apiKeyAvailable, setApiKeyAvailable] = useState(false);
  const [aiFundId, setAiFundId]               = useState<string | null>(null);
  const aiFeatureOn = !!clientKey && (brand.features?.aiReport === true);
  useEffect(() => {
    if (!aiFeatureOn) return;
    let abort = false;
    fetch(`/api/fund-report?check=true&client=${encodeURIComponent(clientKey!)}`)
      .then((r) => r.json())
      .then((d: { available?: boolean }) => {
        if (!abort) setApiKeyAvailable(!!d.available);
      })
      .catch(() => { /* silent — button simply won't render */ });
    return () => { abort = true; };
  }, [clientKey, aiFeatureOn]);

  const aiAvailable = aiFeatureOn && apiKeyAvailable;

  const totalActiveFunds = useMemo(() =>
    categories.reduce((s, c) => s + c.funds.length, 0),
  [categories]);

  const latestMonth = useMemo(() => {
    let max: string | null = null;
    for (const cat of categories) {
      for (const f of cat.funds) {
        const lu = getLastUpdated(f);
        if (lu && (!max || lu > max)) max = lu;
      }
    }
    return max;
  }, [categories]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && searchQuery) {
        setSearchQuery("");
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchQuery]);

  // Year-mode: activated when no fund has monthlyReturns data (e.g. NOX)
  const [isYearMode, setIsYearMode]         = useState(false);
  const [selectedYears, setSelectedYears]   = useState<NoxSelectYear[]>(["ytd2026"]);
  const modeDetected = useRef(false);

  const toggleNoxYear = (y: NoxSelectYear) => setSelectedYears(prev =>
    prev.includes(y) ? (prev.length === 1 ? prev : prev.filter(k => k !== y)) : [...prev, y]
  );
  useEffect(() => {
    if (modeDetected.current || categories.length === 0) return;
    const hasMonthly = categories.some(cat =>
      cat.funds.some(f => f.monthlyReturns && Object.keys(f.monthlyReturns).length > 0)
    );
    if (!hasMonthly) setIsYearMode(true);
    modeDetected.current = true;
  }, [categories]);

  const selectionDisabled = (selectedFundIds?.size ?? 0) >= 4;

  // Range bounds for period calculation
  const { rangeFrom, rangeTo } = useMemo(() => {
    if (timeRange === "custom") return { rangeFrom: customFrom, rangeTo: customTo };
    const r = RANGES[timeRange];
    return { rangeFrom: r.from, rangeTo: r.to };
  }, [timeRange, customFrom, customTo]);

  // Unique section labels
  const sectionLabels = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of categories) {
      if (!seen.has(c.parentSection)) { seen.add(c.parentSection); out.push(c.parentSection); }
    }
    return out;
  }, [categories]);

  // Sub bar classifications (from hovered section)
  const subBarClassifications = useMemo(() => {
    if (!hoveredSection) return [];
    const cats = categories.filter(c => c.parentSection === hoveredSection || c.name === hoveredSection);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const cat of cats) {
      for (const fund of cat.funds) {
        if (fund.classification && !seen.has(fund.classification)) {
          seen.add(fund.classification);
          out.push(fund.classification);
        }
      }
    }
    return out;
  }, [categories, hoveredSection]);

  // Filtered categories
  const filteredCats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let cats = activeFilter === "הכל"
      ? categories
      : categories.filter(c => c.parentSection === activeFilter || c.name === activeFilter);
    if (activeClassification) {
      cats = cats.map(c => ({ ...c, funds: c.funds.filter(f => f.classification === activeClassification) }))
                 .filter(c => c.funds.length > 0);
    }
    if (q) {
      cats = cats.map(c => ({ ...c, funds: c.funds.filter(f => f.name.toLowerCase().includes(q)) }))
                 .filter(c => c.funds.length > 0);
    }
    return cats;
  }, [categories, activeFilter, activeClassification, searchQuery]);

  // Grouped by section
  const { sectionMap, sectionOrder } = useMemo(() => {
    const map = new Map<string, typeof filteredCats>();
    const order: string[] = [];
    for (const cat of filteredCats) {
      if (!map.has(cat.parentSection)) { map.set(cat.parentSection, []); order.push(cat.parentSection); }
      map.get(cat.parentSection)!.push(cat);
    }
    return { sectionMap: map, sectionOrder: order };
  }, [filteredCats]);

  const toggleGroup = (s: string) => setCollapsedGroups(prev => {
    const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n;
  });
  const toggleAccordion = (id: string) => setOpenAccordions(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const resetAccordions = () => setOpenAccordions(new Set());

  const totalFunds = filteredCats.reduce((s, c) => s + c.funds.length, 0);

  // Column header label for period column
  const periodLabel = useMemo(() => {
    if (isYearMode) {
      if (selectedYears.length === 1) {
        const y = selectedYears[0];
        return y === "ytd2026" ? "YTD 2026" : y;
      }
      const order: NoxSelectYear[] = ["2020","2021","2022","2023","2024","2025","ytd2026"];
      const sorted = [...selectedYears].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      return sorted.map(y => y === "ytd2026" ? "YTD" : y).join(" + ");
    }
    if (timeRange === "custom") {
      const fOpt = MONTH_OPTIONS.find(o => o.value === customFrom);
      const tOpt = MONTH_OPTIONS.find(o => o.value === customTo);
      return `${fOpt?.label || customFrom} — ${tOpt?.label || customTo}`;
    }
    const labels: Record<TimeRange, string> = {
      ytd: "מתחילת שנה", "12m": "12 חודשים",
      "3y": "3 שנים", "5y": "5 שנים", max: "מקס", custom: "",
    };
    return labels[timeRange];
  }, [isYearMode, selectedYears, timeRange, customFrom, customTo]);

  // "ממוצע שנתי" column header — shows which period the CAGR is over
  const avgColumnLabel = useMemo(() => {
    if (isYearMode || timeRange === "custom") return "ממוצע שנתי";
    const suffix: Record<Exclude<TimeRange, "custom">, string> = {
      ytd: "YTD", "12m": "12M", "3y": "3Y", "5y": "5Y", max: "MAX",
    };
    return `ממוצע שנתי (${suffix[timeRange]})`;
  }, [isYearMode, timeRange]);

  const thBase: React.CSSProperties = {
    position: "sticky",
    top: 136,
    zIndex: 10,
    backgroundColor: "#FAFAF7",
    color: "rgba(27, 58, 47, 0.5)",
    fontWeight: 500,
    textAlign: "center",
    whiteSpace: "nowrap",
    fontSize: "10.5px",
    letterSpacing: "0.2px",
    padding: "9px 10px",
    borderBottom: "0.5px solid rgba(27, 58, 47, 0.07)",
  };

  const selectStyle: React.CSSProperties = {
    padding: "3px 8px", borderRadius: 5, fontSize: 11,
    border: "1px solid var(--border)", cursor: "pointer",
    backgroundColor: "var(--bg-input)", color: "var(--text-primary)",
  };

  return (
    <div style={{ direction: "rtl", background: "#f5f5f7", width: "100%" }}>

      {/* ── Controls bar — sticky ── */}
      <div
        className="no-print"
        onMouseLeave={() => setHoveredSection(null)}
        style={{
          position: "sticky",
          top: 52,
          zIndex: 99,
          background: "#ffffff",
        }}
      >
        {/* Row 1: search + count + time-range */}
        <div style={{
          display: "flex",
          alignItems: "center",
          padding: "0 32px",
          height: 44,
          gap: 12,
          borderBottom: "0.5px solid rgba(27, 58, 47, 0.08)",
        }}>
          {/* Search input */}
          <div style={{ position: "relative", width: 180, flexShrink: 0 }}>
            <div style={{
              position: "absolute", top: "50%", right: 9, transform: "translateY(-50%)",
              pointerEvents: "none", display: "flex", alignItems: "center",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </div>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="חיפוש קרן..."
              style={{
                width: "100%", height: 30, paddingRight: 28,
                paddingLeft: searchQuery ? 26 : 10,
                border: "0.5px solid rgba(27, 58, 47, 0.2)", borderRadius: 5,
                backgroundColor: "#ffffff", color: "#1B3A2F",
                fontSize: 12, outline: "none", boxSizing: "border-box",
                transition: "border-color 0.15s",
                direction: "rtl",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "#1B3A2F"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "rgba(27, 58, 47, 0.2)"; }}
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(""); searchInputRef.current?.focus(); }}
                style={{
                  position: "absolute", top: "50%", left: 6, transform: "translateY(-50%)",
                  border: "none", background: "none", cursor: "pointer", padding: 2,
                  color: "#9ca3af", display: "flex", alignItems: "center",
                  borderRadius: 4, lineHeight: 1,
                }}
                aria-label="נקה חיפוש"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>

          {/* Fund count */}
          <span style={{ fontSize: 11, color: "rgba(27, 58, 47, 0.5)", whiteSpace: "nowrap", flexShrink: 0 }}>
            {searchQuery.trim()
              ? `${totalFunds} / ${totalActiveFunds}`
              : totalActiveFunds.toString()}
          </span>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Time range / year selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            {isYearMode ? (
              <NoxYearSelector selected={selectedYears} onToggle={toggleNoxYear} />
            ) : (
              <>
                <SegmentedControl value={timeRange} onChange={(v) => { setTimeRange(v); resetAccordions(); }} />
                {timeRange === "custom" && (
                  <>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>מ-</span>
                    <select value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={selectStyle}>
                      {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>עד</span>
                    <select value={customTo} onChange={e => setCustomTo(e.target.value)} style={selectStyle}>
                      {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Row 2: category pills */}
        <div style={{
          height: 40,
          padding: "0 32px",
          display: "flex",
          gap: 5,
          flexWrap: "wrap",
          alignItems: "center",
          borderBottom: subBarClassifications.length > 0 ? "none" : "0.5px solid rgba(27, 58, 47, 0.15)",
        }}>
          <CategoryPills
            sections={sectionLabels}
            active={activeFilter}
            onSelect={(v) => { setActiveFilter(v); setActiveClassification(null); resetAccordions(); }}
            onHover={setHoveredSection}
          />
        </div>

        {/* Classification sub-bar */}
        {subBarClassifications.length > 0 && (
          <div style={{
            background: "#f5f5f7", padding: "8px 32px",
            borderBottom: "2px solid #1B3A2F",
            display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
          }}>
            {subBarClassifications.map(cls => {
              const isActive = activeClassification === cls;
              return (
                <button
                  key={cls}
                  onClick={() => setActiveClassification(isActive ? null : cls)}
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "rgba(27,58,47,0.06)"; }}
                  onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  style={{
                    fontSize: 12, padding: "3px 10px", borderRadius: 20,
                    cursor: "pointer",
                    color: isActive ? "#1B3A2F" : "#555",
                    fontWeight: isActive ? 600 : 400,
                    background: isActive ? "#eef2f0" : "transparent",
                    border: isActive ? "0.5px solid #1B3A2F" : "0.5px solid #ddd",
                    transition: "background 0.12s, color 0.12s, border-color 0.12s",
                  }}
                >
                  {cls}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      {totalFunds === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
          {searchQuery.trim()
            ? `לא נמצאו קרנות התואמות לחיפוש "${searchQuery.trim()}"`
            : "לא נמצאו קרנות."}
        </div>
      ) : (
        <div style={{ overflow: "clip", background: "#ffffff" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "11px", lineHeight: 1.45 }}>
            <thead>
              <tr>
                <th style={{ ...thBase, textAlign: "right", paddingRight: 12 }}>שם קרן</th>
                <th style={{ ...thBase, minWidth: 64 }}>עדכון</th>
                <th style={thBase}>חודשי</th>
                <th style={{ ...thBase, color: "rgba(27,58,47,0.8)", fontWeight: 600 }}>
                  תשואה לתקופה
                  <div style={{ fontSize: 9, fontWeight: 400, letterSpacing: 0, color: "rgba(27,58,47,0.4)", marginTop: 2 }}>
                    {periodLabel}
                  </div>
                </th>
                <th style={thBase} title="ממוצע שנתי (CAGR) על התקופה הנבחרת">{avgColumnLabel}</th>
                <th style={thBase}>שארפ</th>
              </tr>
            </thead>
            <tbody>
              {sectionOrder.map(section => {
                const sectionCats = sectionMap.get(section)!;
                const fundCount = sectionCats.reduce((s, c) => s + c.funds.length, 0);
                if (fundCount === 0) return null;
                const isCollapsed = collapsedGroups.has(section);

                return [
                  /* Group header */
                  <tr key={`sec-${section}`} onClick={() => toggleGroup(section)} style={{ cursor: "pointer", userSelect: "none" }}>
                    <td colSpan={TOTAL_COLS} style={{
                      backgroundColor: "transparent",
                      borderTop: "2px solid var(--section-header-color)",
                      borderBottom: "none",
                      borderRight: `3px solid ${accentColor || "var(--bg-section)"}`,
                      color: "var(--section-header-color)",
                      padding: "12px 16px 6px",
                      fontWeight: 700, fontSize: 13, textAlign: "right",
                    }}>
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span>
                          {section}
                          <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.55, marginRight: 7 }}>({fundCount})</span>
                        </span>
                        <span style={{
                          fontSize: 10, opacity: 0.5, display: "inline-block",
                          transition: "transform 0.2s ease",
                          transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                        }}>▼</span>
                      </span>
                    </td>
                  </tr>,

                  /* Fund rows */
                  ...(!isCollapsed ? sectionCats.flatMap(cat => {
                    if (cat.funds.length === 0) return [];
                    const showSub = sectionCats.length > 1 || cat.name !== section;
                    const rows: React.ReactNode[] = [];

                    if (showSub) {
                      rows.push(
                        <tr key={`cat-${cat.id}`}>
                          <td colSpan={TOTAL_COLS} style={{
                            backgroundColor: "#F4F3EF",
                            borderTop: "0.5px solid rgba(27,58,47,0.05)",
                            borderBottom: "0.5px solid rgba(27,58,47,0.08)",
                            color: "rgba(27,58,47,0.7)",
                            padding: "6px 32px",
                            fontWeight: 500,
                            fontSize: "10.5px",
                            textAlign: "right",
                          }}>{cat.name}</td>
                        </tr>
                      );
                    }

                    cat.funds.forEach((fund, fi) => {
                      const isOpen = openAccordions.has(fund.id);
                      // Time-range mode: compute coverage-aware result
                      const pr = !isYearMode && timeRange !== "custom"
                        ? computePeriodWithCoverage(
                            fund.monthlyReturns,
                            rangeFrom,
                            rangeTo,
                            RANGE_EXPECTED[timeRange as Exclude<TimeRange, "custom">].label,
                            RANGE_EXPECTED[timeRange as Exclude<TimeRange, "custom">].months,
                            fund.startDate ?? undefined,
                          )
                        : null;
                      const periodReturn = isYearMode
                        ? calcNoxMultiReturn(fund, selectedYears)
                        : pr
                          ? pr.value
                          : calcRangeReturn(fund.monthlyReturns, rangeFrom, rangeTo, fund.startDate ?? undefined);
                      // yearMode: ממוצע שנתי מ-y2020–y2025 (לא תלוי monthlyReturns)
                      // ytd: CAGR מתחילת חיי הקרן (לא annualized YTD — זהה ל-MAX מבחינת העמודה)
                      const annualAvg = isYearMode
                        ? calcAnnualAvgFromReturns(fund)
                        : timeRange === "ytd"
                        ? getAvgAnnualReturn(fund)
                        : undefined;

                      rows.push(
                        <FundRowV2
                          key={fund.id}
                          fund={fund}
                          even={fi % 2 === 0}
                          comparisonEnabled={comparisonEnabled}
                          isSelected={selectedFundIds?.has(fund.id)}
                          onToggle={onToggleFund}
                          selectionDisabled={selectionDisabled}
                          accentColor={accentColor}
                          periodReturn={periodReturn}
                          periodResult={pr}
                          annualAvg={annualAvg}
                          isOpen={isOpen}
                          onToggleAccordion={() => toggleAccordion(fund.id)}
                          isFirst={fi === 0}
                          aiAvailable={aiAvailable && !!clientKey}
                          onOpenAi={setAiFundId}
                          latestMonth={latestMonth}
                          timeRange={timeRange}
                          isNox={isNox}
                          consistencyHref={
                            clientKey && (clientKey === "green" || brand.features?.consistencyAnalysis === true)
                              ? (clientKey === "green"
                                  ? `/green/consistency/v2?fund=${fund.id}`
                                  : `/consistency/v2?fund=${fund.id}&client=${clientKey}`)
                              : undefined
                          }
                        />
                      );
                      if (isOpen) {
                        rows.push(<AccordionPanel key={`${fund.id}-panel`} fund={fund} isNox={isNox} />);
                      }
                    });

                    return rows;
                  }) : []),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* AI One-Pager modal */}
      {aiFundId && clientKey && (
        <FundOnePagerModal
          fundId={aiFundId}
          clientKey={clientKey}
          onClose={() => setAiFundId(null)}
        />
      )}
    </div>
  );
}
