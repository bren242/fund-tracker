"use client";

import { useEffect, useState, useMemo, Suspense, useCallback } from "react";
import { useRouter } from "next/navigation";
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

function ReportContent() {
  const clientKey = useClientKey();
  const [data, setData] = useState<FundsData | null>(null);
  const [printYears, setPrintYears] = useState<Set<string>>(ALL_YEARS_SET);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const brand = useBrand(clientKey);

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

  const toggleYear = (year: string) => {
    setPrintYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year); else next.add(year);
      return next.size === 0 ? new Set(PRINT_YEAR_OPTIONS) : next; // prevent empty
    });
  };
  const allSelected = printYears.size === PRINT_YEAR_OPTIONS.length;
  const toggleAll = () => setPrintYears(allSelected ? new Set(["2026"]) : new Set(PRINT_YEAR_OPTIONS));
  const printYearsArray = PRINT_YEAR_OPTIONS.filter((y) => printYears.has(y));

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
              <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
                <button
                  onClick={() => setShowYearPicker((v) => !v)}
                  style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 11, color: "var(--text-primary)", backgroundColor: "var(--bg-input)", cursor: "pointer" }}
                  title="בחר שנים להדפסה"
                >
                  שנים ({allSelected ? "הכל" : printYears.size}) ▾
                </button>
                {showYearPicker && (
                  <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", zIndex: 100, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: 140 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-primary)", cursor: "pointer", padding: "3px 0", fontWeight: 600 }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: "pointer" }} />
                      הכל
                    </label>
                    <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                    {PRINT_YEAR_OPTIONS.map((y) => (
                      <label key={y} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-primary)", cursor: "pointer", padding: "2px 0" }}>
                        <input type="checkbox" checked={printYears.has(y)} onChange={() => toggleYear(y)} style={{ cursor: "pointer" }} />
                        {y}
                      </label>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => { setShowYearPicker(false); window.print(); }}
                  style={{ backgroundColor: brand.primaryColor, color: "#fff", fontWeight: 700, padding: "6px 18px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, letterSpacing: 0.3, transition: "opacity 0.15s" }}
                  onMouseOver={(e) => (e.currentTarget.style.opacity = "0.85")}
                  onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
                >
                  הדפסה / PDF
                </button>
              </div>
              {comparisonEnabled && selectedFundIds.size > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    onClick={navigateToCompare}
                    disabled={selectedFundIds.size < 2}
                    style={{
                      backgroundColor: selectedFundIds.size >= 2 ? brand.primaryColor : "var(--text-muted)",
                      color: "#fff", fontWeight: 700, padding: "5px 14px", borderRadius: 6,
                      border: "none", cursor: selectedFundIds.size >= 2 ? "pointer" : "default",
                      fontSize: 12, opacity: selectedFundIds.size >= 2 ? 1 : 0.5,
                      transition: "opacity 0.15s", display: "flex", alignItems: "center", gap: 4,
                    }}
                  >
                    השווה ({selectedFundIds.size})
                  </button>
                  <button
                    onClick={clearSelection}
                    style={{
                      backgroundColor: "transparent", color: "var(--text-muted)",
                      border: "1px solid var(--border)", borderRadius: 6,
                      padding: "5px 10px", cursor: "pointer", fontSize: 11,
                    }}
                    title="נקה בחירה"
                  >
                    ✕
                  </button>
                </div>
              )}
              {chartPageEnabled && (
                <a href={withClient("/charts", clientKey)} style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", transition: "border-color 0.15s" }}>גרפים</a>
              )}
              <a href={withClient("/analysis", clientKey)} style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", transition: "border-color 0.15s" }}>ניתוח</a>
              {brand.features?.dataCompletion && (
                <a href={withClient("/data-completion", clientKey)} style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", transition: "border-color 0.15s" }}>השלמת נתונים</a>
              )}
              {brand.features?.indications && (
                <a href={withClient("/indications", clientKey)} style={{ fontSize: 12, color: "#fff", textDecoration: "none", padding: "5px 12px", borderRadius: 6, border: "none", backgroundColor: brand.primaryColor, fontWeight: 600, transition: "opacity 0.15s" }}
                  onMouseOver={(e) => (e.currentTarget.style.opacity = "0.85")}
                  onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
                >⚡ אינדיקציה</a>
              )}
              {brand.features?.fundStatus && (
                <a href={withClient("/fund-status", clientKey)} style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", transition: "border-color 0.15s" }}>סטטוס</a>
              )}
              {brand.features?.consistencyAnalysis && (
                <a href={withClient("/consistency", clientKey)} style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", transition: "border-color 0.15s" }}>עקביות</a>
              )}
              <a href={withClient("/admin", clientKey)} style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", transition: "border-color 0.15s" }}>ניהול</a>
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

        {/* Screen table */}
        <div className="screen-fund-table-wrap" style={{ maxWidth: 1600, margin: "0 auto", padding: "10px 16px 20px", overflowX: "auto" }}>
          <div className="screen-fund-table" style={{ backgroundColor: "var(--bg-surface)", borderRadius: 10, overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
            <FundTable
              categories={filtered}
              comparisonEnabled={comparisonEnabled}
              selectedFundIds={selectedFundIds}
              onToggleFund={toggleFundSelection}
              visibleYears={printYearsArray}
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
