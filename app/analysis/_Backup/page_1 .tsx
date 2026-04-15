"use client";

import { useEffect, useState, useMemo, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { FundsData, Fund } from "@/lib/types";
import { useBrand } from "@/lib/useBrand";
import { useClientKey, withClient } from "@/lib/useClientKey";
import ClientGate from "@/components/ClientGate";
import { brandCssVars } from "@/lib/colors";

const ALL = "הכל";
const TOP_N = 7;

/* ── Helpers ── */
function calcConsistency(fund: Fund): number | null {
  if (!fund.monthlyReturns) return null;
  const values = Object.values(fund.monthlyReturns);
  if (values.length === 0) return null;
  return Math.round((values.filter((v) => v > 0).length / values.length) * 100);
}

function calcPeriodReturn(fund: Fund, period: string): number | null {
  if (!fund.monthlyReturns) return null;
  const now = new Date();
  const entries = Object.entries(fund.monthlyReturns);
  let filtered: number[] = [];
  if (period === "YTD") {
    filtered = entries.filter(([k]) => k.startsWith(`${now.getFullYear()}`)).map(([, v]) => v);
  } else if (period === "12M") {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 12, 1);
    filtered = entries.filter(([k]) => new Date(k + "-01") >= cutoff).map(([, v]) => v);
  } else if (period === "36M") {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 36, 1);
    filtered = entries.filter(([k]) => new Date(k + "-01") >= cutoff).map(([, v]) => v);
  } else if (period === "60M") {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 60, 1);
    filtered = entries.filter(([k]) => new Date(k + "-01") >= cutoff).map(([, v]) => v);
  }
  if (filtered.length === 0) return null;
  return filtered.reduce((acc, r) => acc * (1 + r / 100), 1) * 100 - 100;
}

function fmt(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(1) + "%";
}

function fmtNum(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(2);
}

function numColor(v: number | null): string {
  if (v === null) return "#9ca3af";
  if (v > 0) return "#1a8a3c";
  if (v < 0) return "#e53e3e";
  return "#1a2e26";
}

function fmtStartDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("he-IL", { month: "short", year: "numeric" });
}

/* ── Segmented Control ── */
const PERIODS = [
  { key: "YTD", label: "מתחילת שנה" },
  { key: "12M", label: "12M" },
  { key: "36M", label: "36M" },
  { key: "60M", label: "60M" },
] as const;

type Period = typeof PERIODS[number]["key"];

function PeriodControl({ value, onChange }: { value: Period; onChange: (v: Period) => void }) {
  return (
    <div style={{ display: "flex", gap: 3, background: "#f1f3f4", borderRadius: 22, padding: 3, flexShrink: 0 }}>
      {PERIODS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{
            padding: "5px 13px", borderRadius: 18, fontSize: 12, border: "none", cursor: "pointer",
            background: value === key ? "#B8975A" : "transparent",
            color: value === key ? "#fff" : "#6b7280",
            fontWeight: value === key ? 600 : 400,
            transition: "all 0.12s", whiteSpace: "nowrap",
          }}
        >{label}</button>
      ))}
    </div>
  );
}

/* ── Rank Badge ── */
function RankBadge({ rank, isBottom }: { rank: number; isBottom: boolean }) {
  if (rank === 1) return (
    <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#B8975A,#d4af6e)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, flexShrink: 0 }}>{rank}</div>
  );
  if (rank === 2) return (
    <div style={{ width: 36, height: 36, borderRadius: 10, background: "#e8eaec", color: "#4a5568", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, flexShrink: 0 }}>{rank}</div>
  );
  if (rank === 3) return (
    <div style={{ width: 36, height: 36, borderRadius: 10, background: "#e8dfd4", color: "#7c6045", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, flexShrink: 0 }}>{rank}</div>
  );
  return (
    <span style={{ fontSize: 13, fontWeight: 500, color: isBottom ? "#ffb3ae" : "#b0bac4", paddingRight: 8, minWidth: 36 }}>{rank}</span>
  );
}

/* ── Analysis Content ── */
function AnalysisContent() {
  const clientKey = useClientKey();
  const brand = useBrand(clientKey);
  const [data, setData] = useState<FundsData | null>(null);
  const [group, setGroup] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [currencyFilter, setCurrencyFilter] = useState<"all" | "ILS" | "USD">("all");
  const [period, setPeriod] = useState<Period>("36M");
  const [sortBy, setSortBy] = useState<"period" | "sharpe" | "stddev" | "consistency">("period");
  const [showAll, setShowAll] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/funds?client=${encodeURIComponent(clientKey)}`)
      .then((r) => r.json())
      .then(setData);
  }, [clientKey]);

  /* ── Filter options ── */
  const filterOptions = useMemo(() => {
    if (!data) return { groups: [] as string[], categories: [] as string[], subCategories: [] as string[] };
    const groupSet = new Set<string>();
    const catSet = new Set<string>();
    const subSet = new Set<string>();
    for (const cat of data.categories) {
      const section = cat.parentSection || "כללי";
      groupSet.add(section);
      if (group === ALL || section === group) {
        catSet.add(cat.name);
        for (const f of cat.funds) {
          if (f.classification) subSet.add(f.classification);
        }
      }
    }
    return { groups: Array.from(groupSet), categories: Array.from(catSet), subCategories: Array.from(subSet) };
  }, [data, group]);

  /* Sub-bar categories for hovered group */
  const subBarCategories = useMemo(() => {
    if (!data) return [] as string[];
    const activeGroup = hoveredGroup || group;
    if (activeGroup === ALL) return [];
    const catSet = new Set<string>();
    for (const cat of data.categories) {
      if ((cat.parentSection || "כללי") === activeGroup) catSet.add(cat.name);
    }
    return Array.from(catSet);
  }, [data, hoveredGroup, group]);

  /* ── Filtered funds ── */
  const filteredFunds = useMemo(() => {
    if (!data) return [] as Fund[];
    const result: Fund[] = [];
    for (const cat of data.categories) {
      const section = cat.parentSection || "כללי";
      if (group !== ALL && section !== group) continue;
      if (category !== ALL && cat.name !== category) continue;
      for (const f of cat.funds) {
        if (f.active === false) continue;
        if (currencyFilter !== "all" && f.currency !== currencyFilter) continue;
        result.push(f);
      }
    }
    return result;
  }, [data, group, category, currencyFilter]);

  /* ── Sorted funds ── */
  const sortedFunds = useMemo(() => {
    const arr = [...filteredFunds];
    arr.sort((a, b) => {
      if (sortBy === "period") return (calcPeriodReturn(b, period) ?? -Infinity) - (calcPeriodReturn(a, period) ?? -Infinity);
      if (sortBy === "sharpe") return (b.sharpe ?? -Infinity) - (a.sharpe ?? -Infinity);
      if (sortBy === "stddev") return (a.stdDev ?? Infinity) - (b.stdDev ?? Infinity);
      return (calcConsistency(b) ?? -Infinity) - (calcConsistency(a) ?? -Infinity);
    });
    return arr;
  }, [filteredFunds, sortBy, period]);

  /* ── Search ── */
  const searchResult = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.trim().toLowerCase();
    const idx = sortedFunds.findIndex((f) => f.name.toLowerCase().includes(q));
    if (idx === -1) return null;
    return { fund: sortedFunds[idx], rank: idx + 1, total: sortedFunds.length };
  }, [searchQuery, sortedFunds]);

  /* Close search on outside click */
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>טוען נתונים...</div>;

  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? period;
  const topRows = sortedFunds.slice(0, TOP_N);
  const bottomRows = sortedFunds.slice(TOP_N);
  const hiddenCount = bottomRows.length;
  const primary = brand.primaryColor || "#1B3A2F";

  const SORT_BTNS = [
    { key: "period" as const, label: `תשואה ${period} ↓` },
    { key: "sharpe" as const, label: "שארפ" },
    { key: "stddev" as const, label: "סטיית תקן" },
    { key: "consistency" as const, label: "עקביות" },
  ];

  const COL = "52px 1fr 110px 72px 72px 72px 100px";

  const renderRow = (fund: Fund, rank: number) => {
    const isTop3 = rank <= 3;
    const isBottom = rank > sortedFunds.length - 5;
    const periodRet = calcPeriodReturn(fund, period);
    const consistency = calcConsistency(fund);
    const ytd = fund.returns?.ytd2026 ?? calcPeriodReturn(fund, "YTD");

    const rowBg = isTop3
      ? rank === 1 ? "#fffdf7" : rank === 2 ? "#fefefe" : "#fefcf9"
      : rank % 2 === 0 ? "#fafafa" : "#fff";

    return (
      <div
        key={fund.id}
        style={{
          display: "grid", gridTemplateColumns: COL,
          alignItems: "center", padding: "13px 24px",
          borderBottom: "0.5px solid #f0f2f4",
          backgroundColor: rowBg,
          transition: "background 0.1s",
          cursor: "default",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f7faf8")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = rowBg)}
      >
        <RankBadge rank={rank} isBottom={isBottom} />
        <div style={{ paddingRight: isTop3 ? 12 : 4 }}>
          <div style={{ fontSize: isTop3 ? 14 : 13, fontWeight: isTop3 ? 700 : 600, color: "#1a2e26", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {fund.name}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
            {[fund.currency].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div style={{ textAlign: "center", fontSize: isTop3 ? 20 : 15, fontWeight: 800, color: numColor(periodRet), fontVariantNumeric: "tabular-nums", letterSpacing: "-0.5px" }}>
          {fmt(periodRet)}
        </div>
        <div style={{ textAlign: "center", fontSize: 13, color: "#1a2e26", fontVariantNumeric: "tabular-nums" }}>{fmtNum(fund.sharpe)}</div>
        <div style={{ textAlign: "center", fontSize: 13, color: "#1a2e26", fontVariantNumeric: "tabular-nums" }}>{consistency !== null ? `${consistency}%` : "—"}</div>
        <div style={{ textAlign: "center", fontSize: 13, color: numColor(ytd), fontVariantNumeric: "tabular-nums", letterSpacing: "-0.2px" }}>{fmt(ytd)}</div>
        <div style={{ textAlign: "center", fontSize: 11, color: "#9ca3af" }}>{fmtStartDate(fund.startDate)}</div>
      </div>
    );
  };

  return (
    <ClientGate clientKey={clientKey}>
      <div style={{ minHeight: "100vh", backgroundColor: "#f8f9fa", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif", ...(brandCssVars(primary, brand.accentColor) as React.CSSProperties) }}>

        {/* ── FILTER BAR ── */}
        <div
          style={{ background: "rgba(255,255,255,0.97)", borderBottom: "0.5px solid #eaecee", padding: "13px 28px", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 10 }}
          onMouseLeave={() => setHoveredGroup(null)}
        >
          {/* שורה 1: קבוצה + מטבע + תקופה */}
          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "nowrap", overflowX: "auto", scrollbarWidth: "none", direction: "rtl" }}>

            {/* קבוצה */}
            {[ALL, ...filterOptions.groups].map((g) => (
              <button key={g}
                onClick={() => { setGroup(g); setCategory(ALL); }}
                onMouseEnter={() => setHoveredGroup(g)}
                style={{
                  padding: "6px 15px", borderRadius: 20, fontSize: 13, border: "none", cursor: "pointer", whiteSpace: "nowrap",
                  background: group === g ? primary : "transparent",
                  color: group === g ? "#fff" : "#4a5568",
                  fontWeight: group === g ? 600 : 400,
                  transition: "all 0.12s",
                }}
              >{g}</button>
            ))}

            <div style={{ width: 0.5, height: 22, background: "#e2e8f0", flexShrink: 0, margin: "0 6px" }} />

            {/* מטבע */}
            {(["all", "ILS", "USD"] as const).map((c) => (
              <button key={c}
                onClick={() => setCurrencyFilter(c)}
                style={{
                  padding: "6px 13px", borderRadius: 20, fontSize: 13, border: "none", cursor: "pointer", whiteSpace: "nowrap",
                  background: currencyFilter === c ? primary : "transparent",
                  color: currencyFilter === c ? "#fff" : "#4a5568",
                  fontWeight: currencyFilter === c ? 600 : 400,
                  transition: "all 0.12s",
                }}
              >{c === "all" ? "הכל" : c}</button>
            ))}

            {/* תקופה — שמאל */}
            <div style={{ marginRight: "auto" }}>
              <PeriodControl value={period} onChange={(v) => { setPeriod(v); setSortBy("period"); }} />
            </div>
          </div>

          {/* שורה 2: קטגוריות — sub bar דינמי */}
          {subBarCategories.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", gap: 5, flexWrap: "wrap", direction: "rtl", borderTop: "0.5px solid #f0f2f4", paddingTop: 8 }}>
              {[ALL, ...subBarCategories].map((cat) => (
                <button key={cat}
                  onClick={() => setCategory(cat)}
                  style={{
                    padding: "3px 11px", borderRadius: 20, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
                    background: category === cat ? "#eef2f0" : "transparent",
                    color: category === cat ? primary : "#555",
                    fontWeight: category === cat ? 600 : 400,
                    border: category === cat ? `0.5px solid ${primary}` : "0.5px solid #ddd",
                    transition: "all 0.12s",
                  }}
                >{cat}</button>
              ))}
            </div>
          )}
        </div>

        {/* ── SORT BAR ── */}
        <div style={{ background: "#fff", borderBottom: "0.5px solid #eaecee", padding: "10px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", direction: "rtl" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {SORT_BTNS.map(({ key, label }) => {
              const active = sortBy === key;
              return (
                <button key={key} onClick={() => setSortBy(key)} style={{
                  padding: "6px 16px", borderRadius: 20, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
                  border: active ? `1.5px solid ${primary}` : "0.5px solid #e8eaec",
                  color: active ? primary : "#6b7280",
                  fontWeight: active ? 700 : 400,
                  background: "#fff", transition: "all 0.12s",
                }}>{label}</button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af" }}>
            {sortedFunds.length} קרנות · מדורג לפי {periodLabel}
          </div>
        </div>

        {/* ── TABLE ── */}
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 28px 100px" }}>
          {sortedFunds.length === 0 ? (
            <div style={{ padding: "80px 20px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>לא נמצאו קרנות</div>
          ) : (
            <div style={{ background: "#fff", border: "0.5px solid #e8ecee", borderRadius: 16, overflow: "hidden" }}>

              {/* Header */}
              <div style={{ display: "grid", gridTemplateColumns: COL, padding: "11px 24px", background: "#fafbfc", borderBottom: "0.5px solid #eaecee", direction: "rtl" }}>
                {["#", "קרן", `תשואה ${period}`, "שארפ", "עקביות", "YTD", "הוקמה"].map((h, i) => (
                  <span key={i} style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", textAlign: i >= 2 ? "center" : "right" }}>{h}</span>
                ))}
              </div>

              {/* Top rows */}
              {topRows.map((fund, i) => renderRow(fund, i + 1))}

              {/* הראה רשימה מלאה */}
              {!showAll && hiddenCount > 0 && (
                <div
                  onClick={() => setShowAll(true)}
                  style={{ borderTop: "0.5px solid #eaecee", borderBottom: "0.5px solid #eaecee", background: "#fafbfc", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", direction: "rtl", transition: "background 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f2f7f4")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fafbfc")}
                >
                  <span style={{ fontSize: 13, color: primary, fontWeight: 600 }}>הראה רשימה מלאה</span>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>{hiddenCount} קרנות נוספות</span>
                  <span style={{ fontSize: 14, color: "#B8975A" }}>↓</span>
                </div>
              )}

              {/* Bottom rows */}
              {showAll && bottomRows.map((fund, i) => renderRow(fund, TOP_N + i + 1))}

              {/* הסתר */}
              {showAll && hiddenCount > 0 && (
                <div
                  onClick={() => setShowAll(false)}
                  style={{ borderTop: "0.5px solid #eaecee", background: "#fafbfc", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", direction: "rtl" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f2f7f4")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fafbfc")}
                >
                  <span style={{ fontSize: 13, color: "#6b7280" }}>הסתר</span>
                  <span style={{ fontSize: 14, color: "#9ca3af" }}>↑</span>
                </div>
              )}

            </div>
          )}
        </div>

        {/* ── SEARCH BUBBLE ── */}
        <div ref={searchRef} style={{ position: "fixed", bottom: 28, left: 28, zIndex: 200 }}>

          {/* Popup */}
          {searchOpen && (
            <div style={{ position: "absolute", bottom: 60, left: 0, background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.15)", width: 290, border: "0.5px solid #e8ecee", direction: "rtl", marginBottom: 8 }}>
              <input
                autoFocus
                type="text"
                placeholder="חיפוש קרן..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box", direction: "rtl" }}
              />
              {searchQuery && !searchResult && (
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 10, textAlign: "center" }}>לא נמצאה קרן</div>
              )}
              {searchResult && (
                <div style={{ marginTop: 12, border: "1.5px solid #C9A96E", borderRadius: 12, padding: "14px", background: "#fffdf9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2e26" }}>{searchResult.fund.name}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{searchResult.fund.currency}</div>
                    </div>
                    <div style={{ background: primary, color: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                      #{searchResult.rank} מתוך {searchResult.total}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
                    {[
                      { label: period, value: fmt(calcPeriodReturn(searchResult.fund, period)) },
                      { label: "שארפ", value: fmtNum(searchResult.fund.sharpe) },
                      { label: "עקביות", value: calcConsistency(searchResult.fund) !== null ? `${calcConsistency(searchResult.fund)}%` : "—" },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div style={{ fontSize: 10, color: "#9ca3af" }}>{label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#1a2e26" }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bubble button */}
          <button
            onClick={() => { setSearchOpen((v) => !v); if (searchOpen) setSearchQuery(""); }}
            style={{ width: 50, height: 50, borderRadius: "50%", background: "#1a2e26", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", boxShadow: "0 2px 12px rgba(0,0,0,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}
          >🔍</button>
        </div>

      </div>
    </ClientGate>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#888" }}>טוען...</div>}>
      <AnalysisContent />
    </Suspense>
  );
}
