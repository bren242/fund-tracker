"use client";

import { useState } from "react";
import { Category, Fund } from "@/lib/types";
import { pct, num, returnColorInline, formatReportDate } from "@/lib/format";
import { getLastUpdated, getAvgAnnualReturn } from "@/lib/fundDerived";


type ReturnKey = "ytd2026" | "y2025" | "y2024" | "y2023" | "y2022" | "y2021" | "y2020" | "y2019";

const YEAR_KEYS: { key: ReturnKey; label: string }[] = [
  { key: "ytd2026", label: "מצטבר 2026" },
  { key: "y2025", label: "2025" },
  { key: "y2024", label: "2024" },
  { key: "y2023", label: "2023" },
  { key: "y2022", label: "2022" },
  { key: "y2021", label: "2021" },
  { key: "y2020", label: "2020" },
  { key: "y2019", label: "2019" },
];

const COL_COUNT = 16;

/* Column widths as CSS for print table-layout:fixed */
const COL_WIDTHS = [
  "11%",   /* שם קרן */
  "9%",    /* סיווג */
  "6%",    /* מנהל */
  "5%",    /* מועד עדכון */
  "5%",    /* חודשי */
  "5.5%",  /* מצטבר 2026 */
  "5.5%",  /* 2025 */
  "5.5%",  /* 2024 */
  "5.5%",  /* 2023 */
  "5.5%",  /* 2022 */
  "5.5%",  /* 2021 */
  "5%",    /* 2020 */
  "5%",    /* 2019 */
  "5.5%",  /* ממוצע שנתי */
  "4.5%",  /* שארפ */
  "4.5%",  /* סט״ד */
  // AUM takes remaining
];

/* ── Sorting ── */
type SortCol = "name" | "classification" | "manager" | "avgAnnualReturn" | "sharpe" | "stdDev" | "aumMillions" | "monthlyReturn" | "ytd2026" | "y2025" | "y2024" | "y2023" | "y2022" | "y2021" | "y2020" | "y2019";
type SortDir = "asc" | "desc";

const NULL_NUM = -Infinity;

function getSortValue(fund: Fund, col: SortCol): string | number {
  switch (col) {
    case "name":           return (fund.name ?? "").toLowerCase();
    case "classification": return (fund.classification ?? "").toLowerCase();
    case "manager":        return (fund.manager ?? "").toLowerCase();
    case "avgAnnualReturn":return getAvgAnnualReturn(fund) ?? NULL_NUM;
    case "sharpe":         return fund.sharpe ?? NULL_NUM;
    case "stdDev":         return fund.stdDev ?? NULL_NUM;
    case "aumMillions":    return fund.aumMillions ?? NULL_NUM;
    case "monthlyReturn":  return fund.monthlyReturn ?? NULL_NUM;
    default:               return fund.returns[col as ReturnKey] ?? NULL_NUM;
  }
}

function SortableHeader({ label, col, sortCol, sortDir, onSort, onReset, style }: {
  label: string;
  col: SortCol;
  sortCol: SortCol | null;
  sortDir: SortDir;
  onSort: (col: SortCol) => void;
  onReset: () => void;
  style?: React.CSSProperties;
}) {
  const isActive = sortCol === col;
  return (
    <th
      onClick={() => onSort(col)}
      style={{
        ...style,
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
      title={`מיון לפי ${label}`}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
        {label}
        <span style={{
          fontSize: isActive ? 18 : 16,
          color: "var(--text-muted)",
          opacity: isActive ? 1 : 0.4,
          transition: "opacity 0.15s, font-size 0.1s",
          lineHeight: 1,
          fontWeight: isActive ? 700 : 400,
        }}>
          {isActive ? (sortDir === "desc" ? "▼" : "▲") : "▾"}
        </span>
        {isActive && (
          <span
            onClick={(e) => { e.stopPropagation(); onReset(); }}
            title="בטל מיון"
            style={{
              fontSize: 9,
              lineHeight: 1,
              opacity: 0.7,
              cursor: "pointer",
              padding: "0 2px",
              borderRadius: 3,
              backgroundColor: "rgba(255,255,255,0.2)",
            }}
          >
            ✕
          </span>
        )}
      </span>
    </th>
  );
}

/* ── Cells ── */
function ReturnCell({ value }: { value: number | null }) {
  return (
    <td style={{
      padding: "8px 10px",
      textAlign: "center",
      borderBottom: "1px solid var(--border-table)",
      color: returnColorInline(value),
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap",
    }}>
      {pct(value)}
    </td>
  );
}

function FundRow({ fund, even, comparisonEnabled, isSelected, onToggle, activeYears, selectionDisabled, accentColor }: {
  fund: Fund; even: boolean;
  comparisonEnabled?: boolean; isSelected?: boolean; onToggle?: (id: string) => void;
  activeYears: { key: ReturnKey; label: string }[];
  selectionDisabled?: boolean; accentColor?: string;
}) {
  const bg = even ? "var(--bg-surface)" : "var(--bg-row-alt)";
  const selectedBorder = comparisonEnabled && isSelected ? `2px solid ${accentColor || "var(--accent)"}` : "none";

  return (
    <tr style={{ backgroundColor: bg, borderInlineStart: selectedBorder }}>
      <td style={{ padding: "5px 10px", borderBottom: "1px solid var(--border-table)", fontWeight: 600, textAlign: "right", fontSize: "12px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
          {comparisonEnabled && (
            <input
              type="checkbox"
              checked={isSelected || false}
              disabled={selectionDisabled && !isSelected}
              onChange={() => onToggle?.(fund.id)}
              className="no-print"
              style={{ cursor: selectionDisabled && !isSelected ? "not-allowed" : "pointer", width: 14, height: 14, flexShrink: 0, opacity: selectionDisabled && !isSelected ? 0.35 : 1 }}
              title={selectionDisabled && !isSelected ? "מקסימום 4 קרנות להשוואה" : "בחר להשוואה"}
            />
          )}
          <span style={{ flex: 1 }}>{fund.name}</span>
          {fund.currency && (
            <span style={{
              fontSize: 8,
              fontWeight: 700,
              color: fund.currency === "USD" ? "#1d4ed8" : "#059669",
              backgroundColor: fund.currency === "USD" ? "#dbeafe" : "#d1fae5",
              padding: "1px 4px",
              borderRadius: 3,
              letterSpacing: 0.3,
              flexShrink: 0,
            }}>
              {fund.currency}
            </span>
          )}
        </span>
      </td>
      <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-table)", color: "var(--text-secondary)", textAlign: "right", fontSize: "11px" }}>
        {fund.classification}
      </td>
      <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-table)", color: "var(--text-muted)", textAlign: "center", fontSize: "11px" }}>
        {fund.manager}
      </td>
      <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-table)", color: "var(--text-muted)", textAlign: "center", fontSize: "10px", fontVariantNumeric: "tabular-nums" }}>
        {formatReportDate(getLastUpdated(fund))}
      </td>
      <td style={{
        padding: "8px 10px",
        borderBottom: "1px solid var(--border-table)",
        textAlign: "center",
        fontWeight: 600,
        color: returnColorInline(fund.monthlyReturn),
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}>
        {pct(fund.monthlyReturn)}
      </td>
      {activeYears.map((y) => (
        <ReturnCell key={y.key} value={fund.returns[y.key]} />
      ))}
      <ReturnCell value={getAvgAnnualReturn(fund)} />
      <td style={{ padding: "8px 10px", textAlign: "center", borderBottom: "1px solid var(--border-table)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {num(fund.sharpe)}
      </td>
      <ReturnCell value={fund.stdDev} />
      <td style={{ padding: "8px 10px", textAlign: "center", borderBottom: "1px solid var(--border-table)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {fund.aumMillions != null ? fund.aumMillions.toLocaleString() : "—"}
      </td>
    </tr>
  );
}

/* ── Main Component ── */
export default function FundTable({ categories, comparisonEnabled, selectedFundIds, onToggleFund, visibleYears, accentColor }: {
  categories: Category[];
  comparisonEnabled?: boolean;
  selectedFundIds?: Set<string>;
  onToggleFund?: (id: string) => void;
  visibleYears?: string[];
  accentColor?: string;
}) {
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  };

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      // Text columns default ascending, numeric columns default descending
      setSortDir(col === "name" || col === "classification" || col === "manager" ? "asc" : "desc");
    }
  }

  // Filter year columns based on visibleYears prop
  const activeYears = visibleYears
    ? YEAR_KEYS.filter((y) => {
        const yearStr = y.key === "ytd2026" ? "2026" : y.key.replace("y", "");
        return visibleYears.includes(yearStr);
      })
    : YEAR_KEYS;

  const colCount = COL_COUNT - YEAR_KEYS.length + activeYears.length;
  const selectionDisabled = (selectedFundIds?.size ?? 0) >= 4;

  const totalFunds = categories.reduce((sum, cat) => sum + cat.funds.length, 0);
  if (totalFunds === 0) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
        לא נמצאו קרנות התואמות את הסינון.
      </div>
    );
  }

  /* Build rows */
  const rows: React.ReactNode[] = [];

  if (sortCol !== null) {
    /* ── Sorted mode: flat list, no category headers ── */
    const flat: { fund: Fund; catId: string }[] = [];
    for (const cat of categories) {
      for (const fund of cat.funds) flat.push({ fund, catId: cat.id });
    }
    flat.sort((a, b) => {
      const va = getSortValue(a.fund, sortCol);
      const vb = getSortValue(b.fund, sortCol);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    flat.forEach(({ fund }, i) => {
      rows.push(
        <FundRow key={fund.id} fund={fund} even={i % 2 === 0}
          comparisonEnabled={comparisonEnabled}
          isSelected={selectedFundIds?.has(fund.id)}
          onToggle={onToggleFund}
          activeYears={activeYears}
          selectionDisabled={selectionDisabled}
          accentColor={accentColor}
        />
      );
    });
  } else {
    /* ── Default mode: grouped by parentSection ── */
    const sectionOrder: string[] = [];
    const sectionMap = new Map<string, Category[]>();
    for (const cat of categories) {
      if (!sectionMap.has(cat.parentSection)) {
        sectionMap.set(cat.parentSection, []);
        sectionOrder.push(cat.parentSection);
      }
      sectionMap.get(cat.parentSection)!.push(cat);
    }

    for (const section of sectionOrder) {
      const sectionCats = sectionMap.get(section)!;
      const isCollapsed = collapsedGroups.has(section);
      if (!sectionCats.some(c => c.funds.length > 0)) continue;

      rows.push(
        <tr key={`section-${section}`} onClick={() => toggleGroup(section)} style={{ cursor: "pointer", userSelect: "none" }}>
          <td colSpan={colCount + 1} style={{
            backgroundColor: "transparent",
            borderTop: "2px solid var(--section-header-color)",
            borderBottom: "none",
            color: "var(--section-header-color)",
            padding: "14px 16px 6px 16px",
            fontWeight: 700,
            fontSize: "13px",
            letterSpacing: "0.3px",
            textAlign: "right",
          }}>
            <span style={{
              float: "left",
              fontSize: "10px",
              opacity: 0.5,
              display: "inline-block",
              transition: "transform 0.2s ease",
              transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
            }}>▼</span>
            {section}
          </td>
        </tr>
      );
      if (isCollapsed) continue;

      for (const cat of sectionCats) {
        if (cat.funds.length === 0) continue;
        const showSubHeader = sectionCats.length > 1 || cat.name !== section;
        if (showSubHeader) {
          rows.push(
            <tr key={`cat-${cat.id}`}>
              <td colSpan={colCount + 1} style={{
                backgroundColor: "transparent",
                borderTop: "1px solid rgba(6,78,59,0.25)",
                borderBottom: "none",
                color: "var(--text-secondary)",
                padding: "8px 16px 4px 16px",
                fontWeight: 600,
                fontSize: "11px",
                textAlign: "right",
                letterSpacing: "0.2px",
                fontStyle: "italic",
              }}>
                {cat.name}
              </td>
            </tr>
          );
        }
        for (let i = 0; i < cat.funds.length; i++) {
          rows.push(
            <FundRow key={cat.funds[i].id} fund={cat.funds[i]} even={i % 2 === 0}
              comparisonEnabled={comparisonEnabled}
              isSelected={selectedFundIds?.has(cat.funds[i].id)}
              onToggle={onToggleFund}
              activeYears={activeYears}
              selectionDisabled={selectionDisabled}
              accentColor={accentColor}
            />
          );
        }
      }
    }
  }

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
    paddingTop: "12px",
    paddingBottom: "12px",
    paddingLeft: "10px",
    paddingRight: "10px",
  };

  function handleReset() { setSortCol(null); }
  const sortProps = { sortCol, sortDir, onSort: handleSort, onReset: handleReset };

  return (
    <table className="fund-data-table" style={{ borderCollapse: "separate", borderSpacing: 0, fontSize: "10.5px", lineHeight: 1.45 }}>
      <colgroup>
        {COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}
        <col />
      </colgroup>
      <thead>
        <tr style={{ backgroundColor: "transparent", borderBottom: "none" }}>
          <SortableHeader label="שם קרן"     col="name"           style={{ ...thBase, textAlign: "right", paddingRight: 10 }} {...sortProps} />
          <SortableHeader label="סיווג"       col="classification" style={{ ...thBase, textAlign: "right" }}                   {...sortProps} />
          <SortableHeader label="מנהל"        col="manager"        style={thBase}                                               {...sortProps} />
          <th style={thBase}>מועד עדכון</th>
          <SortableHeader label="חודשי"       col="monthlyReturn"  style={thBase}                                               {...sortProps} />
          {activeYears.map((y) => (
            <SortableHeader key={y.key} label={y.label} col={y.key as SortCol} style={thBase} {...sortProps} />
          ))}
          <SortableHeader label="תשואה ממוצעת שנתית"  col="avgAnnualReturn" style={thBase}                                   {...sortProps} />
          <SortableHeader label="שארפ"        col="sharpe"         style={thBase}                                               {...sortProps} />
          <SortableHeader label="ס״ת"         col="stdDev"         style={thBase}                                               {...sortProps} />
          <SortableHeader label="AUM (מ׳ ₪)"  col="aumMillions"    style={thBase}                                               {...sortProps} />
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  );
}
