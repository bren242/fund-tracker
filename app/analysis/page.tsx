"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import { FundsData, Fund } from "@/lib/types";
import { useBrand } from "@/lib/useBrand";
import { useClientKey, withClient } from "@/lib/useClientKey";
import ClientGate from "@/components/ClientGate";
import { brandCssVars } from "@/lib/colors";

const ALL = "הכל";
const MAX_SELECT = 6;
const TOP_N = 7;

/* ── Helpers ── */
function calcConsistency(fund: Fund): number | null {
  if (!fund.monthlyReturns) return null;
  const values = Object.values(fund.monthlyReturns);
  if (values.length === 0) return null;
  const positive = values.filter((v) => v > 0).length;
  return Math.round((positive / values.length) * 100);
}

function calcPeriodReturn(fund: Fund, period: string): number | null {
  if (!fund.monthlyReturns) return null;
  const now = new Date();
  const entries = Object.entries(fund.monthlyReturns);
  let filtered: number[] = [];
  if (period === "YTD") {
    filtered = entries
      .filter(([k]) => k.startsWith(`${now.getFullYear()}`))
      .map(([, v]) => v);
  } else if (period === "24M") {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 24, 1);
    filtered = entries
      .filter(([k]) => new Date(k + "-01") >= cutoff)
      .map(([, v]) => v);
  } else if (period === "36M") {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 36, 1);
    filtered = entries
      .filter(([k]) => new Date(k + "-01") >= cutoff)
      .map(([, v]) => v);
  } else if (period === "60M") {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 60, 1);
    filtered = entries
      .filter(([k]) => new Date(k + "-01") >= cutoff)
      .map(([, v]) => v);
  } else if (period === "inception") {
    filtered = entries.map(([, v]) => v);
  }
  if (filtered.length === 0) return null;
  return filtered.reduce((acc, r) => acc * (1 + r / 100), 1) * 100 - 100;
}

function fmt(v: number | null, decimals = 1): string {
  if (v === null || v === undefined) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(decimals) + "%";
}

function fmtNum(v: number | null, decimals = 2): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(decimals);
}

function numColor(v: number | null): string {
  if (v === null) return "#9ca3af";
  if (v > 0) return "#1a8a3c";
  if (v < 0) return "#e53e3e";
  return "#1a2e26";
}

/* ================================================================== */
/*  PillGroup                                                          */
/* ================================================================== */
function PillGroup({
  label,
  options,
  labels,
  value,
  onChange,
  activeColor,
}: {
  label: string;
  options: string[];
  labels?: Record<string, string>;
  value: string;
  onChange: (v: string) => void;
  activeColor: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "#9ca3af",
          fontWeight: 500,
          marginBottom: 5,
          direction: "rtl",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "nowrap", overflowX: "auto" }}>
        {options.map((opt) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              style={{
                padding: "4px 12px",
                borderRadius: 20,
                fontSize: 12,
                border: "none",
                backgroundColor: active ? activeColor : "#f1f3f5",
                color: active ? "#fff" : "#4b5563",
                fontWeight: active ? 600 : 400,
                cursor: "pointer",
                transition: "all 0.12s",
                whiteSpace: "nowrap",
              }}
            >
              {labels?.[opt] ?? opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Analysis Content                                                   */
/* ================================================================== */
function AnalysisContent() {
  const clientKey = useClientKey();
  const brand = useBrand(clientKey);
  const router = useRouter();
  const [data, setData] = useState<FundsData | null>(null);

  /* Filters */
  const [group, setGroup] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [currencyFilter, setCurrencyFilter] = useState<"all" | "ILS" | "USD">("all");
  const [period, setPeriod] = useState<"YTD" | "24M" | "36M" | "60M" | "inception">("36M");
  const [sortBy, setSortBy] = useState<"avg" | "sharpe" | "stddev" | "consistency">("avg");

  /* Search */
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  /* Selection */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/funds?client=${encodeURIComponent(clientKey)}`)
      .then((r) => r.json())
      .then(setData);
  }, [clientKey]);

  /* ── Cascading filter options ── */
  const filterOptions = useMemo(() => {
    if (!data) return { groups: [] as string[], categories: [] as string[] };
    const groupSet = new Set<string>();
    const catSet = new Set<string>();
    for (const cat of data.categories) {
      const section = cat.parentSection || "כללי";
      groupSet.add(section);
      if (group === ALL || section === group) {
        catSet.add(cat.name);
      }
    }
    return {
      groups: Array.from(groupSet),
      categories: Array.from(catSet),
    };
  }, [data, group]);

  /* ── Funds matching current filters ── */
  const filteredFunds = useMemo(() => {
    if (!data) return [] as Fund[];
    const result: Fund[] = [];
    for (const cat of data.categories) {
      const section = cat.parentSection || "כללי";
      if (group !== ALL && section !== group) continue;
      if (category !== ALL && cat.name !== category) continue;
      for (const f of cat.funds) {
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
      if (sortBy === "avg") {
        return (b.avgAnnualReturn ?? -Infinity) - (a.avgAnnualReturn ?? -Infinity);
      } else if (sortBy === "sharpe") {
        return (b.sharpe ?? -Infinity) - (a.sharpe ?? -Infinity);
      } else if (sortBy === "stddev") {
        return (a.stdDev ?? Infinity) - (b.stdDev ?? Infinity);
      } else {
        return (calcConsistency(b) ?? -Infinity) - (calcConsistency(a) ?? -Infinity);
      }
    });
    return arr;
  }, [filteredFunds, sortBy]);

  /* ── Search result ── */
  const searchResult = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.trim().toLowerCase();
    const idx = sortedFunds.findIndex((f) => f.name.toLowerCase().includes(q));
    if (idx === -1) return null;
    return { fund: sortedFunds[idx], rank: idx + 1, total: sortedFunds.length };
  }, [searchQuery, sortedFunds]);

  /* ── Mixed currency warning ── */
  const hasMixedCurrencies = useMemo(() => {
    if (selectedIds.size < 2) return false;
    const selected = filteredFunds.filter((f) => selectedIds.has(f.id));
    const currencies = new Set(selected.map((f) => f.currency).filter(Boolean));
    return currencies.size > 1;
  }, [selectedIds, filteredFunds]);

  /* ── Handlers ── */
  const handleGroupChange = (v: string) => {
    setGroup(v);
    setCategory(ALL);
    setSelectedIds(new Set());
  };
  const handleCategoryChange = (v: string) => {
    setCategory(v);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_SELECT) next.add(id);
      return next;
    });
  };

  const handleCompare = () => {
    const ids = Array.from(selectedIds).join(",");
    router.push(withClient(`/compare?funds=${ids}`, clientKey));
  };

  if (!data) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
        טוען נתונים...
      </div>
    );
  }

  const selectedFunds = filteredFunds.filter((f) => selectedIds.has(f.id));
  const showSeparator = sortedFunds.length > TOP_N + 3;
  const topRows = showSeparator ? sortedFunds.slice(0, TOP_N) : sortedFunds;
  const bottomRows = showSeparator ? sortedFunds.slice(TOP_N) : [];

  const periodLabels: { key: typeof period; label: string }[] = [
    { key: "YTD", label: "YTD" },
    { key: "24M", label: "24M" },
    { key: "36M", label: "36M" },
    { key: "60M", label: "60M" },
    { key: "inception", label: "מאז הקמה" },
  ];

  const sortLabels: { key: typeof sortBy; label: string }[] = [
    { key: "avg", label: "ממוצע שנתי" },
    { key: "sharpe", label: "שארפ" },
    { key: "stddev", label: "סטיית תקן" },
    { key: "consistency", label: "עקביות" },
  ];

  const colTemplate = "20px 36px 1fr 108px 68px 68px 68px";
  const activePeriodLabel =
    periodLabels.find((p) => p.key === period)?.label ?? period;

  /* ── Row renderer ── */
  const renderRow = (fund: Fund, rank: number, isBottom = false) => {
    const checked = selectedIds.has(fund.id);
    const disabled = !checked && selectedIds.size >= MAX_SELECT;
    const consistency = calcConsistency(fund);
    const periodRet = calcPeriodReturn(fund, period);
    const ytd = fund.returns?.ytd2026 ?? null;

    return (
      <div
        key={fund.id}
        onClick={() => !disabled && toggleSelect(fund.id)}
        style={{
          display: "grid",
          gridTemplateColumns: colTemplate,
          alignItems: "center",
          padding: "13px 20px",
          cursor: disabled ? "not-allowed" : "pointer",
          backgroundColor: checked ? "#f2f7f4" : "transparent",
          borderBottom: "0.5px solid #f0f2f4",
          transition: "background 0.1s",
          direction: "rtl",
          opacity: disabled ? 0.5 : 1,
        }}
        onMouseEnter={(e) => {
          if (!checked)
            (e.currentTarget as HTMLDivElement).style.backgroundColor = "#f7faf8";
        }}
        onMouseLeave={(e) => {
          if (!checked)
            (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent";
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={() => !disabled && toggleSelect(fund.id)}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 14,
            height: 14,
            accentColor: "#1B3A2F",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        />
        <span
          style={{
            fontSize: 11,
            color: isBottom ? "#ffb3ae" : "#9ca3af",
            fontWeight: 500,
            textAlign: "center",
          }}
        >
          {rank}
        </span>
        <span
          style={{
            fontSize: 13,
            color: "#1a2e26",
            fontWeight: 500,
            paddingRight: 8,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {fund.name}
        </span>
        <span
          style={{
            fontSize: 13,
            color: numColor(periodRet),
            fontWeight: 600,
            textAlign: "center",
            letterSpacing: "-0.2px",
          }}
        >
          {fmt(periodRet)}
        </span>
        <span
          style={{
            fontSize: 13,
            color: fund.sharpe !== null ? "#1a2e26" : "#d1d5db",
            textAlign: "center",
          }}
        >
          {fmtNum(fund.sharpe)}
        </span>
        <span
          style={{
            fontSize: 13,
            color: consistency !== null ? "#1a2e26" : "#d1d5db",
            textAlign: "center",
          }}
        >
          {consistency !== null ? `${consistency}%` : "—"}
        </span>
        <span
          style={{
            fontSize: 13,
            color: numColor(ytd),
            textAlign: "center",
            letterSpacing: "-0.2px",
          }}
        >
          {fmt(ytd)}
        </span>
      </div>
    );
  };

  return (
    <ClientGate clientKey={clientKey}>
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "#f8f9fa",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
          ...(brandCssVars(brand.primaryColor, brand.accentColor) as React.CSSProperties),
        }}
      >
        {/* ── FILTER BAR ── */}
        <div
          style={{
            background: "rgba(255,255,255,0.92)",
            borderBottom: "0.5px solid #eaecee",
            padding: "16px 32px",
            backdropFilter: "blur(8px)",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <div
            style={{
              maxWidth: 1400,
              margin: "0 auto",
              display: "flex",
              gap: 28,
              alignItems: "flex-start",
              flexWrap: "wrap",
              direction: "rtl",
            }}
          >
            <PillGroup
              label="קבוצה"
              options={[ALL, ...filterOptions.groups]}
              value={group}
              onChange={handleGroupChange}
              activeColor="#1B3A2F"
            />
            <PillGroup
              label="קטגוריה"
              options={[ALL, ...filterOptions.categories]}
              value={category}
              onChange={handleCategoryChange}
              activeColor="#1B3A2F"
            />
            <PillGroup
              label="מטבע"
              options={["all", "ILS", "USD"]}
              labels={{ all: "הכל", ILS: "ILS", USD: "USD" }}
              value={currencyFilter}
              onChange={(v) => setCurrencyFilter(v as "all" | "ILS" | "USD")}
              activeColor="#1B3A2F"
            />
            <div style={{ marginRight: "auto" }}>
              <PillGroup
                label="תקופה"
                options={periodLabels.map((p) => p.key)}
                labels={Object.fromEntries(periodLabels.map((p) => [p.key, p.label]))}
                value={period}
                onChange={(v) => setPeriod(v as typeof period)}
                activeColor="#B8975A"
              />
            </div>
          </div>
        </div>

        {/* ── SORT BAR ── */}
        <div
          style={{
            width: "100%",
            background: "#fff",
            borderBottom: "0.5px solid #eaecee",
            padding: "11px 32px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              maxWidth: 1400,
              margin: "0 auto",
              display: "flex",
              gap: 7,
              direction: "rtl",
              alignItems: "center",
            }}
          >
            {sortLabels.map(({ key, label }) => {
              const active = sortBy === key;
              return (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  style={{
                    padding: "5px 16px",
                    borderRadius: 20,
                    fontSize: 12,
                    border: active ? "1px solid #1B3A2F" : "1px solid #e8eaec",
                    color: active ? "#1B3A2F" : "#6b7280",
                    fontWeight: active ? 600 : 400,
                    backgroundColor: "transparent",
                    cursor: "pointer",
                    transition: "all 0.12s",
                  }}
                >
                  {label}
                </button>
              );
            })}
            <span style={{ fontSize: 11, color: "#9ca3af", marginRight: 12 }}>
              {sortedFunds.length} קרנות
            </span>
          </div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div
          style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 16px 120px" }}
        >
          {hasMixedCurrencies && (
            <div
              style={{
                marginBottom: 16,
                padding: "10px 16px",
                backgroundColor: "#fffbeb",
                border: "1px solid #f59e0b",
                borderRadius: 8,
                fontSize: 13,
                color: "#92400e",
              }}
            >
              ⚠️ השוואה כוללת קרנות במטבעות שונים
            </div>
          )}

          {sortedFunds.length === 0 ? (
            <div
              style={{
                padding: "80px 20px",
                textAlign: "center",
                color: "#9ca3af",
                fontSize: 14,
              }}
            >
              לא נמצאו קרנות עם הפילטרים הנוכחיים
            </div>
          ) : (
            <div
              style={{
                background: "#fff",
                border: "0.5px solid #e8ecee",
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              {/* Table header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: colTemplate,
                  padding: "11px 20px",
                  backgroundColor: "#fafbfc",
                  borderBottom: "0.5px solid #f2f4f6",
                  direction: "rtl",
                }}
              >
                <span />
                <span
                  style={{
                    fontSize: 11,
                    color: "#9ca3af",
                    fontWeight: 500,
                    textAlign: "center",
                  }}
                >
                  #
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#9ca3af",
                    fontWeight: 500,
                    paddingRight: 8,
                  }}
                >
                  שם קרן
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#9ca3af",
                    fontWeight: 500,
                    textAlign: "center",
                  }}
                >
                  {activePeriodLabel}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#9ca3af",
                    fontWeight: 500,
                    textAlign: "center",
                  }}
                >
                  שארפ
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#9ca3af",
                    fontWeight: 500,
                    textAlign: "center",
                  }}
                >
                  עקביות
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#9ca3af",
                    fontWeight: 500,
                    textAlign: "center",
                  }}
                >
                  YTD
                </span>
              </div>

              {/* Top rows */}
              {topRows.map((fund, i) => renderRow(fund, i + 1))}

              {/* Separator */}
              {showSeparator && (
                <div
                  style={{
                    borderTop: "1px dashed #e8ecee",
                    borderBottom: "1px dashed #e8ecee",
                    background: "#fdfcfb",
                    padding: "10px 20px",
                    textAlign: "center",
                    fontSize: 12,
                    color: "#9ca3af",
                    direction: "rtl",
                    userSelect: "none",
                  }}
                >
                  · · · · · {bottomRows.length} קרנות נוספות · · · · ·
                </div>
              )}

              {/* Bottom rows */}
              {bottomRows.map((fund, i) =>
                renderRow(fund, TOP_N + i + 1, TOP_N + i + 1 >= 80)
              )}
            </div>
          )}
        </div>

        {/* ── COMPARE BAR ── */}
        {selectedIds.size > 0 && (
          <div
            style={{
              position: "fixed",
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              background: "#1a2e26",
              borderRadius: 14,
              padding: "13px 22px",
              display: "flex",
              alignItems: "center",
              gap: 14,
              zIndex: 100,
              boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
              direction: "rtl",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#B8975A",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>
              {selectedIds.size} קרנות נבחרו
            </span>
            <span
              style={{
                fontSize: 12,
                color: "#94a3b8",
                maxWidth: 300,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {selectedFunds.map((f) => f.name).join(" · ")}
            </span>
            <button
              onClick={handleCompare}
              style={{
                background: "#B8975A",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "7px 18px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                marginRight: 8,
                flexShrink: 0,
              }}
            >
              השווה ←
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              style={{
                background: "none",
                border: "none",
                color: "#94a3b8",
                fontSize: 20,
                cursor: "pointer",
                padding: "0 4px",
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* ── SEARCH BUBBLE ── */}
        <button
          onClick={() => {
            setSearchOpen((v) => !v);
            if (searchOpen) setSearchQuery("");
          }}
          title="חיפוש קרן"
          style={{
            position: "fixed",
            bottom: 32,
            left: 32,
            width: 50,
            height: 50,
            borderRadius: "50%",
            background: "#1a2e26",
            border: "none",
            color: "#fff",
            fontSize: 20,
            cursor: "pointer",
            boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
          }}
        >
          🔍
        </button>

        {searchOpen && (
          <div
            style={{
              position: "fixed",
              bottom: 92,
              left: 32,
              background: "#fff",
              borderRadius: 16,
              padding: "16px",
              boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
              zIndex: 200,
              width: 280,
              direction: "rtl",
            }}
          >
            <input
              autoFocus
              type="text"
              placeholder="חפש שם קרן..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #e8eaec",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
                direction: "rtl",
              }}
            />
            {searchQuery && !searchResult && (
              <div
                style={{
                  fontSize: 12,
                  color: "#9ca3af",
                  marginTop: 10,
                  textAlign: "center",
                }}
              >
                לא נמצאה קרן
              </div>
            )}
            {searchResult && (
              <div
                style={{
                  marginTop: 12,
                  border: "1.5px solid #C9A96E",
                  borderRadius: 14,
                  padding: "12px 14px",
                  boxShadow: "0 1px 20px rgba(184,151,90,0.10)",
                  background: "#fffdf9",
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#1a2e26",
                    marginBottom: 4,
                  }}
                >
                  {searchResult.fund.name}
                </div>
                <div
                  style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}
                >
                  #{searchResult.rank} מתוך {searchResult.total}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 6,
                    marginBottom: 10,
                  }}
                >
                  {[
                    { label: "ממוצע", value: fmt(searchResult.fund.avgAnnualReturn) },
                    { label: "שארפ", value: fmtNum(searchResult.fund.sharpe) },
                    {
                      label: "עקביות",
                      value:
                        calcConsistency(searchResult.fund) !== null
                          ? `${calcConsistency(searchResult.fund)}%`
                          : "—",
                    },
                    { label: "YTD", value: fmt(searchResult.fund.returns?.ytd2026 ?? null) },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "#9ca3af" }}>{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1a2e26" }}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    toggleSelect(searchResult.fund.id);
                    setSearchOpen(false);
                    setSearchQuery("");
                  }}
                  style={{
                    width: "100%",
                    padding: "7px",
                    borderRadius: 8,
                    background: "#1B3A2F",
                    color: "#fff",
                    border: "none",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  הוסף להשוואה
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </ClientGate>
  );
}

/* ================================================================== */
/*  Page export                                                        */
/* ================================================================== */
export default function AnalysisPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 40, textAlign: "center", color: "#888" }}>
          טוען...
        </div>
      }
    >
      <AnalysisContent />
    </Suspense>
  );
}
