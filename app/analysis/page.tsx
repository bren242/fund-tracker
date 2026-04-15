"use client";

import { useEffect, useState, useMemo, useRef, Suspense } from "react";
import { FundsData, Fund } from "@/lib/types";
import { useBrand } from "@/lib/useBrand";
import { useClientKey } from "@/lib/useClientKey";
import ClientGate from "@/components/ClientGate";
import { brandCssVars } from "@/lib/colors";

const ALL = "הכל";
const TOP_N = 5;
const BOTTOM_N = 3;

/* ── Types ── */
type SortKey = "MTD" | "YTD" | "12M" | "36M" | "60M" | "avg" | "sharpe";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "MTD",    label: "MTD" },
  { key: "YTD",    label: "YTD" },
  { key: "12M",    label: "12M" },
  { key: "36M",    label: "36M" },
  { key: "60M",    label: "60M" },
  { key: "avg",    label: "ממוצע שנתי" },
  { key: "sharpe", label: "שארפ" },
];

/* ── Helpers ── */
function calcPeriodReturn(fund: Fund, key: SortKey): number | null {
  if (key === "sharpe") return fund.sharpe ?? null;
  if (key === "avg")    return fund.avgAnnualReturn ?? null;
  if (!fund.monthlyReturns) return null;

  const now = new Date();
  const entries = Object.entries(fund.monthlyReturns);

  let filtered: number[] = [];
  if (key === "MTD") {
    const sorted = [...entries].sort(([a], [b]) => a.localeCompare(b));
    const last = sorted.at(-1);
    filtered = last ? [last[1]] : [];
  } else if (key === "YTD") {
    filtered = entries.filter(([k]) => k.startsWith(`${now.getFullYear()}`)).map(([, v]) => v);
  } else {
    const months = key === "12M" ? 12 : key === "36M" ? 36 : 60;
    const cutoff = new Date(now.getFullYear(), now.getMonth() - months, 1);
    filtered = entries.filter(([k]) => new Date(k + "-01") >= cutoff).map(([, v]) => v);
  }

  if (filtered.length === 0) return null;
  if (key === "MTD") return filtered[0] * 100;
  return (filtered.reduce((acc, r) => acc * (1 + r), 1) - 1) * 100;
}

function calcConsistency(fund: Fund): number | null {
  if (!fund.monthlyReturns) return null;
  const vals = Object.values(fund.monthlyReturns);
  if (!vals.length) return null;
  return Math.round((vals.filter((v) => v > 0).length / vals.length) * 100);
}

function getSparklineData(fund: Fund, sortKey: SortKey): number[] {
  if (!fund.monthlyReturns) return [];
  const now = new Date();
  const entries = Object.entries(fund.monthlyReturns).sort(([a], [b]) => a.localeCompare(b));
  let filtered = entries;
  if (sortKey === "MTD" || sortKey === "YTD") {
    filtered = entries.slice(-12);
  } else if (sortKey === "12M") {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 12, 1);
    filtered = entries.filter(([k]) => new Date(k + "-01") >= cutoff);
  } else if (sortKey === "36M") {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 36, 1);
    filtered = entries.filter(([k]) => new Date(k + "-01") >= cutoff);
  } else if (sortKey === "60M") {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 60, 1);
    filtered = entries.filter(([k]) => new Date(k + "-01") >= cutoff);
  } else {
    filtered = entries;
  }
  // cumulative
  let cum = 1;
  return filtered.map(([, v]) => { cum = cum * (1 + v); return (cum - 1) * 100; });
}

function fmt(v: number | null, dec = 1): string {
  if (v === null || v === undefined) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(dec) + "%";
}

function fmtNum(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(2);
}

function numColor(v: number | null): string {
  if (v === null) return "#9ca3af";
  if (v > 0) return "#1a8a3c";
  if (v < 0) return "#e53e3e";
  return "#6b7280";
}

function fmtKey(k: string): string {
  const [y, m] = k.split("-");
  return `${m}/${y}`;
}

function getLatestReportMonth(funds: Fund[]): string | null {
  let latest: string | null = null;
  for (const f of funds) {
    if (!f.monthlyReturns) continue;
    const keys = Object.keys(f.monthlyReturns).filter(k => /^\d{4}-\d{2}$/.test(k)).sort();
    const last = keys.at(-1);
    if (last && (!latest || last > latest)) latest = last;
  }
  return latest;
}

function fmtStartDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("he-IL", { month: "short", year: "numeric" });
}

/* ── Sparkline ── */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center", color: "#d1d5db", fontSize: 11 }}>אין מספיק נתונים</div>;

  const w = 260, h = 48, pad = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = pad + ((max - v) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(" ");

  const zeroY = pad + ((max - 0) / range) * (h - pad * 2);
  const clampedZero = Math.max(pad, Math.min(h - pad, zeroY));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ display: "block" }}>
      <line x1={pad} y1={clampedZero} x2={w - pad} y2={clampedZero} stroke="#e8ecee" strokeWidth="0.5" strokeDasharray="3,3" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={points.split(" ").at(-1)!.split(",")[0]} cy={points.split(" ").at(-1)!.split(",")[1]} r="2.5" fill={color} />
    </svg>
  );
}

/* ── Rank Badge ── */
function RankBadge({ rank, isBottom }: { rank: number; isBottom: boolean }) {
  if (rank === 1) return <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#B8975A,#d4af6e)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, flexShrink: 0 }}>{rank}</div>;
  if (rank === 2) return <div style={{ width: 32, height: 32, borderRadius: 8, background: "#e8eaec", color: "#4a5568", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, flexShrink: 0 }}>{rank}</div>;
  if (rank === 3) return <div style={{ width: 32, height: 32, borderRadius: 8, background: "#e8dfd4", color: "#7c6045", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, flexShrink: 0 }}>{rank}</div>;
  return <span style={{ fontSize: 13, fontWeight: 600, color: isBottom ? "#ffb3ae" : "#9ca3af", minWidth: 32, textAlign: "center", display: "inline-block" }}>{rank}</span>;
}

/* ── Accordion Row ── */
function FundRow({ fund, rank, sortKey, primary, isBottom }: {
  fund: Fund; rank: number; sortKey: SortKey; primary: string; isBottom: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isTop3 = rank <= 3;
  const periodVal = calcPeriodReturn(fund, sortKey);
  const consistency = calcConsistency(fund);
  const sparkData = useMemo(() => getSparklineData(fund, sortKey), [fund, sortKey]);

  const rowBg = isTop3
    ? rank === 1 ? "#fffdf7" : rank === 2 ? "#fefefe" : "#fefcf9"
    : rank % 2 === 0 ? "#fafafa" : "#fff";

  const COL = "44px 1fr 130px 72px 72px";

  return (
    <div>
      {/* Main row */}
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "grid", gridTemplateColumns: COL,
          alignItems: "center", padding: "13px 24px",
          borderBottom: open ? "none" : "0.5px solid #f0f2f4",
          backgroundColor: open ? "#f7faf8" : rowBg,
          cursor: "pointer", transition: "background 0.1s", direction: "rtl",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.backgroundColor = "#f7faf8"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.backgroundColor = rowBg; }}
      >
        <RankBadge rank={rank} isBottom={isBottom} />

        <div style={{ paddingRight: isTop3 ? 10 : 4 }}>
          <div style={{ fontSize: isTop3 ? 14 : 13, fontWeight: isTop3 ? 700 : 600, color: "#1a2e26", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {fund.name}
          </div>
          <div style={{ fontSize: 11, color: "#b0bac4", marginTop: 3 }}>
            {fund.currency}{fund.startDate ? ` · הוקם ${fmtStartDate(fund.startDate)}` : ""}
          </div>
        </div>

        <div style={{ textAlign: "center", fontSize: isTop3 ? 26 : 20, fontWeight: 800, color: numColor(periodVal), fontVariantNumeric: "tabular-nums", letterSpacing: "-0.3px" }}>
          {sortKey === "sharpe" ? fmtNum(periodVal) : fmt(periodVal)}
        </div>

        <div style={{ textAlign: "center", fontSize: 13, color: "#1a2e26", fontVariantNumeric: "tabular-nums" }}>{fmtNum(fund.sharpe)}</div>
        <div style={{ textAlign: "center", fontSize: 13, color: "#1a2e26", fontVariantNumeric: "tabular-nums" }}>{consistency !== null ? `${consistency}%` : "—"}</div>
      </div>

      {/* Accordion */}
      {open && (
        <div style={{ background: "#f9fbfa", borderBottom: "0.5px solid #e8ecee", padding: "16px 24px 20px", direction: "rtl" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 24, alignItems: "start" }}>

            {/* מדדים */}
            <div>
              <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 12 }}>נתונים מורחבים</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {[
                  { label: "MTD", value: fmt(calcPeriodReturn(fund, "MTD")) },
                  { label: "YTD", value: fmt(calcPeriodReturn(fund, "YTD")) },
                  { label: "12M", value: fmt(calcPeriodReturn(fund, "12M")) },
                  { label: "36M", value: fmt(calcPeriodReturn(fund, "36M")) },
                  { label: "60M", value: fmt(calcPeriodReturn(fund, "60M")) },
                  { label: "ממוצע שנתי", value: fmt(fund.avgAnnualReturn ?? null) },
                  { label: "שארפ", value: fmtNum(fund.sharpe) },
                  { label: "סטיית תקן", value: fmtNum(fund.stdDev) },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: "#fff", borderRadius: 10, padding: "10px 14px", border: "0.5px solid #e8ecee" }}>
                    <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 500, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2e26", fontVariantNumeric: "tabular-nums" }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sparkline */}
            <div>
              <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 12 }}>תשואה מצטברת</div>
              <div style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", border: "0.5px solid #e8ecee" }}>
                <Sparkline data={sparkData} color={primary} />
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main ── */
function AnalysisContent() {
  const clientKey = useClientKey();
  const brand = useBrand(clientKey);
  const [data, setData] = useState<FundsData | null>(null);
  const [group, setGroup] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [currencyFilter, setCurrencyFilter] = useState<"all" | "ILS" | "USD">("all");
  const [sortKey, setSortKey] = useState<SortKey>("36M");
  const [showAll, setShowAll] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/funds?client=${encodeURIComponent(clientKey)}`).then((r) => r.json()).then(setData);
  }, [clientKey]);

  const filterOptions = useMemo(() => {
    if (!data) return { groups: [] as string[], categories: [] as string[] };
    const groupSet = new Set<string>();
    const catSet = new Set<string>();
    for (const cat of data.categories) {
      const section = cat.parentSection || "כללי";
      groupSet.add(section);
      if (group === ALL || section === group) catSet.add(cat.name);
    }
    return { groups: Array.from(groupSet), categories: Array.from(catSet) };
  }, [data, group]);

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
    const latestMonth = getLatestReportMonth(result);
    if (sortKey === "MTD" && latestMonth) {
      return result.filter(f => {
        const keys = Object.keys(f.monthlyReturns ?? {}).filter(k => /^\d{4}-\d{2}$/.test(k)).sort();
        return keys.at(-1) === latestMonth;
      });
    }
    return result;
  }, [data, group, category, currencyFilter, sortKey]);

  const sortedFunds = useMemo(() => {
    return [...filteredFunds].sort((a, b) => {
      if (sortKey === "sharpe") return (b.sharpe ?? -Infinity) - (a.sharpe ?? -Infinity);
      if (sortKey === "avg") return (b.avgAnnualReturn ?? -Infinity) - (a.avgAnnualReturn ?? -Infinity);
      return (calcPeriodReturn(b, sortKey) ?? -Infinity) - (calcPeriodReturn(a, sortKey) ?? -Infinity);
    });
  }, [filteredFunds, sortKey]);

  const searchResult = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.trim().toLowerCase();
    const idx = sortedFunds.findIndex((f) => f.name.toLowerCase().includes(q));
    if (idx === -1) return null;
    return { fund: sortedFunds[idx], rank: idx + 1, total: sortedFunds.length };
  }, [searchQuery, sortedFunds]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false); setSearchQuery("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>טוען נתונים...</div>;

  const primary = brand.primaryColor || "#1B3A2F";
  const topRows = sortedFunds.slice(0, TOP_N);
  const middleRows = sortedFunds.slice(TOP_N, sortedFunds.length - BOTTOM_N);
  const bottomRows = sortedFunds.slice(-BOTTOM_N);
  const hiddenCount = middleRows.length;
  const COL = "44px 1fr 130px 72px 72px";

  return (
    <ClientGate clientKey={clientKey}>
      <div style={{ minHeight: "100vh", backgroundColor: "#f8f9fa", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif", ...(brandCssVars(primary, brand.accentColor) as React.CSSProperties) }}>

        {/* FILTER BAR */}
        <div
          style={{ background: "rgba(255,255,255,0.97)", borderBottom: "0.5px solid #eaecee", padding: "13px 28px", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 10 }}
          onMouseLeave={() => setHoveredGroup(null)}
        >
          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "nowrap", overflowX: "auto", scrollbarWidth: "none", direction: "rtl" }}>
            {[ALL, ...filterOptions.groups].map((g) => (
              <button key={g}
                onClick={() => { setGroup(g); setCategory(ALL); setShowAll(false); }}
                onMouseEnter={() => setHoveredGroup(g)}
                style={{ padding: "6px 15px", borderRadius: 20, fontSize: 13, border: "none", cursor: "pointer", whiteSpace: "nowrap", background: group === g ? primary : "transparent", color: group === g ? "#fff" : "#4a5568", fontWeight: group === g ? 600 : 400, transition: "all 0.12s" }}
              >{g}</button>
            ))}
            <div style={{ width: 0.5, height: 22, background: "#e2e8f0", flexShrink: 0, margin: "0 6px" }} />
            {(["all", "ILS", "USD"] as const).map((c) => (
              <button key={c}
                onClick={() => setCurrencyFilter(c)}
                style={{ padding: "6px 13px", borderRadius: 20, fontSize: 13, border: "none", cursor: "pointer", whiteSpace: "nowrap", background: currencyFilter === c ? primary : "transparent", color: currencyFilter === c ? "#fff" : "#4a5568", fontWeight: currencyFilter === c ? 600 : 400, transition: "all 0.12s" }}
              >{c === "all" ? "הכל" : c}</button>
            ))}
          </div>

          {subBarCategories.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", gap: 5, flexWrap: "wrap", direction: "rtl", borderTop: "0.5px solid #f0f2f4", paddingTop: 8 }}>
              {[ALL, ...subBarCategories].map((cat) => (
                <button key={cat}
                  onClick={() => setCategory(cat)}
                  style={{ padding: "3px 11px", borderRadius: 20, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", background: category === cat ? "#eef2f0" : "transparent", color: category === cat ? primary : "#555", fontWeight: category === cat ? 600 : 400, border: category === cat ? `0.5px solid ${primary}` : "0.5px solid #ddd", transition: "all 0.12s" }}
                >{cat}</button>
              ))}
            </div>
          )}
        </div>

        {/* SORT BAR */}
        <div style={{ background: "#fff", borderBottom: "0.5px solid #eaecee", padding: "10px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", direction: "rtl" }}>
          <div style={{ display: "flex", gap: 5, flexWrap: "nowrap", overflowX: "auto", scrollbarWidth: "none" }}>
            {SORT_OPTIONS.map(({ key, label }) => {
              const active = sortKey === key;
              return (
                <button key={key} onClick={() => { setSortKey(key); setShowAll(false); }} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", border: active ? `1.5px solid ${primary}` : "0.5px solid #e8eaec", color: active ? primary : "#6b7280", fontWeight: active ? 700 : 400, background: "#fff", transition: "all 0.12s" }}>
                  {label}{active ? " ↓" : ""}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0, marginRight: 12 }}>
            {sortedFunds.length} קרנות
          </div>
        </div>

        {/* TABLE */}
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 28px 100px" }}>
          {sortedFunds.length === 0 ? (
            <div style={{ padding: "80px 20px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>לא נמצאו קרנות</div>
          ) : (
            <div style={{ background: "#fff", border: "0.5px solid #e8ecee", borderRadius: 16, overflow: "hidden" }}>

              {/* Header */}
              <div style={{ display: "grid", gridTemplateColumns: COL, padding: "11px 24px", background: "#fafbfc", borderBottom: "0.5px solid #eaecee", direction: "rtl" }}>
                {(() => {
                  const latestMonth = getLatestReportMonth(filteredFunds);
                  const sortLabel = sortKey === "MTD" && latestMonth
                    ? fmtKey(latestMonth)
                    : SORT_OPTIONS.find(s => s.key === sortKey)?.label ?? sortKey;
                  const headers: { label: string; title?: string }[] = [
                    { label: "#" },
                    { label: "קרן" },
                    { label: sortLabel, title: "תשואה מצטברת לתקופה הנבחרת" },
                    { label: "שארפ",   title: "יחס שארפ: תשואה עודפת לעומת סיכון. ככל שגבוה יותר — טוב יותר" },
                    { label: "עקביות", title: "אחוז החודשים שבהם הקרן סיימה בתשואה חיובית" },
                  ];
                  return headers;
                })().map(({ label, title }, i) => (
                  <span key={i} title={title} style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, letterSpacing: "0.8px", textAlign: i >= 2 ? "center" : "right", cursor: title ? "help" : "default" }}>{label}</span>
                ))}
              </div>

              {/* TOP 5 */}
              {topRows.map((fund, i) => (
                <FundRow key={fund.id} fund={fund} rank={i + 1} sortKey={sortKey} primary={primary} isBottom={false} />
              ))}

              {/* הראה רשימה מלאה */}
              {hiddenCount > 0 && !showAll && (
                <div
                  onClick={() => setShowAll(true)}
                  style={{ borderTop: "0.5px solid #eaecee", borderBottom: "0.5px solid #eaecee", background: "#fafbfc", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", direction: "rtl" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f2f7f4")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fafbfc")}
                >
                  <span style={{ fontSize: 13, color: primary, fontWeight: 600 }}>הראה רשימה מלאה</span>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>{hiddenCount} קרנות</span>
                  <span style={{ fontSize: 14, color: "#B8975A" }}>↓</span>
                </div>
              )}

              {/* Middle rows — כשפתוח */}
              {showAll && middleRows.map((fund, i) => (
                <FundRow key={fund.id} fund={fund} rank={TOP_N + i + 1} sortKey={sortKey} primary={primary} isBottom={false} />
              ))}

              {/* הסתר */}
              {showAll && hiddenCount > 0 && (
                <div
                  onClick={() => setShowAll(false)}
                  style={{ borderTop: "0.5px solid #eaecee", borderBottom: "0.5px solid #eaecee", background: "#fafbfc", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", direction: "rtl" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f2f7f4")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fafbfc")}
                >
                  <span style={{ fontSize: 13, color: "#6b7280" }}>הסתר</span>
                  <span style={{ fontSize: 14, color: "#9ca3af" }}>↑</span>
                </div>
              )}

              {/* BOTTOM 3 — תמיד */}
              {bottomRows.length > 0 && (
                <>
                  <div style={{ borderTop: "1px dashed #e8ecee", background: "#fdfcfb", padding: "8px 24px", textAlign: "center", fontSize: 11, color: "#b0bac4", userSelect: "none", direction: "rtl" }}>
                    · · · · ·
                  </div>
                  {bottomRows.map((fund, i) => (
                    <FundRow key={fund.id} fund={fund} rank={sortedFunds.length - BOTTOM_N + i + 1} sortKey={sortKey} primary={primary} isBottom={true} />
                  ))}
                </>
              )}

            </div>
          )}
        </div>

        {/* SEARCH BUBBLE */}
        <div ref={searchRef} style={{ position: "fixed", bottom: 28, left: 28, zIndex: 200 }}>
          {searchOpen && (
            <div style={{ position: "absolute", bottom: 60, left: 0, background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.15)", width: 290, border: "0.5px solid #e8ecee", direction: "rtl", marginBottom: 8 }}>
              <input
                autoFocus type="text" placeholder="חיפוש קרן..."
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box", direction: "rtl" }}
              />
              {searchQuery && !searchResult && (
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 10, textAlign: "center" }}>לא נמצאה קרן</div>
              )}
              {searchResult && (
                <div style={{ marginTop: 12, border: "1.5px solid #C9A96E", borderRadius: 12, padding: 14, background: "#fffdf9" }}>
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
                      { label: SORT_OPTIONS.find(s => s.key === sortKey)?.label ?? sortKey, value: sortKey === "sharpe" ? fmtNum(searchResult.fund.sharpe) : fmt(calcPeriodReturn(searchResult.fund, sortKey)) },
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
