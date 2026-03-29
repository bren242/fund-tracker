"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import dynamic from "next/dynamic";
import { FundsData, Fund } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { useBrand } from "@/lib/useBrand";
import { useClientKey, withClient } from "@/lib/useClientKey";
import { useSearchParams } from "next/navigation";
import { BrandConfig } from "@/config/brand";
import BrandLogo from "@/components/BrandLogo";
import ClientGate from "@/components/ClientGate";
import CompareSummary from "@/components/CompareSummary";
import CompareTable from "@/components/CompareTable";
import { brandCssVars } from "@/lib/colors";

/* Dynamic import — only loaded in advanced mode */
const CompareCharts = dynamic(() => import("@/components/CompareCharts"), { ssr: false });

/* ================================================================== */
/*  Compare Page                                                        */
/* ================================================================== */
function CompareContent() {
  const clientKey = useClientKey();
  const brand = useBrand(clientKey);
  const searchParams = useSearchParams();
  const fundsParam = searchParams.get("funds") || "";
  const fundIds = useMemo(() => fundsParam.split(",").filter(Boolean), [fundsParam]);

  const [data, setData] = useState<FundsData | null>(null);
  const mode = brand.features?.comparisonMode ?? "basic";

  useEffect(() => {
    fetch(`/api/funds?client=${encodeURIComponent(clientKey)}`)
      .then((r) => r.json())
      .then(setData);
  }, [clientKey]);

  const funds: Fund[] = useMemo(() => {
    if (!data || fundIds.length === 0) return [];
    const all: Fund[] = [];
    for (const cat of data.categories) {
      for (const f of cat.funds) {
        if (fundIds.includes(f.id)) all.push(f);
      }
    }
    // Preserve original selection order
    return fundIds.map((id) => all.find((f) => f.id === id)).filter(Boolean) as Fund[];
  }, [data, fundIds]);

  // Feature gate
  const comparisonEnabled = brand.features?.comparison ?? true;

  if (!data) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>טוען נתונים...</div>;
  }

  if (!comparisonEnabled) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
        <p>תכונת ההשוואה אינה פעילה עבור לקוח זה.</p>
        <a href={withClient("/", clientKey)} style={{ color: "var(--accent)" }}>חזור לדוח</a>
      </div>
    );
  }

  if (funds.length < 2) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
        <p>יש לבחור לפחות 2 קרנות להשוואה.</p>
        <a href={withClient("/", clientKey)} style={{ color: "var(--accent)" }}>חזור לדוח</a>
      </div>
    );
  }

  const currentYear = new Date().getFullYear();

  return (
    <ClientGate clientKey={clientKey}>
      {/* Override print to portrait for compare page */}
      <style>{`@media print { @page { size: A4 portrait; margin: 8mm 10mm 14mm 10mm; } }`}</style>
      <div style={{ minHeight: "100vh", ...brandCssVars(brand.primaryColor, brand.accentColor) } as React.CSSProperties}>
        {/* ============ SCREEN VERSION ============ */}
        <div className="no-print">
          <div style={{ height: 4, backgroundColor: brand.primaryColor }} />
          <div style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
            <div style={{ maxWidth: 960, margin: "0 auto", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <BrandLogo brand={brand} height={28} variant="light" />
                <span style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 600 }}>השוואת קרנות</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => window.print()}
                  style={{ backgroundColor: brand.primaryColor, color: "#fff", fontWeight: 700, padding: "6px 18px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12 }}
                >
                  הדפסה / PDF
                </button>
                <a href={withClient("/", clientKey)} style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)" }}>
                  ← חזור לדוח
                </a>
              </div>
            </div>
          </div>

          <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 24px 20px" }}>
            <CompareSummary funds={funds} accentColor={brand.primaryColor} />
            <CompareTable funds={funds} accentColor={brand.primaryColor} />
            {mode === "advanced" && <CompareCharts funds={funds} accentColor={brand.primaryColor} />}
          </div>

          {/* Screen disclaimer */}
          {brand.footerDisclaimer && (
            <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px 20px" }}>
              <div style={{ backgroundColor: "var(--bg-surface-alt)", borderRadius: 8, padding: "12px 18px", fontSize: 10, color: "var(--text-muted)", lineHeight: 1.6, border: "1px solid var(--border)", whiteSpace: "pre-line" }}>
                {brand.footerDisclaimer}
              </div>
            </div>
          )}

          <div style={{ textAlign: "center", padding: "8px 0 20px", fontSize: 10, color: "var(--text-muted)" }}>
            {brand.showCredit && brand.creditText ? `All rights reserved — ${brand.creditText}` : brand.fullName ? `© ${brand.fullName}` : ""}
          </div>
        </div>

        {/* ============ PRINT VERSION ============ */}
        <ComparePrint funds={funds} brand={brand} lastUpdated={data.lastUpdated} mode={mode} />
      </div>
    </ClientGate>
  );
}

/* ================================================================== */
/*  Print-only comparison report                                        */
/* ================================================================== */
function ComparePrint({ funds, brand, lastUpdated, mode }: {
  funds: Fund[];
  brand: BrandConfig;
  lastUpdated: string;
  mode: "basic" | "advanced";
}) {
  const currentYear = new Date().getFullYear();

  return (
    <div className="print-only" style={{ width: "100%", background: "white", color: "#1a1f2b" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "8pt", lineHeight: 1.4 }}>
        <thead>
          {/* === HEADER ROW 1: Logo + Date === */}
          <tr>
            <td style={{ padding: "6px 8px 4px", background: "white" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody><tr>
                <td style={{ textAlign: "right", verticalAlign: "middle" }}>
                  <span style={{ fontSize: "7pt", color: "#8893a4", whiteSpace: "nowrap" }}>מעודכן ל: {formatDate(lastUpdated)}</span>
                </td>
                <td style={{ textAlign: "left", verticalAlign: "middle", width: "120px" }}>
                  {(brand.logoLight || brand.logo) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={brand.logoLight || brand.logo} alt={brand.name || ""} style={{ maxHeight: 30, width: "auto", objectFit: "contain" }} />
                  )}
                </td>
              </tr></tbody></table>
            </td>
          </tr>
          {/* === HEADER ROW 2: Title === */}
          <tr>
            <td style={{ padding: "2px 0 8px", borderBottom: `2px solid ${brand.secondaryColor}`, background: "white", textAlign: "center" }}>
              <span style={{ fontSize: "14pt", color: brand.primaryColor, fontWeight: 700, letterSpacing: "0.5px" }}>
                השוואת קרנות
              </span>
            </td>
          </tr>
          {/* Spacer */}
          <tr><td style={{ height: 8, padding: 0, border: "none", background: "white", lineHeight: 0, fontSize: 0 }} /></tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: 0 }}>
              {/* Compact summary strip */}
              <CompareSummary funds={funds} accentColor={brand.primaryColor} compact />

              {/* Comparison table */}
              <CompareTable funds={funds} accentColor={brand.primaryColor} compact />

              {/* Divider between table and chart */}
              {mode === "advanced" && (
                <>
                  <div style={{ borderTop: "1px solid #dfe3e8", margin: "10px 0" }} />
                  <CompareCharts funds={funds} accentColor={brand.primaryColor} compact />
                </>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Fixed print footer */}
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
        </div>
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>טוען...</div>}>
      <CompareContent />
    </Suspense>
  );
}
