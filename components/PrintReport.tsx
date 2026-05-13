"use client";

import { Category, Fund } from "@/lib/types";
import { pct, num, formatDate, formatReportDate } from "@/lib/format";
import { getAvgAnnualReturn } from "@/lib/fundDerived";

import { BrandConfig } from "@/config/brand";
import { SECTION_COLORS } from "@/lib/constants";
import { darkenHex } from "@/lib/colors";

type ReturnKey = "ytd2026" | "y2025" | "y2024" | "y2023" | "y2022" | "y2021" | "y2020" | "y2019";

const ALL_YEAR_KEYS: { key: ReturnKey; label: string; year: string }[] = [
  { key: "ytd2026", label: "מצטבר 2026", year: "2026" },
  { key: "y2025", label: "2025", year: "2025" },
  { key: "y2024", label: "2024", year: "2024" },
  { key: "y2023", label: "2023", year: "2023" },
  { key: "y2022", label: "2022", year: "2022" },
  { key: "y2021", label: "2021", year: "2021" },
  { key: "y2020", label: "2020", year: "2020" },
  { key: "y2019", label: "2019", year: "2019" },
];

function returnColor(v: number | null): string {
  if (v === null) return "#1a1f2b";
  if (v > 0) return "#0d7c4a";
  if (v < 0) return "#c42b2b";
  return "#1a1f2b";
}

interface PrintReportProps {
  categories: Category[];
  lastUpdated: string;
  brand: BrandConfig;
  /** Array of years to show, e.g. ["2026","2025","2024"]. All years if full array. */
  printYears?: string[];
  clientKey?: string;
}

function formatYearMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `${m}/${y}`;
}

export default function PrintReport({ categories, lastUpdated, brand, printYears, clientKey }: PrintReportProps) {
  // Determine which year columns to show
  const selectedYears = printYears && printYears.length > 0 ? new Set(printYears) : null;
  const yearKeys = selectedYears
    ? ALL_YEAR_KEYS.filter((y) => selectedYears.has(y.year))
    : ALL_YEAR_KEYS;

  const isFiltered = yearKeys.length < ALL_YEAR_KEYS.length;

  // Base columns: name, classification, manager, date, monthly = 5
  // Tail columns: avg, sharpe, stddev, aum = 4
  const colCount = 5 + yearKeys.length + 4;

  // Dynamic column widths — distribute extra space when fewer year cols
  const extraPct = isFiltered ? Math.min((ALL_YEAR_KEYS.length - yearKeys.length) * 2, 16) : 0;
  const nameWidth = `${9 + extraPct * 0.3}%`;
  const classWidth = `${8 + extraPct * 0.15}%`;
  const managerWidth = `${7 + extraPct * 0.1}%`;
  const dateWidth = `${5 + extraPct * 0.05}%`;
  const monthlyWidth = `${5 + extraPct * 0.05}%`;
  const yearWidth = isFiltered ? `${5.5 + extraPct * 0.1}%` : "5.5%";
  const avgWidth = `${5 + extraPct * 0.05}%`;
  const sharpeWidth = `${4 + extraPct * 0.05}%`;
  const stdWidth = `${4 + extraPct * 0.05}%`;
  const aumWidth = "5%";

  const baseFontSize = isFiltered && yearKeys.length <= 3 ? "7pt" : "6.5pt";
  const thFontSize = isFiltered && yearKeys.length <= 3 ? "7pt" : "6pt";

  const rows: React.ReactNode[] = [];
  const isNox = clientKey === "nox";

  let isFirst = true;
  for (const cat of categories) {
    if (cat.funds.length === 0) continue;

    if (isFirst && cat.id === "bond-hedged") {
      rows.push(
        <tr key="super-header">
          <td colSpan={colCount} style={{ backgroundColor: darkenHex(brand.primaryColor, 0.4), color: "#fff", padding: "4px 10px", fontWeight: 700, fontSize: "8pt", textAlign: "right" }}>
            קרנות גידור ישראל
          </td>
        </tr>
      );
    }
    isFirst = false;

    rows.push(
      <tr key={`cat-${cat.id}`}>
        <td colSpan={colCount} style={{ backgroundColor: SECTION_COLORS[cat.id] || "#374151", color: "#fff", padding: "3px 10px", fontWeight: 600, fontSize: "7pt", textAlign: "right" }}>
          {cat.name}
        </td>
      </tr>
    );

    for (let i = 0; i < cat.funds.length; i++) {
      const f = cat.funds[i];
      const bg = i % 2 === 0 ? "#ffffff" : "#f8f9fb";
      const monthlyVal = isNox && f.lastMonth
        ? (f.noxMtdLog?.[f.lastMonth] ?? f.monthlyReturn)
        : f.monthlyReturn;
      const updatedDisplay = isNox && f.lastMonth
        ? formatYearMonth(f.lastMonth)
        : formatReportDate(f.lastUpdated);
      rows.push(
        <tr key={f.id} style={{ backgroundColor: bg }}>
          <td style={tdStyle({ fontWeight: 600, textAlign: "right", fontSize: baseFontSize })}>{f.name}</td>
          <td style={tdStyle({ textAlign: "right", color: "#5a6577", fontSize: baseFontSize })}>{f.classification}</td>
          <td style={tdStyle({ textAlign: "center", color: "#8893a4", fontSize: baseFontSize })}>{f.manager}</td>
          <td style={tdStyle({ textAlign: "center", color: "#8893a4", fontSize: baseFontSize })}>{updatedDisplay}</td>
          <td style={tdStyle({ textAlign: "center", fontWeight: 600, color: returnColor(monthlyVal ?? null), fontSize: baseFontSize })}>{pct(monthlyVal)}</td>
          {yearKeys.map((y) => (
            <td key={y.key} style={tdStyle({ textAlign: "center", color: returnColor(f.returns[y.key]), fontSize: baseFontSize })}>{pct(f.returns[y.key])}</td>
          ))}
          <td style={tdStyle({ textAlign: "center", color: returnColor(getAvgAnnualReturn(f)), fontSize: baseFontSize })}>{pct(getAvgAnnualReturn(f))}</td>
          <td style={tdStyle({ textAlign: "center", fontSize: baseFontSize })}>{num(f.sharpe)}</td>
          <td style={tdStyle({ textAlign: "center", color: returnColor(f.stdDev), fontSize: baseFontSize })}>{pct(f.stdDev)}</td>
          <td style={tdStyle({ textAlign: "center", fontSize: baseFontSize })}>{f.aumMillions != null ? f.aumMillions.toLocaleString() : "—"}</td>
        </tr>
      );
    }
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const printDate = now.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });

  const thBase: React.CSSProperties = {
    padding: "4px 4px 5px",
    fontWeight: 700,
    textAlign: "center",
    whiteSpace: "nowrap",
    fontSize: thFontSize,
    color: "#fff",
    borderBottom: "2px solid rgba(255,255,255,0.3)",
  };

  // Year label for print title
  const yearLabel = isFiltered
    ? yearKeys.map((y) => y.label).join(", ")
    : "";

  return (
    <div className="print-only" style={{ width: "100%", background: "white", color: "#1a1f2b" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: baseFontSize, lineHeight: 1.4 }}>
        <colgroup>
          <col style={{ width: nameWidth }} />
          <col style={{ width: classWidth }} />
          <col style={{ width: managerWidth }} />
          <col style={{ width: dateWidth }} />
          <col style={{ width: monthlyWidth }} />
          {yearKeys.map((y) => (
            <col key={y.key} style={{ width: yearWidth }} />
          ))}
          <col style={{ width: avgWidth }} />
          <col style={{ width: sharpeWidth }} />
          <col style={{ width: stdWidth }} />
          <col style={{ width: aumWidth }} />
        </colgroup>
        <thead>
          {/* Branding header row — repeats on every printed page */}
          <tr>
            <td colSpan={colCount} style={{ padding: "0 0 6px 0", borderBottom: `2px solid ${brand.secondaryColor}`, background: "white" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody><tr>
                <td style={{ width: "120px", textAlign: "right", verticalAlign: "middle", padding: "6px 8px" }}>
                  <span style={{ fontSize: "7pt", color: "#5a6577", whiteSpace: "nowrap" }}>מעודכן ל: {formatDate(lastUpdated)}</span>
                </td>
                <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                  <span style={{ fontSize: "11pt", color: brand.primaryColor, fontWeight: 700 }}>
                    {brand.mainTitle}{yearLabel ? ` — ${yearLabel}` : ""}
                  </span>
                </td>
                <td style={{ width: "120px", textAlign: "left", verticalAlign: "middle", padding: "6px 8px" }}>
                  {(brand.logoLight || brand.logo) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={brand.logoLight || brand.logo} alt={brand.name || ""} style={{ maxHeight: 32, width: "auto", objectFit: "contain" }} />
                  )}
                </td>
              </tr></tbody></table>
            </td>
          </tr>
          {/* Column headers */}
          <tr style={{ backgroundColor: brand.secondaryColor }}>
            <th style={{ ...thBase, textAlign: "right", paddingRight: 8 }}>שם קרן</th>
            <th style={{ ...thBase, textAlign: "right" }}>סיווג</th>
            <th style={thBase}>מנהל</th>
            <th style={thBase}>מועד עדכון</th>
            <th style={thBase}>חודשי</th>
            {yearKeys.map((y) => (
              <th key={y.key} style={thBase}>{y.label}</th>
            ))}
            <th style={thBase}>תשואה ממוצעת שנתית</th>
            <th style={thBase}>שארפ</th>
            <th style={thBase}>ס״ת</th>
            <th style={thBase}>AUM (מ׳ ₪)</th>
          </tr>
          {/* Spacer row — creates gap between header and content on every page */}
          <tr><td colSpan={colCount} style={{ height: 6, padding: 0, border: "none", background: "white", lineHeight: 0, fontSize: 0 }} /></tr>
        </thead>
        <tbody>
          {rows}
        </tbody>
      </table>

      {/* Fixed print footer — pinned to bottom of every printed page */}
      <div className="print-footer" style={{ borderTop: "1px solid #ccc" }}>
        {brand.footerDisclaimer && (
          <div style={{ padding: "3px 8px", fontSize: "4.5pt", color: "#666", lineHeight: 1.3, background: "white" }}>
            {brand.footerDisclaimer}
          </div>
        )}
        <div style={{ padding: "2px 8px 3px", fontSize: "5pt", color: "#999", textAlign: "center", background: "white", borderTop: brand.footerDisclaimer ? "1px solid #e5e5e5" : "none" }}>
          {brand.fullName ? `© ${currentYear} ${brand.fullName}. כל הזכויות שמורות` : `© ${currentYear}`}
          {brand.version ? ` | גרסה ${brand.version}` : ""}
          {brand.showCredit && brand.creditText ? ` | ${brand.creditText}` : ""}
          {` | תאריך הדפסה: ${printDate}`}
        </div>
      </div>
    </div>
  );
}

function tdStyle(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    padding: "2px 3px",
    borderBottom: "1px solid #e8eaed",
    fontSize: "6.5pt",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    ...extra,
  };
}
