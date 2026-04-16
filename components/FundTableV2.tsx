"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Category, Fund } from "@/lib/types";
import { pct, num, returnColorInline, formatReportDate } from "@/lib/format";

// ── Types ──────────────────────────────────────────────────────────────────
type TimeRange = "ytd" | "12m" | "3y" | "5y" | "max" | "custom";
type YearKey   = "2020" | "2021" | "2022" | "2023" | "2024" | "2025" | "ytd2026" | "avg";

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

/** "YYYY-MM" → "ינואר 2026" */
function fmtLastUpdated(ym: string): string {
  const [yyyy, mm] = ym.split("-");
  return `${MONTH_HE_FULL[mm] ?? mm} ${yyyy}`;
}

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

const TIME_RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: "ytd",    label: "מתחילת שנה" },
  { key: "12m",   label: "12 חודשים" },
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
  toYearMonth: string
): number | null {
  if (!monthlyReturns) return null;
  const keys = Object.keys(monthlyReturns)
    .filter(k => (fromYearMonth === null || k >= fromYearMonth) && k <= toYearMonth)
    .sort();
  if (keys.length === 0) return null;
  return keys.reduce((acc, k) => acc * (1 + monthlyReturns[k]), 1) - 1;
}

function calcCumulative(fund: Fund): number | null {
  if (fund.monthlyReturns) {
    const keys = Object.keys(fund.monthlyReturns)
      .filter(k => typeof fund.monthlyReturns![k] === "number")
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
  if (year === "avg") return fund.avgAnnualReturn;
  const key = year === "ytd2026" ? "ytd2026" : (`y${year}` as keyof Fund["returns"]);
  return fund.returns[key] ?? null;
}

/** ממוצע שנתי מ-y2020 עד y2025 — שנים עם ערך בלבד (YTD לא נכלל) */
function calcAnnualAvgFromReturns(fund: Fund): number | null {
  const keys: (keyof Fund["returns"])[] = ["y2020", "y2021", "y2022", "y2023", "y2024", "y2025"];
  const vals = keys.map(k => fund.returns[k]).filter((v): v is number => v != null);
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
      background: "#e8e8ed",
      borderRadius: 10,
      padding: 3,
    }}>
      {TIME_RANGE_OPTIONS.map((o) => {
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
    <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 2, background: "#e8e8ed", borderRadius: 10, padding: 3, alignSelf: "flex-start" }}>
      {["הכל", ...sections].map(s => {
        const isActive = active === s;
        return (
          <button
            key={s}
            onClick={() => onSelect(s)}
            onMouseEnter={(e) => {
              if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(0,0,0,0.06)";
              onHover?.(s !== "הכל" ? s : null);
            }}
            onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
            style={{
              padding: "5px 14px", borderRadius: 8, fontSize: 13,
              fontWeight: isActive ? 600 : 400, cursor: "pointer",
              border: "none",
              backgroundColor: isActive ? "#1B3A2F" : "transparent",
              color: isActive ? "#ffffff" : "#444",
              transition: "background 0.12s",
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
function AccordionPanel({ fund }: { fund: Fund }) {
  const cumulative = calcCumulative(fund);

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
            <span>{lbl("סטיית תקן")}{fund.stdDev != null ? `${(fund.stdDev * 100).toFixed(2)}%` : "—"}</span>
            {sep}
            <span>{lbl("שארפ")}<span style={{ color: "#B8975A" }}>{fund.sharpe != null ? num(fund.sharpe) : "—"}</span></span>
          </div>

          {/* Monthly pills */}
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>12 חודשים אחרונים</div>
            <MonthlyPills monthlyReturns={fund.monthlyReturns} />
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Fund Row ───────────────────────────────────────────────────────────────
function FundRowV2({
  fund, even, comparisonEnabled, isSelected, onToggle, selectionDisabled,
  accentColor, periodReturn, annualAvg, isOpen, onToggleAccordion, isFirst,
}: {
  fund: Fund;
  even: boolean;
  comparisonEnabled?: boolean;
  isSelected?: boolean;
  onToggle?: (id: string) => void;
  selectionDisabled?: boolean;
  accentColor?: string;
  periodReturn: number | null;
  annualAvg?: number | null;
  isOpen: boolean;
  onToggleAccordion: () => void;
  isFirst?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const bg = even ? "#ffffff" : "#fafafa";
  const classBadge = getClassBadge(fund.classification || "");
  const shColor = sharpeColor(fund.sharpe);

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
                width: 13, height: 13, flexShrink: 0,
                opacity: hovered ? (selectionDisabled && !isSelected ? 0.35 : 1) : 0,
                transition: "opacity 0.12s",
              }}
              title={selectionDisabled && !isSelected ? "מקסימום 4 קרנות להשוואה" : "בחר להשוואה"}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: "#1D1D1F", fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fund.name}</div>
            {fund.classification && (
              <div style={{ color: "#86868B", fontSize: 12, fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fund.classification}</div>
            )}
            {fund.lastUpdated && (
              <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
                עודכן: {fmtLastUpdated(fund.lastUpdated)}
              </div>
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
          <span style={{
            fontSize: 10, color: "var(--text-muted)", flexShrink: 0,
            display: "inline-block", transition: "transform 0.2s ease",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}>▾</span>
        </div>
      </td>

      {/* Last report date */}
      <td style={{ ...cell, fontSize: 13, color: "#AEAEB2" }}>
        {formatReportDate(fund.lastReportDate)}
      </td>

      {/* Monthly return */}
      <td style={{ ...cell, fontSize: 15, fontWeight: 600, color: returnColorInline(fund.monthlyReturn) }}>{pct(fund.monthlyReturn)}</td>

      {/* Period return (computed from monthlyReturns) */}
      <td style={{ ...cell, fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px", color: returnColorInline(periodReturn) }}>
        {pct(periodReturn)}
      </td>

      {/* Avg annual — in yearMode computed from y2020-y2025, otherwise stored field */}
      {(() => { const v = annualAvg !== undefined ? annualAvg : fund.avgAnnualReturn; return (
        <td style={{ ...cell, fontSize: 15, fontWeight: 500, color: returnColorInline(v) }}>{pct(v)}</td>
      ); })()}

      {/* Sharpe with dot */}
      <td style={{ ...cell, fontSize: 14, fontWeight: 400, color: "#555" }}>
        {fund.sharpe != null ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              backgroundColor: shColor, display: "inline-block",
            }} />
            <span style={{ color: shColor }}>{num(fund.sharpe)}</span>
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
}: {
  categories: Category[];
  comparisonEnabled?: boolean;
  selectedFundIds?: Set<string>;
  onToggleFund?: (id: string) => void;
  accentColor?: string;
}) {
  const [timeRange, setTimeRange]             = useState<TimeRange>("3y");
  const [customFrom, setCustomFrom]           = useState("2022-01");
  const [customTo, setCustomTo]               = useState(_toYM);
  const [activeFilter, setActiveFilter]       = useState("הכל");
  const [activeClassification, setActiveClassification] = useState<string | null>(null);
  const [hoveredSection, setHoveredSection]   = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [openAccordions, setOpenAccordions]   = useState<Set<string>>(new Set());

  // Year-mode: activated when no fund has monthlyReturns data (e.g. NOX)
  const [isYearMode, setIsYearMode]     = useState(false);
  const [selectedYear, setSelectedYear] = useState<YearKey>("2025");
  const modeDetected = useRef(false);
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
    let cats = activeFilter === "הכל"
      ? categories
      : categories.filter(c => c.parentSection === activeFilter || c.name === activeFilter);
    if (activeClassification) {
      cats = cats.map(c => ({ ...c, funds: c.funds.filter(f => f.classification === activeClassification) }))
                 .filter(c => c.funds.length > 0);
    }
    return cats;
  }, [categories, activeFilter, activeClassification]);

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
      if (selectedYear === "ytd2026") return "YTD 2026";
      if (selectedYear === "avg")     return "ממוצע שנתי";
      return selectedYear;
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
  }, [isYearMode, selectedYear, timeRange, customFrom, customTo]);

  const thBase: React.CSSProperties = {
    backgroundColor: "transparent",
    color: "#555555",
    fontWeight: 500,
    textAlign: "center",
    whiteSpace: "nowrap",
    borderBottom: "2px solid var(--border-table)",
    fontSize: "12px",
    letterSpacing: "0.5px",
    textTransform: "uppercase",
    padding: "10px 10px",
  };

  const selectStyle: React.CSSProperties = {
    padding: "3px 8px", borderRadius: 5, fontSize: 11,
    border: "1px solid var(--border)", cursor: "pointer",
    backgroundColor: "var(--bg-input)", color: "var(--text-primary)",
  };

  return (
    <div style={{ direction: "rtl", background: "#f5f5f7", width: "100%" }}>

      {/* ── Controls + Sub bar wrapper ── */}
      <div onMouseLeave={() => setHoveredSection(null)}>
        <div style={{
          padding: "12px 16px",
          borderBottom: subBarClassifications.length > 0 ? "none" : "1px solid var(--border-table)",
          backgroundColor: "var(--bg-surface)",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          {/* Time range / Year selector */}
          {isYearMode ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>שנה:</span>
              <YearSelector value={selectedYear} onChange={(v) => { setSelectedYear(v); resetAccordions(); }} />
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>טווח זמן:</span>
                <SegmentedControl value={timeRange} onChange={(v) => { setTimeRange(v); resetAccordions(); }} />
              </div>
              {timeRange === "custom" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>מ-</span>
                  <select value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={selectStyle}>
                    {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>עד</span>
                  <select value={customTo} onChange={e => setCustomTo(e.target.value)} style={selectStyle}>
                    {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}
            </>
          )}

          {/* Category pills */}
          <CategoryPills
            sections={sectionLabels}
            active={activeFilter}
            onSelect={(v) => { setActiveFilter(v); setActiveClassification(null); resetAccordions(); }}
            onHover={setHoveredSection}
          />
        </div>

        {/* Sub bar — classifications */}
        {subBarClassifications.length > 0 && (
          <div style={{
            background: "#f5f5f7", padding: "8px 16px",
            borderBottom: "2px solid #1B3A2F",
            display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
            alignSelf: "flex-start",
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
          לא נמצאו קרנות.
        </div>
      ) : (
        <div style={{ overflowX: "auto", background: "#ffffff" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "11px", lineHeight: 1.45 }}>
            <thead>
              <tr>
                <th style={{ ...thBase, textAlign: "right", paddingRight: 12, maxWidth: 200 }}>שם קרן</th>
                <th style={{ ...thBase, minWidth: 64 }}>עדכון</th>
                <th style={thBase}>חודשי</th>
                <th style={{ ...thBase, color: "var(--text-primary)", fontWeight: 700 }}>
                  תשואה לתקופה
                  <div style={{ fontSize: 9, fontWeight: 400, letterSpacing: 0, color: "var(--text-muted)", textTransform: "none", marginTop: 2 }}>
                    {periodLabel}
                  </div>
                </th>
                <th style={thBase}>ממוצע שנתי</th>
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
                            backgroundColor: "transparent",
                            borderTop: "1px solid rgba(6,78,59,0.15)",
                            borderBottom: "none",
                            color: "var(--text-secondary)",
                            padding: "6px 16px 3px",
                            fontWeight: 600, fontSize: 11,
                            textAlign: "right", fontStyle: "italic",
                          }}>{cat.name}</td>
                        </tr>
                      );
                    }

                    cat.funds.forEach((fund, fi) => {
                      const isOpen = openAccordions.has(fund.id);
                      const periodReturn = isYearMode
                        ? getYearReturn(fund, selectedYear)
                        : calcRangeReturn(fund.monthlyReturns, rangeFrom, rangeTo);
                      // yearMode: ממוצע שנתי מ-y2020–y2025 (לא תלוי monthlyReturns)
                      const annualAvg = isYearMode
                        ? calcAnnualAvgFromReturns(fund)
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
                          annualAvg={annualAvg}
                          isOpen={isOpen}
                          onToggleAccordion={() => toggleAccordion(fund.id)}
                          isFirst={fi === 0}
                        />
                      );
                      if (isOpen) {
                        rows.push(<AccordionPanel key={`${fund.id}-panel`} fund={fund} />);
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
    </div>
  );
}
