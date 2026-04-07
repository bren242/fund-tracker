"use client";

import { useState } from "react";
import { Category, Fund } from "@/lib/types";
import { pct, num, returnColorInline, formatReportDate } from "@/lib/format";
import { SECTION_COLORS } from "@/lib/constants";

const SUPER_HEADER_BEFORE = "bond-hedged";

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
  "7%",    /* סיווג */
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
type SortCol = "name" | "classification" | "manager" | "avgAnnualReturn" | "sharpe" | "stdDev" | "aumMillions" | "monthlyReturn" | "ytd2026";
type SortDir = "asc" | "desc";

const NULL_NUM = -Infinity;

function getSortValue(fund: Fund, col: SortCol): string | number {
  switch (col) {
    case "name":           return (fund.name ?? "").toLowerCase();
    case "classification": return (fund.classification ?? "").toLowerCase();
    case "manager":        return (fund.manager ?? "").toLowerCase();
    case "avgAnnualReturn":return fund.avgAnnualReturn ?? NULL_NUM;
    case "sharpe":         return fund.sharpe ?? NULL_NUM;
    case "stdDev":         return fund.stdDev ?? NULL_NUM;
    case "aumMillions":    return fund.aumMillions ?? NULL_NUM;
    case "monthlyReturn":  return fund.monthlyReturn ?? NULL_NUM;
    case "ytd2026":        return fund.returns.ytd2026 ?? NULL_NUM;
  }
}

function SortableHeader({ label, col, sortCol, sortDir, onSort, style }: {
  label: string;
  col: SortCol;
  sortCol: SortCol | null;
  sortDir: SortDir;
  onSort: (col: SortCol) => void;
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
          fontSize: 8,
          opacity: isActive ? 1 : 0.35,
          transition: "opacity 0.15s",
          lineHeight: 1,
        }}>
          {isActive ? (sortDir === "desc" ? "▼" : "▲") : "▾"}
        </span>
      </span>
    </th>
  );
}

/* ── Cells ── */
function ReturnCell({ value }: { value: number | null }) {
  return (
    <td style={{
      padding: "5px 6px",
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
  const bg = even ? "var(--bg-surface)" : "var(--bg-surface-alt)";
  const selectedBorder = comparisonEnabled && isSelected ? `2px solid ${accentColor || "var(--accent)"}` : "none";

  return (
    <tr style={{ backgroundColor: bg, borderInlineStart: selectedBorder }}>
      <td style={{ padding: "5px 10px", borderBottom: "1px solid var(--border-table)", fontWeight: 600, textAlign: "right", fontSize: "10.5px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
          {fund.name}
        </span>
      </td>
      <td style={{ padding: "5px 6px", borderBottom: "1px solid var(--border-table)", color: "var(--text-secondary)", textAlign: "right", fontSize: "9.5px" }}>
        {fund.classification}
      </td>
      <td style={{ padding: "5px 6px", borderBottom: "1px solid var(--border-table)", color: "var(--text-muted)", textAlign: "center", fontSize: "9.5px" }}>
        {fund.manager}
      </td>
      <td style={{ padding: "5px 6px", borderBottom: "1px solid var(--border-table)", color: "var(--text-muted)", textAlign: "center", fontSize: "9px", fontVariantNumeric: "tabular-nums" }}>
        {formatReportDate(fund.lastReportDate)}
      </td>
      <td style={{
        padding: "5px 6px",
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
      <ReturnCell value={fund.avgAnnualReturn} />
      <td style={{ padding: "5px 6px", textAlign: "center", borderBottom: "1px solid var(--border-table)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {num(fund.sharpe)}
      </td>
      <ReturnCell value={fund.stdDev} />
      <td style={{ padding: "5px 6px", textAlign: "center", borderBottom: "1px solid var(--border-table)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
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
    /* ── Default mode: grouped by category ── */
    for (const cat of categories) {
      if (cat.id === SUPER_HEADER_BEFORE) {
        rows.push(
          <tr key="super-header">
            <td colSpan={colCount}
              style={{ backgroundColor: "var(--bg-super)", color: "var(--text-on-dark)", padding: "7px 14px", fontWeight: 700, fontSize: "11.5px", textAlign: "right", letterSpacing: 0.3 }}>
              קרנות גידור ישראל
            </td>
          </tr>
        );
      }
      if (cat.funds.length === 0) continue;
      rows.push(
        <tr key={`cat-${cat.id}`}>
          <td colSpan={colCount}
            style={{ backgroundColor: SECTION_COLORS[cat.id] || "#374151", color: "#fff", padding: "5px 14px", fontWeight: 600, fontSize: "10.5px", textAlign: "right" }}>
            {cat.name}
          </td>
        </tr>
      );
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

  const thBase: React.CSSProperties = {
    padding: "7px 6px",
    fontWeight: 600,
    textAlign: "center",
    whiteSpace: "nowrap",
    borderBottom: "2px solid rgba(255,255,255,0.15)",
    fontSize: "9px",
    letterSpacing: 0.2,
  };

  const sortProps = { sortCol, sortDir, onSort: handleSort };

  return (
    <table className="fund-data-table" style={{ borderCollapse: "collapse", fontSize: "10.5px", lineHeight: 1.45 }}>
      <colgroup>
        {COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}
        <col />
      </colgroup>
      <thead>
        <tr style={{ backgroundColor: "var(--bg-section)", color: "#fff" }}>
          <SortableHeader label="שם קרן"     col="name"           style={{ ...thBase, textAlign: "right", paddingRight: 10 }} {...sortProps} />
          <SortableHeader label="סיווג"       col="classification" style={{ ...thBase, textAlign: "right" }}                   {...sortProps} />
          <SortableHeader label="מנהל"        col="manager"        style={thBase}                                               {...sortProps} />
          <th style={thBase}>מועד עדכון</th>
          <SortableHeader label="חודשי"       col="monthlyReturn"  style={thBase}                                               {...sortProps} />
          {activeYears.map((y) => y.key === "ytd2026"
            ? <SortableHeader key={y.key} label={y.label} col="ytd2026" style={thBase} {...sortProps} />
            : <th key={y.key} style={thBase}>{y.label}</th>
          )}
          <SortableHeader label="ממוצע שנתי"  col="avgAnnualReturn" style={thBase}                                              {...sortProps} />
          <SortableHeader label="שארפ"        col="sharpe"         style={thBase}                                               {...sortProps} />
          <SortableHeader label="ס״ת"         col="stdDev"         style={thBase}                                               {...sortProps} />
          <SortableHeader label="AUM (מ׳ ₪)"  col="aumMillions"    style={thBase}                                               {...sortProps} />
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
  );
}
