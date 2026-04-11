"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { FundsData, Fund } from "@/lib/types";
import { useBrand } from "@/lib/useBrand";
import { useClientKey, withClient } from "@/lib/useClientKey";
import { ThemeToggle } from "@/components/ThemeProvider";
import BrandLogo from "@/components/BrandLogo";
import ClientGate from "@/components/ClientGate";
import { brandCssVars } from "@/lib/colors";
import FundCard from "@/components/FundCard";

const ALL = "הכל";
const MAX_SELECT = 6;

/* ================================================================== */
/*  Analysis Content                                                   */
/* ================================================================== */
function AnalysisContent() {
  const clientKey = useClientKey();
  const brand = useBrand(clientKey);
  const [data, setData] = useState<FundsData | null>(null);

  /* Filters */
  const [group, setGroup] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [classification, setClassification] = useState(ALL);
  const [currencyFilter, setCurrencyFilter] = useState<"all" | "ILS" | "USD">("all");

  /* Manual comparison */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showComparison, setShowComparison] = useState(false);

  useEffect(() => {
    fetch(`/api/funds?client=${encodeURIComponent(clientKey)}`)
      .then((r) => r.json())
      .then(setData);
  }, [clientKey]);

  /* ── Cascading filter options ── */
  const filterOptions = useMemo(() => {
    if (!data) return { groups: [] as string[], categories: [] as string[], classifications: [] as string[] };
    const groupSet = new Set<string>();
    const catSet = new Set<string>();
    const clsSet = new Set<string>();
    for (const cat of data.categories) {
      const section = cat.parentSection || "כללי";
      groupSet.add(section);
      if (group === ALL || section === group) {
        catSet.add(cat.name);
        if (category === ALL || cat.name === category) {
          for (const f of cat.funds) {
            if (f.classification) clsSet.add(f.classification);
          }
        }
      }
    }
    return {
      groups: Array.from(groupSet),
      categories: Array.from(catSet),
      classifications: Array.from(clsSet).sort(),
    };
  }, [data, group, category]);

  /* ── Funds matching current filters ── */
  const filteredFunds = useMemo(() => {
    if (!data) return [] as Fund[];
    const result: Fund[] = [];
    for (const cat of data.categories) {
      const section = cat.parentSection || "כללי";
      if (group !== ALL && section !== group) continue;
      if (category !== ALL && cat.name !== category) continue;
      for (const f of cat.funds) {
        if (classification !== ALL && f.classification !== classification) continue;
        if (currencyFilter !== "all" && f.currency !== currencyFilter) continue;
        result.push(f);
      }
    }
    return result;
  }, [data, group, category, classification, currencyFilter]);

  /* ── TOP funds ── */
  const topFunds = useMemo(() => {
    const withRet = filteredFunds.filter((f) => f.avgAnnualReturn !== null);
    const sorted = [...withRet].sort(
      (a, b) => (b.avgAnnualReturn ?? -Infinity) - (a.avgAnnualReturn ?? -Infinity),
    );
    if (filteredFunds.length < 5) {
      return { mode: "all" as const, all: filteredFunds };
    }
    return {
      mode: "top" as const,
      best: sorted.slice(0, 2),
      worst: [...sorted].reverse().slice(0, 2),
    };
  }, [filteredFunds]);

  /* ── Mixed currency warning ── */
  const hasMixedCurrencies = useMemo(() => {
    if (!showComparison || selectedIds.size < 2) return false;
    const selected = filteredFunds.filter((f) => selectedIds.has(f.id));
    const currencies = new Set(selected.map((f) => f.currency).filter(Boolean));
    return currencies.size > 1;
  }, [selectedIds, filteredFunds, showComparison]);

  /* ── Handlers ── */
  const handleGroupChange = (v: string) => {
    setGroup(v); setCategory(ALL); setClassification(ALL);
    setSelectedIds(new Set()); setShowComparison(false);
  };
  const handleCategoryChange = (v: string) => {
    setCategory(v); setClassification(ALL);
    setSelectedIds(new Set()); setShowComparison(false);
  };
  const handleClassificationChange = (v: string) => {
    setClassification(v);
    setSelectedIds(new Set()); setShowComparison(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_SELECT) next.add(id);
      return next;
    });
    setShowComparison(false);
  };

  /* ── Stats ── */
  const fundsWithMonthly = useMemo(() => {
    if (!data) return 0;
    return data.categories
      .flatMap((c) => c.funds)
      .filter((f) => f.monthlyReturns && Object.keys(f.monthlyReturns).length > 0).length;
  }, [data]);

  if (!data) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>טוען נתונים...</div>;
  }

  const selectedFunds = filteredFunds.filter((f) => selectedIds.has(f.id));
  const hasFilters = group !== ALL || category !== ALL || classification !== ALL;

  /* ── Styles ── */
  const selectStyle: React.CSSProperties = {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "7px 12px",
    fontSize: 13,
    backgroundColor: "var(--bg-input)",
    color: "var(--text-primary)",
    cursor: "pointer",
    minWidth: 170,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--text-muted)",
    fontWeight: 500,
    marginBottom: 4,
  };
  const navLink: React.CSSProperties = {
    fontSize: 12, color: "var(--text-secondary)", textDecoration: "none",
    padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)",
  };

  return (
    <ClientGate clientKey={clientKey}>
      {/* ── Print styles ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .analysis-grid { grid-template-columns: 1fr 1fr !important; gap: 14px !important; }
          .fund-card-wrap { break-inside: avoid; page-break-inside: avoid; }
          body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @media screen { .print-only { display: none; } }
      `}</style>

      <div style={{ minHeight: "100vh", ...brandCssVars(brand.primaryColor, brand.accentColor) } as React.CSSProperties}>

        {/* ── SCREEN HEADER ── */}
        <div className="no-print">
          <div style={{ height: 4, backgroundColor: brand.primaryColor }} />
          <div style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
            <div style={{ maxWidth: 1600, margin: "0 auto", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <BrandLogo brand={brand} height={28} variant="light" />
                <span style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 600 }}>{brand.mainTitle}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <a href={withClient("/", clientKey)} style={navLink}>דף הבית</a>
                <a href={withClient("/charts", clientKey)} style={navLink}>גרפים</a>
                <span style={{ ...navLink, backgroundColor: brand.primaryColor, color: "#fff", fontWeight: 700, border: "none" }}>ניתוח</span>
                <a href={withClient("/admin", clientKey)} style={navLink}>ניהול</a>
                <button
                  onClick={() => window.print()}
                  style={{ backgroundColor: brand.primaryColor, color: "#fff", fontWeight: 700, padding: "6px 18px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12 }}
                >
                  הדפס / PDF
                </button>
                <ThemeToggle />
              </div>
            </div>
          </div>

          {/* ── Filter bar ── */}
          <div style={{ backgroundColor: "var(--bg-surface-alt)", borderBottom: "1px solid var(--border)", padding: "14px 24px" }}>
            <div style={{ maxWidth: 1600, margin: "0 auto", display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap" }} dir="rtl">
              <div>
                <div style={labelStyle}>קבוצה</div>
                <select value={group} onChange={(e) => handleGroupChange(e.target.value)} style={selectStyle}>
                  <option value={ALL}>{ALL}</option>
                  {filterOptions.groups.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <div style={labelStyle}>קטגוריה</div>
                <select value={category} onChange={(e) => handleCategoryChange(e.target.value)} style={selectStyle}>
                  <option value={ALL}>{ALL}</option>
                  {filterOptions.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={labelStyle}>סיווג</div>
                <select
                  value={classification}
                  onChange={(e) => handleClassificationChange(e.target.value)}
                  style={{ ...selectStyle, opacity: filterOptions.classifications.length === 0 ? 0.5 : 1 }}
                  disabled={filterOptions.classifications.length === 0}
                >
                  <option value={ALL}>{ALL}</option>
                  {filterOptions.classifications.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {/* Currency toggle */}
              <div>
                <div style={labelStyle}>מטבע</div>
                <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
                  {(["all", "ILS", "USD"] as const).map((v) => {
                    const active = currencyFilter === v;
                    return (
                      <button
                        key={v}
                        onClick={() => setCurrencyFilter(v)}
                        style={{
                          padding: "7px 14px", fontSize: 12, fontWeight: active ? 700 : 400,
                          border: "none", cursor: "pointer",
                          backgroundColor: active ? "var(--text-primary)" : "var(--bg-input)",
                          color: active ? "var(--bg-surface)" : "var(--text-secondary)",
                          transition: "all 0.15s",
                        }}
                      >
                        {v === "all" ? "הכל" : v}
                      </button>
                    );
                  })}
                </div>
              </div>
              {(hasFilters || currencyFilter !== "all") && (
                <button
                  onClick={() => { handleGroupChange(ALL); setCurrencyFilter("all"); }}
                  style={{ fontSize: 12, color: "var(--text-muted)", background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 12px", cursor: "pointer" }}
                >
                  נקה סינון
                </button>
              )}
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: "auto" }}>
                {filteredFunds.length} קרנות · {fundsWithMonthly} עם נתונים חודשיים לחישוב drawdown
              </span>
            </div>
          </div>
        </div>

        {/* ── VIEW TOGGLE ── */}
        <div className="no-print" style={{ backgroundColor: "var(--bg-surface-alt)", borderBottom: "1px solid var(--border)", padding: "14px 24px" }}>
          <div style={{ maxWidth: 1600, margin: "0 auto", display: "flex", justifyContent: "center" }}>
            <div style={{ display: "inline-flex", borderRadius: 12, border: `2px solid ${brand.primaryColor}`, overflow: "hidden" }}>
              <span style={{
                display: "inline-block", padding: "10px 32px", fontSize: 14, fontWeight: 700,
                backgroundColor: brand.primaryColor, color: "#fff",
                cursor: "default", userSelect: "none",
              }}>
                תצוגת קרנות
              </span>
              <a href={withClient("/compare", clientKey)} style={{
                display: "inline-block", padding: "10px 32px", fontSize: 14, fontWeight: 600,
                backgroundColor: "transparent", color: brand.primaryColor,
                textDecoration: "none", transition: "background 0.15s",
              }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "color-mix(in srgb, var(--bg-surface) 80%, transparent)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "transparent"; }}
              >
                השוואה בין קרנות
              </a>
            </div>
          </div>
        </div>

        {/* ── PRINT HEADER ── */}
        <div className="print-only" style={{ padding: "16px 24px 10px", borderBottom: "2px solid #1B3A2F", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#1B3A2F" }}>
              {brand.mainTitle} — ניתוח קרנות
            </div>
            <div style={{ fontSize: 11, color: "#666" }}>
              הודפס: {new Date().toLocaleDateString("he-IL")}
            </div>
          </div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div style={{ maxWidth: 1600, margin: "0 auto", padding: "22px 16px 40px" }}>

          {/* Mixed currency warning */}
          {hasMixedCurrencies && (
            <div className="no-print" style={{ marginBottom: 16, padding: "10px 16px", backgroundColor: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 8, fontSize: 13, color: "#92400e" }}>
              ⚠️ השוואה כוללת קרנות במטבעות שונים
            </div>
          )}

          {/* ── TOP FUNDS ── */}
          {filteredFunds.length > 0 && (
            <div style={{ marginBottom: 36 }}>
              <SectionTitle>
                {topFunds.mode === "all"
                  ? `קרנות בקטגוריה (${topFunds.all.length})`
                  : "TOP קרנות — לפי ממוצע שנתי"}
              </SectionTitle>

              {topFunds.mode === "all" ? (
                <CardGrid>
                  {topFunds.all.map((f) => (
                    <div key={f.id} className="fund-card-wrap"><FundCard fund={f} /></div>
                  ))}
                </CardGrid>
              ) : (
                <>
                  <SubTitle>⭐ הטובות ביותר</SubTitle>
                  <CardGrid>
                    {topFunds.best.map((f) => (
                      <div key={f.id} className="fund-card-wrap"><FundCard fund={f} /></div>
                    ))}
                  </CardGrid>
                  <SubTitle style={{ marginTop: 20 }}>⬇️ הגרועות ביותר</SubTitle>
                  <CardGrid>
                    {topFunds.worst.map((f) => (
                      <div key={f.id} className="fund-card-wrap"><FundCard fund={f} /></div>
                    ))}
                  </CardGrid>
                </>
              )}
            </div>
          )}

          {/* ── MANUAL COMPARISON ── */}
          {filteredFunds.length > 0 && (
            <div>
              {/* Pill checkboxes (screen only) */}
              <div className="no-print">
                <SectionTitle>השוואה ידנית</SectionTitle>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12, direction: "rtl" }}>
                  {filteredFunds.map((fund) => {
                    const checked = selectedIds.has(fund.id);
                    const disabled = !checked && selectedIds.size >= MAX_SELECT;
                    return (
                      <label
                        key={fund.id}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "5px 13px", borderRadius: 20,
                          backgroundColor: checked ? brand.primaryColor : "var(--bg-surface)",
                          color: checked ? "#fff" : "var(--text-primary)",
                          border: `1px solid ${checked ? brand.primaryColor : "var(--border)"}`,
                          cursor: disabled ? "not-allowed" : "pointer",
                          fontSize: 12, fontWeight: checked ? 600 : 400,
                          opacity: disabled ? 0.35 : 1,
                          transition: "all 0.12s",
                          userSelect: "none",
                        }}
                      >
                        <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleSelect(fund.id)} style={{ display: "none" }} />
                        {fund.name}
                      </label>
                    );
                  })}
                </div>

                {selectedIds.size >= MAX_SELECT && (
                  <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 10 }}>
                    הגעת למקסימום {MAX_SELECT} קרנות להשוואה
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  <button
                    onClick={() => { if (selectedIds.size >= 2) setShowComparison(true); }}
                    disabled={selectedIds.size < 2}
                    style={{
                      backgroundColor: selectedIds.size >= 2 ? brand.primaryColor : "var(--text-muted)",
                      color: "#fff", fontWeight: 700, padding: "7px 20px", borderRadius: 7,
                      border: "none", cursor: selectedIds.size >= 2 ? "pointer" : "default",
                      fontSize: 13, opacity: selectedIds.size >= 2 ? 1 : 0.45,
                    }}
                  >
                    השווה {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
                  </button>
                  {selectedIds.size > 0 && (
                    <button
                      onClick={() => { setSelectedIds(new Set()); setShowComparison(false); }}
                      style={{ fontSize: 12, color: "var(--text-muted)", background: "none", border: "1px solid var(--border)", borderRadius: 7, padding: "6px 14px", cursor: "pointer" }}
                    >
                      נקה
                    </button>
                  )}
                </div>
              </div>

              {/* Comparison cards (2 per row always) */}
              {showComparison && selectedFunds.length >= 2 && (
                <div>
                  <SectionTitle>תוצאות השוואה ({selectedFunds.length} קרנות)</SectionTitle>
                  <div
                    className="analysis-grid"
                    style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}
                  >
                    {selectedFunds.map((f) => (
                      <div key={f.id} className="fund-card-wrap"><FundCard fund={f} /></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {filteredFunds.length === 0 && (
            <div style={{ padding: "80px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
              בחר קבוצה או קטגוריה כדי לראות ניתוח קרנות
            </div>
          )}
        </div>
      </div>
    </ClientGate>
  );
}

/* ── Small layout helpers ── */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14, direction: "rtl" }}>
      {children}
    </div>
  );
}

function SubTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10, direction: "rtl", ...style }}>
      {children}
    </div>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="analysis-grid"
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 20 }}
    >
      {children}
    </div>
  );
}

/* ================================================================== */
/*  Page export                                                        */
/* ================================================================== */
export default function AnalysisPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#888" }}>טוען...</div>}>
      <AnalysisContent />
    </Suspense>
  );
}
