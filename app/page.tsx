"use client";

import { useEffect, useState, useMemo, Suspense, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FundsData } from "@/lib/types";
import FundTable from "@/components/FundTable";
import PrintReport from "@/components/PrintReport";
import FilterBar from "@/components/FilterBar";
import { ThemeToggle } from "@/components/ThemeProvider";
import { formatDate } from "@/lib/format";
import { useBrand } from "@/lib/useBrand";
import { useClientKey, withClient } from "@/lib/useClientKey";
import { useFilters } from "@/lib/useFilters";
import BrandLogo from "@/components/BrandLogo";
import ClientGate from "@/components/ClientGate";
import { brandCssVars } from "@/lib/colors";

const PRINT_YEAR_OPTIONS = ["2026", "2025", "2024", "2023", "2022", "2021", "2020"];
const ALL_YEARS_SET = new Set(PRINT_YEAR_OPTIONS);

/* ── NavTab: Pill style ───────────────────────────────────────────────── */
function NavTab({ href, enabled, children, active }: {
  href: string;
  enabled: boolean;
  children: React.ReactNode;
  active?: boolean;
}) {
  if (!enabled) {
    return (
      <span className="nav-tab nav-tab--locked" title="פיצ'ר זה אינו פעיל עבורך">
        {children} 🔒
      </span>
    );
  }
  return (
    <Link href={href} className={`nav-tab${active ? " nav-tab--active" : ""}`}>
      {children}
    </Link>
  );
}

const SCREEN_YEAR_OPTIONS = ["2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019"];
const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const yearSelectStyle: React.CSSProperties = {
  padding: "3px 8px", borderRadius: 5, fontSize: 11, cursor: "pointer",
  border: "1px solid var(--border)", backgroundColor: "var(--bg-input)",
  color: "var(--text-primary)",
};

function ReportContent() {
  const clientKey = useClientKey();
  const [data, setData] = useState<FundsData | null>(null);
  const brand = useBrand(clientKey);

  // Screen year filter (separate from print years)
  const [yearFilterMode, setYearFilterMode] = useState<"all" | "single" | "range">("all");
  const [filterSingleYear, setFilterSingleYear] = useState("2025");
  const [filterFromYear,   setFilterFromYear]   = useState("2020");
  const [filterFromMonth,  setFilterFromMonth]  = useState("0");  // 0-indexed
  const [filterToYear,     setFilterToYear]     = useState("2025");
  const [filterToMonth,    setFilterToMonth]    = useState("11"); // 0-indexed

  // Compute which years to show on screen
  const screenVisibleYears: string[] | null = (() => {
    if (yearFilterMode === "all") return null; // null = show all (FundTable default)
    if (yearFilterMode === "single") return [filterSingleYear];
    // range mode: show years from filterFromYear to filterToYear
    const from = parseInt(filterFromYear);
    const to   = parseInt(filterToYear);
    if (from > to) return [filterFromYear];
    const years: string[] = [];
    for (let y = to; y >= from; y--) years.push(String(y)); // desc order
    return years;
  })();

  const router = useRouter();

  // Comparison state
  const [selectedFundIds, setSelectedFundIds] = useState<Set<string>>(new Set());
  const comparisonEnabled = brand.features?.comparison ?? true;

  const toggleFundSelection = useCallback((id: string) => {
    setSelectedFundIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  }, []);

  const clearSelection = () => setSelectedFundIds(new Set());

  const navigateToCompare = useCallback(() => {
    if (selectedFundIds.size < 2) return;
    const ids = Array.from(selectedFundIds).join(",");
    router.push(`/compare?funds=${encodeURIComponent(ids)}&client=${encodeURIComponent(clientKey)}`);
  }, [selectedFundIds, clientKey, router]);

  // Chart page feature flag
  const chartPageEnabled = brand.features?.chartPage ?? true;

  // Print years now derived from screen filter (same source, no separate print picker)
  const printYearsArray = screenVisibleYears
    ? screenVisibleYears.filter((y) => PRINT_YEAR_OPTIONS.includes(y))
    : PRINT_YEAR_OPTIONS;

  useEffect(() => {
    fetch(`/api/funds?client=${encodeURIComponent(clientKey)}`)
      .then((r) => r.json())
      .then(setData);
  }, [clientKey]);

  const { group, category, classification, search, options, setFilter, clearAll, filtered, activeFilterCount, ALL } = useFilters(data?.categories || []);

  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>טוען נתונים...</div>;

  const subtitle = brand.subtitleMode === "custom" && brand.customSubtitle
    ? brand.customSubtitle
    : `עדכון: ${formatDate(data.lastUpdated)}`;

  return (
    <ClientGate clientKey={clientKey}>
    <div style={{ minHeight: "100vh", ...brandCssVars(brand.primaryColor, brand.accentColor) } as React.CSSProperties}>
      {/* ============ SCREEN VERSION (hidden in print) ============ */}
      <div className="no-print">
        {/* Thin brand color bar */}
        <div style={{ height: 4, backgroundColor: brand.primaryColor }} />
        {/* Screen header */}
        <div style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
          <div style={{ maxWidth: 1600, margin: "0 auto", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <BrandLogo brand={brand} height={28} variant="light" />
              <span style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 600 }}>{brand.mainTitle}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {subtitle}
              </span>
              {brand.version && (
                <span style={{ fontSize: 10, color: "var(--text-muted)", backgroundColor: "var(--bg-input)", padding: "2px 8px", borderRadius: 4, fontWeight: 500 }}>
                  v{brand.version}
                </span>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  onClick={() => window.print()}
                  style={{ backgroundColor: brand.primaryColor, color: "#fff", fontWeight: 700, padding: "6px 18px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, letterSpacing: 0.3, transition: "opacity 0.15s" }}
                  onMouseOver={(e) => (e.currentTarget.style.opacity = "0.85")}
                  onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
                >
                  הדפסה / PDF
                </button>
              </div>
              <div className="nav-tabs">
                <NavTab href={withClient("/", clientKey)} enabled={true} active={true}>קרנות</NavTab>
                <NavTab href={withClient("/analysis", clientKey)} enabled={true}>ניתוח</NavTab>
                <NavTab href={withClient("/charts", clientKey)} enabled={chartPageEnabled}>גרפים</NavTab>
                <NavTab href={withClient("/consistency", clientKey)} enabled={brand.features?.consistencyAnalysis ?? false}>עקביות</NavTab>
                <NavTab href={withClient("/indications", clientKey)} enabled={brand.features?.indications ?? false}>⚡ אינדיקציה</NavTab>
                <NavTab href={withClient("/fund-status", clientKey)} enabled={brand.features?.fundStatus ?? false}>סטטוס</NavTab>
                <NavTab href={withClient("/admin", clientKey)} enabled={true}>ניהול</NavTab>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <FilterBar
          group={group}
          category={category}
          classification={classification}
          search={search}
          options={options}
          activeFilterCount={activeFilterCount}
          onGroupChange={(v) => setFilter("group", v)}
          onCategoryChange={(v) => setFilter("category", v)}
          onClassificationChange={(v) => setFilter("classification", v)}
          onSearchChange={(v) => setFilter("search", v)}
          onClearAll={clearAll}
          accentColor={brand.primaryColor}
        />

        {/* Year filter strip */}
        <div className="no-print" style={{ maxWidth: 1600, margin: "0 auto", padding: "6px 16px 0" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "8px 14px", fontSize: 12,
          }} dir="rtl">
            {/* Label */}
            <span style={{ color: "var(--text-muted)", fontSize: 11 }}>תקופה:</span>

            {/* Mode toggle */}
            {(["all", "single", "range"] as const).map((m) => {
              const label = m === "all" ? "הכל" : m === "single" ? "שנה בודדת" : "טווח";
              const active = yearFilterMode === m;
              return (
                <button key={m} onClick={() => setYearFilterMode(m)} style={{
                  padding: "3px 12px", borderRadius: 5, fontSize: 11, cursor: "pointer",
                  fontWeight: active ? 700 : 400, transition: "all 0.12s",
                  backgroundColor: active ? brand.primaryColor : "var(--bg-input)",
                  color: active ? "#fff" : "var(--text-secondary)",
                  border: active ? `1px solid ${brand.primaryColor}` : "1px solid var(--border)",
                }}>
                  {label}
                </button>
              );
            })}

            {/* Single year dropdown */}
            {yearFilterMode === "single" && (
              <select value={filterSingleYear} onChange={(e) => setFilterSingleYear(e.target.value)} style={yearSelectStyle}>
                {SCREEN_YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}

            {/* Range dropdowns */}
            {yearFilterMode === "range" && (
              <>
                <select value={filterFromYear} onChange={(e) => setFilterFromYear(e.target.value)} style={yearSelectStyle}>
                  {SCREEN_YEAR_OPTIONS.slice().reverse().map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <select value={filterFromMonth} onChange={(e) => setFilterFromMonth(e.target.value)} style={yearSelectStyle}>
                  {MONTHS_HE.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>
                <select value={filterToYear} onChange={(e) => setFilterToYear(e.target.value)} style={yearSelectStyle}>
                  {SCREEN_YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <select value={filterToMonth} onChange={(e) => setFilterToMonth(e.target.value)} style={yearSelectStyle}>
                  {MONTHS_HE.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </>
            )}
          </div>
        </div>

        {/* Screen table */}
        <div className="screen-fund-table-wrap" style={{ maxWidth: 1600, margin: "0 auto", padding: "10px 16px 20px", overflowX: "auto" }}>
          <div className="screen-fund-table" style={{ backgroundColor: "var(--bg-surface)", borderRadius: 10, overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
            <FundTable
              categories={filtered}
              comparisonEnabled={comparisonEnabled}
              selectedFundIds={selectedFundIds}
              onToggleFund={toggleFundSelection}
              visibleYears={screenVisibleYears ?? printYearsArray}
              accentColor={brand.primaryColor}
            />
          </div>
        </div>

        {/* Screen disclaimer */}
        {brand.footerDisclaimer && (
        <div style={{ maxWidth: 1600, margin: "0 auto", padding: "0 24px 20px" }}>
          <div style={{ backgroundColor: "var(--bg-surface-alt)", borderRadius: 8, padding: "12px 18px", fontSize: 10, color: "var(--text-muted)", lineHeight: 1.6, border: "1px solid var(--border)", whiteSpace: "pre-line" }}>
            {brand.footerDisclaimer}
          </div>
        </div>
        )}

        <div style={{ textAlign: "center", padding: "8px 0 20px", fontSize: 10, color: "var(--text-muted)", letterSpacing: 0.2 }}>
          {brand.showCredit && brand.creditText ? `All rights reserved — ${brand.creditText}` : brand.fullName ? `© ${brand.fullName}` : ""}
        </div>
      </div>

      {/* ============ PRINT VERSION (hidden on screen) ============ */}
      <PrintReport categories={filtered} lastUpdated={data.lastUpdated} brand={brand} printYears={printYearsArray} />

    </div>

      {/* ============ FLOATING ACTION BAR ============ */}
      {comparisonEnabled && selectedFundIds.size > 0 && (
        <div className="floating-action-bar no-print">
          <span className="floating-action-bar__count">
            {selectedFundIds.size} קרנות נבחרות
          </span>
          <div className="floating-action-bar__actions">
            <button
              className="floating-action-bar__clear"
              onClick={clearSelection}
            >
              נקה
            </button>
            <button
              className="floating-action-bar__compare"
              onClick={navigateToCompare}
              disabled={selectedFundIds.size < 2}
            >
              השווה →
            </button>
          </div>
        </div>
      )}
    </ClientGate>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>טוען...</div>}>
      <ReportContent />
    </Suspense>
  );
}
