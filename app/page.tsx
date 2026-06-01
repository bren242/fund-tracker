"use client";

import { useEffect, useState, useMemo, Suspense, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FundsData } from "@/lib/types";
import FundTableV2 from "@/components/FundTableV2";
import PrintReport from "@/components/PrintReport";
import { ThemeToggle } from "@/components/ThemeProvider";
import { formatReportDate } from "@/lib/format";
import { useBrand } from "@/lib/useBrand";
import { useClientKey, withClient } from "@/lib/useClientKey";
import { useFilters } from "@/lib/useFilters";
import ClientGate from "@/components/ClientGate";
import { brandCssVars } from "@/lib/colors";

const PRINT_YEAR_OPTIONS = ["2026", "2025", "2024", "2023", "2022", "2021", "2020"];

function ReportContent() {
  const clientKey = useClientKey();
  const [data, setData] = useState<FundsData | null>(null);
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

  const printYearsArray = clientKey === "nox" ? PRINT_YEAR_OPTIONS.slice(0, 5) : PRINT_YEAR_OPTIONS;

  useEffect(() => {
    fetch(`/api/funds?client=${encodeURIComponent(clientKey)}`)
      .then((r) => r.json())
      .then(setData);
  }, [clientKey]);

  const { group, category, classification, search, options, setFilter, clearAll, filtered, activeFilterCount, ALL } = useFilters(data?.categories || []);

  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>טוען נתונים...</div>;

  const subtitle = brand.subtitleMode === "custom" && brand.customSubtitle
    ? brand.customSubtitle
    : `עדכון: ${formatReportDate(data.lastUpdated)}`;

  return (
    <ClientGate clientKey={clientKey}>
    <div style={{ minHeight: "100vh", ...brandCssVars(brand.primaryColor, brand.accentColor) } as React.CSSProperties}>
      {/* ============ SCREEN VERSION (hidden in print) ============ */}
      <div className="no-print">

        {/* Screen table */}
        <div style={{ width: "100%" }}>
          <FundTableV2
            categories={filtered}
            comparisonEnabled={comparisonEnabled}
            selectedFundIds={selectedFundIds}
            onToggleFund={toggleFundSelection}
            accentColor={brand.primaryColor}
            clientKey={clientKey}
          />
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
      <PrintReport categories={filtered} lastUpdated={data.lastUpdated} brand={brand} printYears={printYearsArray} clientKey={clientKey} />

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
