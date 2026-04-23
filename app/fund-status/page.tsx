"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useClientKey, withClient } from "@/lib/useClientKey";
import { useBrand } from "@/lib/useBrand";
import { FundsData, Fund } from "@/lib/types";
import ClientGate from "@/components/ClientGate";
import { brandCssVars } from "@/lib/colors";

/* ── status helpers ──────────────────────────────────────── */

function getExpectedMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function getLatestKey(fund: Fund): string | null {
  if (!fund.monthlyReturns) return null;
  const keys = Object.keys(fund.monthlyReturns).filter((k) => /^\d{4}-\d{2}$/.test(k));
  return keys.length ? keys.sort().at(-1)! : null;
}

function monthsBehind(latest: string, expected: string): number {
  const [ly, lm] = latest.split("-").map(Number);
  const [ey, em] = expected.split("-").map(Number);
  return (ey - ly) * 12 + (em - lm);
}

function toYYYYMM(s: string | null | undefined): string | null {
  if (!s) return null;
  if (/^\d{2}\/\d{4}$/.test(s)) return `${s.slice(3)}-${s.slice(0, 2)}`;
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  return null;
}

type StatusKey = "updated" | "warning" | "old" | "delay";

function computeStatus(fund: Fund, expected: string): StatusKey {
  // Prefer lastUpdated (set by both indications/manual entry AND AI parser).
  // Fall back to latest monthlyReturns key (GREEN parser path without lastUpdated).
  const effectiveKey = fund.lastUpdated ?? getLatestKey(fund);
  if (!effectiveKey) return "old";
  const behind = monthsBehind(effectiveKey, expected);
  if (behind <= 0) return "updated";
  if (behind === 1) return "warning";
  return "old";
}

function shortCategory(cat: string): string {
  const c = cat.toLowerCase();
  if (c.includes("מולטי") || c.includes("multi")) return "MULTI";
  if (c.includes("אג")) return "BOND";
  if (c.includes("לונג") || c.includes("long")) return "LONG";
  return cat;
}

function statusFromRow(row: { effectiveKey: string | null }, expected: string): StatusKey {
  const latest = row.effectiveKey;
  if (!latest) return "old";
  const behind = monthsBehind(latest, expected);
  if (behind <= 0) return "updated";
  if (behind === 1) return "warning";
  return "old";
}

function fmtKey(k: string | null | undefined): string {
  if (!k) return "—";
  if (/^\d{4}-\d{2}/.test(k)) {
    const [y, m] = k.split("-");
    return `${m}/${y}`;
  }
  return k;
}

const STATUS_CFG: Record<StatusKey, { label: string; color: string; bg: string; dot: string }> = {
  updated: { label: "עודכן",     color: "#059669", bg: "#ECFDF5", dot: "#059669" },
  warning: { label: "חסר חודש", color: "#D97706", bg: "#FFFBEB", dot: "#D97706" },
  old:     { label: "לא עודכן", color: "#DC2626", bg: "#FEF2F2", dot: "#DC2626" },
  delay:   { label: "דיליי",    color: "#7C3AED", bg: "#F5F3FF", dot: "#7C3AED" },
};

const CAT_CFG: Record<string, { color: string; bg: string }> = {
  BOND:  { color: "#1D4ED8", bg: "#EFF6FF" },
  LONG:  { color: "#065F46", bg: "#ECFDF5" },
  MULTI: { color: "#92400E", bg: "#FFFBEB" },
};

/* ── row type ────────────────────────────────────────────── */
interface FundRow {
  id: string;
  name: string;
  category: string;
  currency: string;
  latestMonth: string | null;
  latestKey: string | null;
  effectiveKey: string | null;
  reportDateKey: string | null;
  mismatch: boolean;
  reportingDelay: boolean;
  status: StatusKey;
}

/* ── page component ──────────────────────────────────────── */
function FundStatusContent() {
  const clientKey = useClientKey();
  const router = useRouter();
  const brand = useBrand(clientKey);
  const [data, setData] = useState<FundsData | null>(null);
  const [filter, setFilter] = useState<"all" | StatusKey>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (brand.name !== "" && !brand.features?.fundStatus) {
      router.replace(withClient("/", clientKey));
    }
  }, [brand, clientKey, router]);

  useEffect(() => {
    fetch(`/api/funds?client=${encodeURIComponent(clientKey)}`)
      .then((r) => r.json())
      .then(setData);
  }, [clientKey]);

  const expected = useMemo(() => getExpectedMonth(), []);

  const baseRows = useMemo((): FundRow[] => {
    if (!data) return [];
    const out: FundRow[] = [];
    for (const cat of data.categories) {
      for (const fund of cat.funds) {
        if (fund.active === false) continue;
        const lk = getLatestKey(fund);
        const effectiveKey = fund.lastUpdated ?? lk;
        const rdk = fund.lastReportDate ?? null;
        const displayDate = rdk;
        const mismatch = !!lk && !!rdk && toYYYYMM(lk) !== toYYYYMM(rdk);
        const reportingDelay = fund.reportingDelay ?? false;
        out.push({
          id: fund.id,
          name: fund.name,
          category: cat.name,
          currency: fund.currency ?? "—",
          latestMonth: lk ? fmtKey(lk) : null,
          latestKey: lk,
          effectiveKey,
          reportDateKey: displayDate,
          mismatch,
          reportingDelay,
          status: reportingDelay ? "delay" : computeStatus(fund, expected),
        });
      }
    }
    return out;
  }, [data, expected]);

  const [rows, setRows] = useState<FundRow[]>([]);
  useEffect(() => { setRows(baseRows); }, [baseRows]);

  const counts = useMemo(() => ({
    total:   rows.length,
    updated: rows.filter((r) => r.status === "updated").length,
    warning: rows.filter((r) => r.status === "warning").length,
    old:     rows.filter((r) => r.status === "old").length,
    delay:   rows.filter((r) => r.status === "delay").length,
  }), [rows]);

  const filtered = useMemo(() => {
    let result = filter === "all" ? rows : rows.filter((r) => r.status === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) => r.name.toLowerCase().includes(q));
    }
    return result;
  }, [rows, filter, search]);

  async function toggleDelay(id: string, current: boolean) {
    const pwd = sessionStorage.getItem(`client-auth-password-${clientKey}`) ?? "";
    await fetch(`/api/funds/${id}?client=${encodeURIComponent(clientKey)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-password": pwd },
      body: JSON.stringify({ reportingDelay: !current }),
    });
    setRows(prev => prev.map(r =>
      r.id === id
        ? { ...r, reportingDelay: !current, status: !current ? "delay" : statusFromRow(r, expected) }
        : r
    ));
  }

  const primary = brand.primaryColor || "#1B3A2F";
  const accent  = brand.accentColor  || "#B8975A";
  const COL = "1fr 100px 110px 120px 140px 60px 190px";

  const STAT_CARDS = [
    { label: "סה״כ קרנות",           value: counts.total,                                  color: primary,    border: primary },
    { label: "עודכנו לחודש הנוכחי", value: counts.updated, sub: `חודש צפוי: ${fmtKey(expected)}`, color: "#059669", border: "#059669" },
    { label: "ממתינות לעדכון",       value: counts.total - counts.updated - counts.delay,  color: "#D97706",  border: "#D97706" },
    { label: "דיליי",                value: counts.delay,                                   color: "#7C3AED",  border: "#7C3AED" },
  ];

  const FILTERS: { id: "all" | StatusKey; label: string; count: number }[] = [
    { id: "all",     label: "הכל",       count: counts.total },
    { id: "updated", label: "עודכנו",   count: counts.updated },
    { id: "warning", label: "ממתינות",  count: counts.warning },
    { id: "old",     label: "ישנות",    count: counts.old },
    { id: "delay",   label: "דיליי",    count: counts.delay },
  ];

  return (
    <ClientGate clientKey={clientKey}>
      <div style={{ minHeight: "100vh", backgroundColor: "#f8f9fa", ...brandCssVars(primary, accent) } as React.CSSProperties}>

        {/* Main content */}
        <div style={{ maxWidth: 1500, margin: "0 auto", padding: "32px 28px 56px" }}>

          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
            {STAT_CARDS.map((s) => (
              <div key={s.label} style={{
                backgroundColor: "#fff",
                borderRadius: 14,
                padding: "24px 28px 20px",
                border: "0.5px solid #e8ecee",
                borderTop: `3px solid ${s.border}`,
                boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
                direction: "rtl",
              }}>
                <div style={{
                  fontSize: 42, fontWeight: 800, color: s.color, lineHeight: 1,
                  fontVariantNumeric: "tabular-nums", letterSpacing: "-1px",
                }}>{s.value}</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 8, fontWeight: 500 }}>{s.label}</div>
                {s.sub && (
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{s.sub}</div>
                )}
              </div>
            ))}
          </div>

          {/* Controls row */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 16, gap: 16, flexWrap: "wrap", direction: "rtl",
          }}>
            {/* Filter pills */}
            <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", overflowX: "auto" }}>
              {FILTERS.map((f) => {
                const active = filter === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "7px 16px", borderRadius: 20, cursor: "pointer",
                      fontSize: 13, fontWeight: active ? 600 : 400,
                      border: "none",
                      backgroundColor: active ? primary : "#f1f5f9",
                      color: active ? "#fff" : "#4a5568",
                      boxShadow: "none",
                      transition: "all 0.15s",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {f.label}
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      backgroundColor: active ? "rgba(255,255,255,0.25)" : "#f1f5f9",
                      color: active ? "#fff" : "#64748b",
                      borderRadius: 10, padding: "1px 7px",
                    }}>{f.count}</span>
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <div style={{ position: "relative", minWidth: 240 }}>
              <span style={{
                position: "absolute", top: "50%", right: 12,
                transform: "translateY(-50%)", fontSize: 14,
                color: "#9ca3af", pointerEvents: "none",
              }}>🔍</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש קרן..."
                dir="rtl"
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "9px 36px 9px 14px", borderRadius: 10,
                  border: "0.5px solid #e2e8f0",
                  backgroundColor: "#fff",
                  color: "#1a2e26", fontSize: 13, outline: "none",
                  transition: "border-color 0.15s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
                onFocus={(e) => (e.target.style.borderColor = primary)}
                onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
              />
            </div>
          </div>

          {/* Table */}
          <div style={{
            backgroundColor: "#fff",
            borderRadius: 16,
            border: "0.5px solid #e8ecee",
            boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
            overflow: "hidden",
            direction: "rtl",
          }}>
            {/* Header */}
            <div style={{
              display: "grid", gridTemplateColumns: COL,
              padding: "11px 22px",
              backgroundColor: "#fafbfc",
              borderBottom: "0.5px solid #eaecee",
            }}>
              {["שם קרן", "קטגוריה", "חודש אחרון", "עדכון אחרון", "סטטוס", "דיליי", ""].map((h, i) => (
                <div key={i} style={{
                  fontSize: 10, fontWeight: 600, color: "#9ca3af",
                  letterSpacing: "0.8px", textTransform: "uppercase",
                }}>{h}</div>
              ))}
            </div>

            {/* Rows */}
            {!data ? (
              <div style={{ padding: 56, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                טוען נתונים...
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 56, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                אין קרנות להצגה
              </div>
            ) : filtered.map((row, idx) => {
              const sc = STATUS_CFG[row.status];
              const catKey = shortCategory(row.category);
              const catCfg = CAT_CFG[catKey] ?? { color: "#6b7280", bg: "#f3f4f6" };

              return (
                <div
                  key={row.id}
                  style={{
                    display: "grid", gridTemplateColumns: COL,
                    padding: "13px 22px",
                    borderBottom: idx < filtered.length - 1 ? "0.5px solid #f0f2f4" : "none",
                    alignItems: "center",
                    backgroundColor: idx % 2 === 0 ? "#fff" : "#fafafa",
                    transition: "background-color 0.12s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f7faf8")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = idx % 2 === 0 ? "#fff" : "#fafafa")}
                >
                  {/* שם קרן */}
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a2e26", letterSpacing: "-0.1px" }}>
                    {row.name}
                  </div>

                  {/* קטגוריה — pill */}
                  <div>
                    <span style={{
                      display: "inline-block",
                      padding: "2px 9px", borderRadius: 10,
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.5px",
                      backgroundColor: catCfg.bg, color: catCfg.color,
                    }}>{catKey}</span>
                  </div>

                  {/* חודש אחרון */}
                  <div style={{ fontSize: 12, color: "#6b7280", display: "flex", alignItems: "center", gap: 5 }}>
                    {row.latestMonth ?? <span style={{ color: "#d1d5db" }}>—</span>}
                    {row.mismatch && (
                      <span
                        title={`תאריך הדוח (${fmtKey(row.reportDateKey)}) לא תואם לנתונים (${row.latestMonth ?? "—"})`}
                        style={{ fontSize: 12, cursor: "help" }}
                      >⚠️</span>
                    )}
                  </div>

                  {/* עדכון אחרון */}
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>
                    {row.reportDateKey ? fmtKey(row.reportDateKey) : "—"}
                  </div>

                  {/* סטטוס — pill עם dot */}
                  <div>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "4px 10px", borderRadius: 20,
                      fontSize: 11, fontWeight: 600,
                      backgroundColor: sc.bg, color: sc.color,
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%",
                        backgroundColor: sc.dot, flexShrink: 0,
                      }} />
                      {sc.label}
                    </span>
                  </div>

                  {/* דיליי toggle */}
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <label style={{ position: "relative", display: "inline-block", width: 34, height: 18, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={row.reportingDelay}
                        onChange={() => toggleDelay(row.id, row.reportingDelay)}
                        style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
                      />
                      <span style={{
                        position: "absolute", inset: 0, borderRadius: 9,
                        backgroundColor: row.reportingDelay ? "#7C3AED" : "#e5e7eb",
                        transition: "background 0.2s",
                      }} />
                      <span style={{
                        position: "absolute", width: 14, height: 14, top: 2, borderRadius: "50%",
                        backgroundColor: "#fff",
                        left: row.reportingDelay ? 18 : 2,
                        transition: "left 0.2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }} />
                    </label>
                  </div>

                  {/* פעולה */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {row.status !== "updated" && (
                      <button
                        onClick={() => router.push(
                          withClient(`/upload?fundId=${encodeURIComponent(row.id)}&fundName=${encodeURIComponent(row.name)}`, clientKey)
                        )}
                        style={{
                          padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                          backgroundColor: primary, color: "#fff",
                          fontSize: 11, fontWeight: 600,
                          transition: "opacity 0.15s", whiteSpace: "nowrap",
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.opacity = "0.75")}
                        onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
                      >
                        העלה דוח
                      </button>
                    )}
                    {row.status !== "updated" && (
                      <button
                        onClick={() => router.push(
                          withClient(`/indications?fund=${encodeURIComponent(row.id)}`, clientKey)
                        )}
                        style={{
                          padding: "5px 12px", borderRadius: 8, cursor: "pointer",
                          backgroundColor: "transparent", color: primary,
                          border: `1px solid ${primary}`,
                          fontSize: 11, fontWeight: 600,
                          transition: "opacity 0.15s", whiteSpace: "nowrap",
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.opacity = "0.7")}
                        onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
                      >
                        עדכן ידנית
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </ClientGate>
  );
}

export default function FundStatusPage() {
  return (
    <Suspense>
      <FundStatusContent />
    </Suspense>
  );
}
