"use client";

import { useEffect, useState, Suspense, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FundsData } from "@/lib/types";
import { useBrand } from "@/lib/useBrand";
import { brandCssVars } from "@/lib/colors";
import { ThemeToggle } from "@/components/ThemeProvider";
import FundTableV2 from "@/components/FundTableV2";

const CLIENT = "green";

function PreviewContent() {
  const brand = useBrand(CLIENT);
  const [data, setData] = useState<FundsData | null>(null);
  const [selectedFundIds, setSelectedFundIds] = useState<Set<string>>(new Set());
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/funds?client=${encodeURIComponent(CLIENT)}`)
      .then((r) => r.json())
      .then(setData);
  }, []);

  const toggleFund = (id: string) => {
    setSelectedFundIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedFundIds(new Set());

  const navigateToCompare = useCallback(() => {
    if (selectedFundIds.size < 2) return;
    const ids = Array.from(selectedFundIds).join(",");
    router.push(`/compare?funds=${encodeURIComponent(ids)}&client=${encodeURIComponent(CLIENT)}`);
  }, [selectedFundIds, router]);

  return (
    <div
      style={{ minHeight: "100vh", ...brandCssVars(brand.primaryColor, brand.accentColor) } as React.CSSProperties}
    >
      {/* Header */}
      <div style={{ height: 4, backgroundColor: brand.primaryColor }} />
      <div style={{
        backgroundColor: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)",
        padding: "10px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
            FundTableV2 — Preview
          </span>
          <span style={{
            fontSize: 10, color: "#fff", fontWeight: 600,
            backgroundColor: brand.primaryColor,
            padding: "2px 8px", borderRadius: 4,
          }}>
            {CLIENT}
          </span>
          {selectedFundIds.size > 0 && (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {selectedFundIds.size} קרנות נבחרו
            </span>
          )}
        </div>
        <ThemeToggle />
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1600, margin: "0 auto", padding: "16px" }}>
        {!data ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
            טוען נתונים...
          </div>
        ) : (
          <div style={{
            backgroundColor: "var(--bg-surface)",
            borderRadius: 10,
            overflow: "hidden",
            boxShadow: "var(--shadow-card)",
          }}>
            <FundTableV2
              categories={data.categories}
              comparisonEnabled={true}
              selectedFundIds={selectedFundIds}
              onToggleFund={toggleFund}
              accentColor={brand.primaryColor}
            />
          </div>
        )}
      </div>

      {/* Floating Action Bar */}
      {selectedFundIds.size > 0 && (
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
    </div>
  );
}

export default function PreviewPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#888" }}>טוען...</div>}>
      <PreviewContent />
    </Suspense>
  );
}
