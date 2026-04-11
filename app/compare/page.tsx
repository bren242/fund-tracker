"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import dynamic from "next/dynamic";
import { FundsData, Fund, Benchmark } from "@/lib/types";
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
  const [allBenchmarks, setAllBenchmarks] = useState<Benchmark[]>([]);
  const benchmarksParam = searchParams.get("benchmarks") || "";
  const benchmarkIds = useMemo(() => benchmarksParam.split(",").filter(Boolean), [benchmarksParam]);
  const [selectedBmIds, setSelectedBmIds] = useState<string[]>([]);
  const mode = brand.features?.comparisonMode ?? "basic";
  const benchmarksEnabled = brand.features?.benchmarks ?? false;

  // Available year keys and their labels
  const YEAR_OPTIONS = [
    { key: "ytd2026", label: "מצטבר 2026" },
    { key: "y2025", label: "2025" },
    { key: "y2024", label: "2024" },
    { key: "y2023", label: "2023" },
    { key: "y2022", label: "2022" },
    { key: "y2021", label: "2021" },
    { key: "y2020", label: "2020" },
    { key: "y2019", label: "2019" },
  ];

  // Default: show all years
  const [selectedYears, setSelectedYears] = useState<string[]>(YEAR_OPTIONS.map((y) => y.key));

  const toggleYear = (key: string) => {
    setSelectedYears((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const selectAllYears = () => setSelectedYears(YEAR_OPTIONS.map((y) => y.key));
  const clearAllYears = () => setSelectedYears([]);

  useEffect(() => {
    fetch(`/api/funds?client=${encodeURIComponent(clientKey)}`)
      .then((r) => r.json())
      .then(setData);
    if (benchmarksEnabled) {
      fetch(`/api/benchmarks?client=${encodeURIComponent(clientKey)}`)
        .then((r) => r.json())
        .then((bms: Benchmark[]) => {
          setAllBenchmarks(bms);
          // If URL has benchmark params, select them
          if (benchmarkIds.length > 0) {
            setSelectedBmIds(benchmarkIds.filter((id) => bms.some((b) => b.id === id)).slice(0, 2));
          }
        });
    }
  }, [clientKey, benchmarksEnabled]);

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

  const selectedBenchmarks = useMemo(() =>
    selectedBmIds.map((id) => allBenchmarks.find((b) => b.id === id)).filter(Boolean) as Benchmark[],
  [selectedBmIds, allBenchmarks]);

  const toggleBenchmark = (id: string) => {
    setSelectedBmIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev; // max 2
      return [...prev, id];
    });
  };

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
                {brand.version && (
                  <span style={{ fontSize: 10, color: "var(--text-muted)", backgroundColor: "var(--bg-input)", padding: "2px 8px", borderRadius: 4, fontWeight: 500 }}>
                    v{brand.version}
                  </span>
                )}
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

          {/* ── VIEW TOGGLE ── */}
          <div style={{ backgroundColor: "var(--bg-surface-alt)", borderBottom: "1px solid var(--border)", padding: "14px 24px" }}>
            <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", justifyContent: "center" }}>
              <div style={{ display: "inline-flex", borderRadius: 12, border: `2px solid ${brand.primaryColor}`, overflow: "hidden" }}>
                <a href={withClient("/analysis", clientKey)} style={{
                  display: "inline-block", padding: "10px 32px", fontSize: 14, fontWeight: 600,
                  backgroundColor: "transparent", color: brand.primaryColor,
                  textDecoration: "none", transition: "background 0.15s",
                }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "color-mix(in srgb, var(--bg-surface) 80%, transparent)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "transparent"; }}
                >
                  תצוגת קרנות
                </a>
                <span style={{
                  display: "inline-block", padding: "10px 32px", fontSize: 14, fontWeight: 700,
                  backgroundColor: brand.primaryColor, color: "#fff",
                  cursor: "default", userSelect: "none",
                }}>
                  השוואה בין קרנות
                </span>
              </div>
            </div>
          </div>

          <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 24px 20px" }}>
            {/* Year selector */}
            <div style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 20,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  📅 בחר שנים להשוואה
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={selectAllYears}
                    style={{ fontSize: 10, padding: "3px 10px", borderRadius: 4, border: "1px solid var(--border)", backgroundColor: "var(--bg-surface-alt)", color: "var(--text-secondary)", cursor: "pointer" }}>
                    בחר הכל
                  </button>
                  <button onClick={clearAllYears}
                    style={{ fontSize: 10, padding: "3px 10px", borderRadius: 4, border: "1px solid var(--border)", backgroundColor: "var(--bg-surface-alt)", color: "var(--text-secondary)", cursor: "pointer" }}>
                    נקה
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {YEAR_OPTIONS.map((y) => {
                  const active = selectedYears.includes(y.key);
                  return (
                    <button
                      key={y.key}
                      onClick={() => toggleYear(y.key)}
                      style={{
                        padding: "5px 14px",
                        borderRadius: 6,
                        border: `1px solid ${active ? brand.primaryColor : "var(--border)"}`,
                        backgroundColor: active ? `${brand.primaryColor}15` : "var(--bg-surface)",
                        color: active ? brand.primaryColor : "var(--text-secondary)",
                        fontWeight: active ? 700 : 400,
                        fontSize: 12,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}>
                      {y.label}
                    </button>
                  );
                })}
              </div>
              {selectedYears.length === 0 && (
                <p style={{ fontSize: 11, color: "#f59e0b", margin: "8px 0 0", fontWeight: 500 }}>
                  ⚠️ לא נבחרו שנים — הטבלה תציג רק נתונים כלליים
                </p>
              )}
            </div>

            {/* Benchmark selector */}
            {benchmarksEnabled && allBenchmarks.length > 0 && (
              <div style={{
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "12px 16px",
                marginBottom: 20,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                    📊 מדדי ייחוס (עד 2)
                  </span>
                  {selectedBmIds.length > 0 && (
                    <button onClick={() => setSelectedBmIds([])}
                      style={{ fontSize: 10, padding: "3px 10px", borderRadius: 4, border: "1px solid var(--border)", backgroundColor: "var(--bg-surface-alt)", color: "var(--text-secondary)", cursor: "pointer" }}>
                      נקה
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {allBenchmarks.map((bm) => {
                    const active = selectedBmIds.includes(bm.id);
                    const atMax = selectedBmIds.length >= 2 && !active;
                    return (
                      <button
                        key={bm.id}
                        onClick={() => toggleBenchmark(bm.id)}
                        disabled={atMax}
                        style={{
                          padding: "5px 14px",
                          borderRadius: 6,
                          border: `1px solid ${active ? "#6366f1" : "var(--border)"}`,
                          backgroundColor: active ? "#6366f115" : "var(--bg-surface)",
                          color: active ? "#6366f1" : atMax ? "var(--text-muted)" : "var(--text-secondary)",
                          fontWeight: active ? 700 : 400,
                          fontSize: 12,
                          cursor: atMax ? "default" : "pointer",
                          opacity: atMax ? 0.4 : 1,
                          transition: "all 0.15s",
                        }}>
                        {bm.currency === "USD" ? "$" : "₪"} {bm.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <CompareSummary funds={funds} accentColor={brand.primaryColor} selectedYears={selectedYears} />
            <CompareTable funds={funds} accentColor={brand.primaryColor} selectedYears={selectedYears} benchmarks={selectedBenchmarks} />
            {mode === "advanced" && <CompareCharts funds={funds} accentColor={brand.primaryColor} benchmarks={selectedBenchmarks} selectedYears={selectedYears} />}
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
        <ComparePrint funds={funds} brand={brand} lastUpdated={data.lastUpdated} mode={mode} selectedYears={selectedYears} benchmarks={selectedBenchmarks} />
      </div>
    </ClientGate>
  );
}

/* ================================================================== */
/*  Print-only comparison report                                        */
/* ================================================================== */
function ComparePrint({ funds, brand, lastUpdated, mode, selectedYears, benchmarks }: {
  funds: Fund[];
  brand: BrandConfig;
  lastUpdated: string;
  mode: "basic" | "advanced";
  selectedYears?: string[];
  benchmarks?: Benchmark[];
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
              <CompareSummary funds={funds} accentColor={brand.primaryColor} compact selectedYears={selectedYears} />

              {/* Comparison table */}
              <CompareTable funds={funds} accentColor={brand.primaryColor} compact selectedYears={selectedYears} benchmarks={benchmarks} />

              {/* Divider between table and chart */}
              {mode === "advanced" && (
                <>
                  <div style={{ borderTop: "1px solid #dfe3e8", margin: "10px 0" }} />
                  <CompareCharts funds={funds} accentColor={brand.primaryColor} compact benchmarks={benchmarks} selectedYears={selectedYears} />
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
