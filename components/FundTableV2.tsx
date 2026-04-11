"use client";

import { useState, useMemo } from "react";
import { Category, Fund } from "@/lib/types";
import { pct, num, returnColorInline, formatReportDate } from "@/lib/format";

// ── Types ──────────────────────────────────────────────────────────────────
type TimeRange = "ytd" | "12m" | "3y" | "5y" | "max" | "custom";
type ReturnKey = "ytd2026" | "y2025" | "y2024" | "y2023" | "y2022" | "y2021" | "y2020" | "y2019";

// ── Constants ──────────────────────────────────────────────────────────────
const ALL_YEAR_KEYS: ReturnKey[] = [
  "y2019", "y2020", "y2021", "y2022", "y2023", "y2024", "y2025", "ytd2026",
];

const YEAR_LABELS: Record<ReturnKey, string> = {
  ytd2026: "מצטבר 2026",
  y2025: "2025", y2024: "2024", y2023: "2023",
  y2022: "2022", y2021: "2021", y2020: "2020", y2019: "2019",
};

const YEAR_NUM: Record<ReturnKey, number> = {
  ytd2026: 2026, y2025: 2025, y2024: 2024, y2023: 2023,
  y2022: 2022, y2021: 2021, y2020: 2020, y2019: 2019,
};

const MONTH_HE: Record<string, string> = {
  "01": "ינו", "02": "פבר", "03": "מרץ", "04": "אפר",
  "05": "מאי", "06": "יוני", "07": "יול", "08": "אוג",
  "09": "ספט", "10": "אוק", "11": "נוב", "12": "דצמ",
};

const CUSTOM_YEARS = ["2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"];

const TIME_RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: "ytd",    label: "מתחילת שנה" },
  { key: "12m",   label: "12 חודשים" },
  { key: "3y",    label: "3Y" },
  { key: "5y",    label: "5Y" },
  { key: "max",   label: "MAX" },
  { key: "custom",label: "Custom" },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function getActiveKeys(range: TimeRange, from: string, to: string): ReturnKey[] {
  switch (range) {
    case "ytd":    return ["ytd2026"];
    case "12m":    return ["ytd2026"];
    case "3y":     return ["y2023", "y2024", "y2025", "ytd2026"];
    case "5y":     return ["y2021", "y2022", "y2023", "y2024", "y2025", "ytd2026"];
    case "max":    return [...ALL_YEAR_KEYS];
    case "custom": {
      const f = parseInt(from), t = parseInt(to);
      return ALL_YEAR_KEYS.filter(k => { const y = YEAR_NUM[k]; return y >= f && y <= t; });
    }
  }
}

function calc12m(monthlyReturns?: Record<string, number>): number | null {
  if (!monthlyReturns) return null;
  const entries = Object.entries(monthlyReturns)
    .filter(([, v]) => typeof v === "number")
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 12);
  if (entries.length < 12) return null;
  return entries.reduce((acc, [, v]) => acc * (1 + v), 1) - 1;
}

function calcCumulative(fund: Fund): number | null {
  const vals = ALL_YEAR_KEYS.map(k => fund.returns[k]).filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  return vals.reduce((acc, v) => acc * (1 + v), 1) - 1;
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
      display: "inline-flex", borderRadius: 8,
      border: "1px solid var(--border-table)", overflow: "hidden",
    }}>
      {TIME_RANGE_OPTIONS.map((o, i) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            style={{
              padding: "6px 13px", fontSize: 12,
              fontWeight: active ? 700 : 400,
              border: "none",
              borderRight: i > 0 ? "1px solid var(--border-table)" : "none",
              cursor: "pointer",
              backgroundColor: active ? "var(--bg-section)" : "var(--bg-surface)",
              color: active ? "#fff" : "var(--text-secondary)",
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
function CategoryPills({ sections, active, onSelect }: {
  sections: string[]; active: string; onSelect: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {["הכל", ...sections].map(s => {
        const isActive = active === s;
        return (
          <button
            key={s}
            onClick={() => onSelect(s)}
            style={{
              padding: "4px 12px", borderRadius: 20, fontSize: 12,
              fontWeight: isActive ? 600 : 400, cursor: "pointer",
              border: `1px solid ${isActive ? "var(--bg-section)" : "var(--border-table)"}`,
              backgroundColor: isActive ? "var(--bg-section)" : "var(--bg-surface)",
              color: isActive ? "#fff" : "var(--text-secondary)",
              transition: "all 0.12s",
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
        const m = key.match(/^(\d{4})-(\d{2})$/);
        const monthLabel = m ? (MONTH_HE[m[2]] || m[2]) : key;
        const yearLabel  = m ? `'${m[1].slice(2)}` : "";
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
function AccordionPanel({ fund, totalCols }: { fund: Fund; totalCols: number }) {
  const cumulative = calcCumulative(fund);

  const labelStyle: React.CSSProperties = {
    fontSize: 10, color: "var(--text-muted)", marginBottom: 3, whiteSpace: "nowrap",
  };
  const valStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums",
  };

  return (
    <tr>
      <td colSpan={totalCols} style={{ padding: 0 }}>
        <div style={{
          backgroundColor: "var(--bg-surface-alt)",
          borderTop: "1px solid var(--border-table)",
          borderBottom: "1px solid var(--border-table)",
          padding: "16px 24px",
          direction: "rtl",
        }}>
          {/* Row 1: meta info */}
          <div style={{ display: "flex", gap: 28, marginBottom: 14, flexWrap: "wrap" }}>
            <div>
              <div style={labelStyle}>מנהל</div>
              <div style={valStyle}>{fund.manager || "—"}</div>
            </div>
            <div>
              <div style={labelStyle}>סיווג</div>
              <div style={valStyle}>{fund.classification || "—"}</div>
            </div>
            <div>
              <div style={labelStyle}>תאריך הקמה</div>
              <div style={valStyle}>{fund.startDate ? fund.startDate.slice(0, 7) : "—"}</div>
            </div>
            <div>
              <div style={labelStyle}>AUM (מ׳ ₪)</div>
              <div style={valStyle}>{fund.aumMillions != null ? fund.aumMillions.toLocaleString() : "—"}</div>
            </div>
          </div>

          {/* Row 2: stats */}
          <div style={{ display: "flex", gap: 28, marginBottom: 14, flexWrap: "wrap" }}>
            <div>
              <div style={labelStyle}>תשואה מצטברת</div>
              <div style={{ ...valStyle, color: returnColorInline(cumulative) }}>{pct(cumulative)}</div>
            </div>
            <div>
              <div style={labelStyle}>סטיית תקן</div>
              <div style={valStyle}>{fund.stdDev != null ? `${(fund.stdDev * 100).toFixed(2)}%` : "—"}</div>
            </div>
            <div>
              <div style={labelStyle}>שארפ</div>
              <div style={{ ...valStyle, color: sharpeColor(fund.sharpe) }}>
                {fund.sharpe != null ? num(fund.sharpe) : "—"}
              </div>
            </div>
          </div>

          {/* Monthly pills */}
          <div>
            <div style={{ ...labelStyle, marginBottom: 8 }}>12 חודשים אחרונים</div>
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
  accentColor, activeKeys, is12m, isOpen, onToggleAccordion,
}: {
  fund: Fund;
  even: boolean;
  comparisonEnabled?: boolean;
  isSelected?: boolean;
  onToggle?: (id: string) => void;
  selectionDisabled?: boolean;
  accentColor?: string;
  activeKeys: ReturnKey[];
  is12m: boolean;
  isOpen: boolean;
  onToggleAccordion: () => void;
}) {
  const bg = even ? "var(--bg-surface)" : "var(--bg-row-alt)";
  const classBadge = getClassBadge(fund.classification || "");
  const shColor = sharpeColor(fund.sharpe);
  const m12val = is12m ? calc12m(fund.monthlyReturns) : null;

  const cell: React.CSSProperties = {
    padding: "8px 10px",
    borderBottom: isOpen ? "none" : "1px solid var(--border-table)",
    fontVariantNumeric: "tabular-nums",
    textAlign: "center",
    whiteSpace: "nowrap",
    fontSize: 11,
  };

  return (
    <tr
      onClick={onToggleAccordion}
      style={{
        backgroundColor: bg,
        cursor: "pointer",
        borderInlineStart: comparisonEnabled && isSelected
          ? `2px solid ${accentColor || "var(--accent)"}` : "none",
      }}
    >
      {/* Name */}
      <td style={{ ...cell, textAlign: "right", fontSize: 12, fontWeight: 600, paddingRight: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
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
                opacity: selectionDisabled && !isSelected ? 0.35 : 1,
              }}
              title={selectionDisabled && !isSelected ? "מקסימום 4 קרנות להשוואה" : "בחר להשוואה"}
            />
          )}
          <span style={{ flex: 1 }}>{fund.name}</span>
          {fund.currency && (
            <span style={{
              fontSize: 9, fontWeight: 700, flexShrink: 0, padding: "1px 5px", borderRadius: 3,
              color: fund.currency === "USD" ? "#1d4ed8" : "#059669",
              backgroundColor: fund.currency === "USD" ? "#dbeafe" : "#d1fae5",
            }}>{fund.currency}</span>
          )}
          {classBadge && (
            <span style={{
              fontSize: 9, fontWeight: 700, flexShrink: 0, padding: "1px 5px", borderRadius: 3,
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
      <td style={{ ...cell, fontSize: 10, color: "var(--text-muted)" }}>
        {formatReportDate(fund.lastReportDate)}
      </td>

      {/* Monthly */}
      <td style={{ ...cell, color: returnColorInline(fund.monthlyReturn) }}>{pct(fund.monthlyReturn)}</td>

      {/* Dynamic columns */}
      {is12m
        ? <td style={{ ...cell, color: returnColorInline(m12val) }}>{pct(m12val)}</td>
        : activeKeys.map(k => (
            <td key={k} style={{ ...cell, color: returnColorInline(fund.returns[k]) }}>
              {pct(fund.returns[k])}
            </td>
          ))
      }

      {/* Avg annual */}
      <td style={{ ...cell, color: returnColorInline(fund.avgAnnualReturn) }}>{pct(fund.avgAnnualReturn)}</td>

      {/* Sharpe with dot */}
      <td style={cell}>
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

// ── Main ───────────────────────────────────────────────────────────────────
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
  const [timeRange, setTimeRange]         = useState<TimeRange>("3y");
  const [customFrom, setCustomFrom]       = useState("2023");
  const [customTo, setCustomTo]           = useState("2025");
  const [activeFilter, setActiveFilter]   = useState("הכל");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [openAccordions, setOpenAccordions]   = useState<Set<string>>(new Set());

  const selectionDisabled = (selectedFundIds?.size ?? 0) >= 4;

  // Unique section labels (preserve order)
  const sectionLabels = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of categories) {
      if (!seen.has(c.parentSection)) { seen.add(c.parentSection); out.push(c.parentSection); }
    }
    return out;
  }, [categories]);

  // Filtered categories
  const filteredCats = useMemo(() => {
    if (activeFilter === "הכל") return categories;
    return categories.filter(c => c.parentSection === activeFilter || c.name === activeFilter);
  }, [categories, activeFilter]);

  // Columns
  const activeKeys = useMemo(() => getActiveKeys(timeRange, customFrom, customTo), [timeRange, customFrom, customTo]);
  const is12m = timeRange === "12m";
  const dynamicCols = is12m ? 1 : activeKeys.length;
  const totalCols = 3 + dynamicCols + 2; // name + date + monthly + dynamic + avg + sharpe

  // Grouped by section
  const { sectionMap, sectionOrder } = useMemo(() => {
    const map = new Map<string, Category[]>();
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

  const thBase: React.CSSProperties = {
    backgroundColor: "transparent",
    color: "var(--text-secondary)",
    fontWeight: 600,
    textAlign: "center",
    whiteSpace: "nowrap",
    borderBottom: "2px solid var(--border-table)",
    fontSize: "10px",
    letterSpacing: "0.8px",
    textTransform: "uppercase",
    padding: "10px 10px",
  };

  const selectStyle: React.CSSProperties = {
    padding: "3px 8px", borderRadius: 5, fontSize: 11,
    border: "1px solid var(--border)", cursor: "pointer",
    backgroundColor: "var(--bg-input)", color: "var(--text-primary)",
  };

  return (
    <div style={{ direction: "rtl" }}>

      {/* ── Controls ── */}
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--border-table)",
        backgroundColor: "var(--bg-surface)",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        {/* Time range */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>טווח זמן:</span>
          <SegmentedControl value={timeRange} onChange={(v) => { setTimeRange(v); resetAccordions(); }} />
        </div>

        {/* Custom pickers */}
        {timeRange === "custom" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>מ-</span>
            <select value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={selectStyle}>
              {CUSTOM_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>עד</span>
            <select value={customTo} onChange={e => setCustomTo(e.target.value)} style={selectStyle}>
              {CUSTOM_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}

        {/* Category pills */}
        <CategoryPills
          sections={sectionLabels}
          active={activeFilter}
          onSelect={(v) => { setActiveFilter(v); resetAccordions(); }}
        />
      </div>

      {/* ── Table ── */}
      {totalFunds === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
          לא נמצאו קרנות.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "11px", lineHeight: 1.45 }}>
            <thead>
              <tr>
                <th style={{ ...thBase, textAlign: "right", paddingRight: 12, maxWidth: 200 }}>שם קרן</th>
                <th style={{ ...thBase, minWidth: 64 }}>עדכון</th>
                <th style={thBase}>חודשי</th>
                {is12m
                  ? <th style={thBase}>12 חודשים</th>
                  : activeKeys.map(k => <th key={k} style={thBase}>{YEAR_LABELS[k]}</th>)
                }
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
                    <td colSpan={totalCols} style={{
                      backgroundColor: "transparent",
                      borderTop: "2px solid var(--section-header-color)",
                      borderBottom: "none",
                      borderRight: `3px solid ${accentColor || "var(--bg-section)"}`,
                      color: "var(--section-header-color)",
                      padding: "12px 16px 6px",
                      fontWeight: 700,
                      fontSize: 13,
                      textAlign: "right",
                    }}>
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span>
                          {section}
                          <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.55, marginRight: 7 }}>
                            ({fundCount})
                          </span>
                        </span>
                        <span style={{
                          fontSize: 10, opacity: 0.5,
                          display: "inline-block",
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
                          <td colSpan={totalCols} style={{
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
                          activeKeys={activeKeys}
                          is12m={is12m}
                          isOpen={isOpen}
                          onToggleAccordion={() => toggleAccordion(fund.id)}
                        />
                      );
                      if (isOpen) {
                        rows.push(
                          <AccordionPanel key={`${fund.id}-panel`} fund={fund} totalCols={totalCols} />
                        );
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
