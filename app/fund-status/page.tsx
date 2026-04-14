"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useClientKey, withClient } from "@/lib/useClientKey";
import { useBrand } from "@/lib/useBrand";
import { FundsData, Fund } from "@/lib/types";
import ClientGate from "@/components/ClientGate";
import { brandCssVars } from "@/lib/colors";

/* ── status helpers ──────────────────────────────────────── */

/** Returns "YYYY-MM" for the most recent expected fund report (previous calendar month). */
function getExpectedMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

/** Latest "YYYY-MM" key in monthlyReturns, or null. */
function getLatestKey(fund: Fund): string | null {
  if (!fund.monthlyReturns) return null;
  const keys = Object.keys(fund.monthlyReturns).filter((k) => /^\d{4}-\d{2}$/.test(k));
  return keys.length ? keys.sort().at(-1)! : null;
}

/** How many months behind "latest" is from "expected" (positive = behind). */
function monthsBehind(latest: string, expected: string): number {
  const [ly, lm] = latest.split("-").map(Number);
  const [ey, em] = expected.split("-").map(Number);
  return (ey - ly) * 12 + (em - lm);
}

/**
 * Normalize any date string to "YYYY-MM" for comparison.
 * Handles: "MM/YYYY", "YYYY-MM", "YYYY-MM-DD"
 */
function toYYYYMM(s: string | null | undefined): string | null {
  if (!s) return null;
  // MM/YYYY
  if (/^\d{2}\/\d{4}$/.test(s)) return `${s.slice(3)}-${s.slice(0, 2)}`;
  // YYYY-MM or YYYY-MM-DD
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  return null;
}

type StatusKey = "updated" | "warning" | "old" | "delay";

function computeStatus(fund: Fund, expected: string): StatusKey {
  const latest = getLatestKey(fund);
  if (!latest) return "old";
  const behind = monthsBehind(latest, expected);
  if (behind <= 0) return "updated";
  if (behind === 1) return "warning";
  return "old";
}

function shortCategory(cat: string): string {
  const c = cat.toLowerCase();
  if (c.includes("מולטי") || c.includes("multi")) return "MULTI";
  if (c.includes("אג"))                            return "BOND";
  if (c.includes("לונג") || c.includes("long"))   return "LONG";
  return cat;
}

/** Compute status from a FundRow (no Fund object needed) */
function statusFromRow(row: { latestKey: string | null }, expected: string): StatusKey {
  const latest = row.latestKey;
  if (!latest) return "old";
  const behind = monthsBehind(latest, expected);
  if (behind <= 0) return "updated";
  if (behind === 1) return "warning";
  return "old";
}

/** "2026-03" → "03/2026" */
function fmtKey(k: string): string {
  const [y, m] = k.split("-");
  return `${m}/${y}`;
}

const STATUS_CFG: Record<StatusKey, { label: string; badge: string; color: string; bg: string; darkBg: string }> = {
  updated: { label: "עודכן",      badge: "✅", color: "#059669", bg: "#D1FAE5", darkBg: "#064E3B" },
  warning: { label: "חסר חודש",  badge: "⚠️", color: "#D97706", bg: "#FEF3C7", darkBg: "#78350F" },
  old:     { label: "לא עודכן",  badge: "❌", color: "#DC2626", bg: "#FEE2E2", darkBg: "#7F1D1D" },
  delay:   { label: "דיליי",     badge: "⏳", color: "#5F5E5A", bg: "#f1efe8", darkBg: "#3a3830" },
};

/* ── row type ────────────────────────────────────────────── */
interface FundRow {
  id: string;
  name: string;
  category: string;
  currency: string;
  latestMonth: string | null;      // "03/2026" — from monthlyReturns
  latestKey: string | null;        // "2026-03"
  reportDateKey: string | null;    // "2026-03" — from lastReportDate
  mismatch: boolean;               // lastReportDate !== latestKey
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

  // Redirect if feature disabled
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
        const rdk = fund.lastReportDate ?? null;
        const mismatch = !!lk && !!rdk && toYYYYMM(lk) !== toYYYYMM(rdk);
        const reportingDelay = fund.reportingDelay ?? false;
        out.push({
          id: fund.id,
          name: fund.name,
          category: cat.name,
          currency: fund.currency ?? "—",
          latestMonth: lk ? fmtKey(lk) : null,
          latestKey: lk,
          reportDateKey: rdk,
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

  const FILTERS: { id: "all" | StatusKey; label: string; count: number }[] = [
    { id: "all",     label: "הכל",         count: counts.total },
    { id: "updated", label: "עודכנו ✅",   count: counts.updated },
    { id: "warning", label: "ממתינות ⚠️", count: counts.warning },
    { id: "old",     label: "ישנות ❌",    count: counts.old },
    { id: "delay",   label: "דיליי ⏳",   count: counts.delay },
  ];

  const STAT_CARDS = [
    { label: "סה״כ קרנות",           value: counts.total,   color: brand.primaryColor || "#1B3A2F" },
    { label: "עודכנו לחודש הנוכחי", value: counts.updated, color: "#059669" },
    { label: "ממתינות לעדכון",       value: counts.total - counts.updated - counts.delay, color: "#D97706" },
    { label: "דיליי",                value: counts.delay,   color: "#7C3AED" },
  ];

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

  const COL = "1fr 150px 110px 120px 130px 72px 110px";

  return (
    <ClientGate clientKey={clientKey}>
      <div style={{ minHeight: "100vh", ...brandCssVars(brand.primaryColor, brand.accentColor) } as React.CSSProperties}>

        {/* Main content */}
        <div style={{ maxWidth: 1500, margin: "0 auto", padding: "28px 24px 40px" }}>

          {/* Stat cards */}
          <div style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
            {STAT_CARDS.map((s) => (
              <div key={s.label} style={{
                flex: "1 1 180px", backgroundColor: "var(--bg-surface)",
                borderRadius: 12, padding: "22px 26px",
                border: "1px solid var(--border)", boxShadow: "var(--shadow-card)",
              }}>
                <div style={{ fontSize: 38, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8 }}>{s.label}</div>
                {s.label === "עודכנו לחודש הנוכחי" && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    חודש צפוי: <strong>{fmtKey(expected)}</strong>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Search */}
          <div style={{ marginBottom: 12, position: "relative", maxWidth: 360 }}>
            <span style={{ position: "absolute", top: "50%", right: 12, transform: "translateY(-50%)", fontSize: 14, color: "var(--text-muted)", pointerEvents: "none" }}>🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש קרן..."
              dir="rtl"
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "8px 36px 8px 12px", borderRadius: 8,
                border: "1px solid var(--border)", backgroundColor: "var(--bg-surface)",
                color: "var(--text-primary)", fontSize: 13, outline: "none",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.target.style.borderColor = brand.primaryColor)}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
            />
          </div>

          {/* Filter buttons */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  style={{
                    padding: "7px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                    border: active ? "none" : "1px solid var(--border)",
                    backgroundColor: active ? brand.primaryColor : "var(--bg-surface)",
                    color: active ? "#fff" : "var(--text-primary)",
                    fontWeight: active ? 700 : 400,
                    transition: "all 0.15s",
                    display: "flex", alignItems: "center", gap: 7,
                  }}
                >
                  {f.label}
                  <span style={{
                    borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700,
                    backgroundColor: active ? "rgba(255,255,255,0.22)" : "var(--bg-surface-alt)",
                    color: active ? "#fff" : "var(--text-muted)",
                  }}>{f.count}</span>
                </button>
              );
            })}
          </div>

          {/* Table */}
          <div style={{
            backgroundColor: "var(--bg-surface)", borderRadius: 12,
            border: "1px solid var(--border)", boxShadow: "var(--shadow-card)",
            overflow: "hidden",
          }}>
            {/* Header row */}
            <div style={{
              display: "grid", gridTemplateColumns: COL,
              padding: "10px 20px",
              backgroundColor: "var(--bg-surface-alt)",
              borderBottom: "2px solid var(--border)",
              direction: "rtl",
            }}>
              {["שם קרן", "קטגוריה", "חודש אחרון", "עדכון אחרון", "סטטוס", "דיליי", ""].map((h, i) => (
                <div key={i} style={{ fontSize: 10, fontWeight: 600, color: "#999", letterSpacing: "1.2px", textTransform: "uppercase" }}>{h}</div>
              ))}
            </div>

            {/* Data rows */}
            {!data ? (
              <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>טוען נתונים...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>אין קרנות להצגה</div>
            ) : filtered.map((row, idx) => {
              const sc = STATUS_CFG[row.status];
              return (
                <div
                  key={row.id}
                  style={{
                    display: "grid", gridTemplateColumns: COL,
                    padding: "12px 20px",
                    borderBottom: idx < filtered.length - 1 ? "1px solid var(--border)" : "none",
                    direction: "rtl",
                    alignItems: "center",
                    backgroundColor: idx % 2 === 0 ? "var(--bg-surface)" : "var(--bg-surface-alt)",
                    transition: "background-color 0.1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-input)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = idx % 2 === 0 ? "var(--bg-surface)" : "var(--bg-surface-alt)")}
                >
                  {/* שם קרן */}
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", paddingLeft: 8 }}>{row.name}</div>

                  {/* קטגוריה */}
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{shortCategory(row.category)}</div>

                  {/* חודש אחרון (לפי monthlyReturns) */}
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 5 }}>
                    {row.latestMonth ?? <span style={{ color: "var(--text-muted)" }}>—</span>}
                    {row.mismatch && (
                      <span
                        title={`תאריך הדוח (${row.reportDateKey ? fmtKey(row.reportDateKey) : "—"}) לא תואם לנתונים (${row.latestMonth ?? "—"})`}
                        style={{ fontSize: 13, cursor: "help", opacity: 0.85 }}
                      >⚠️</span>
                    )}
                  </div>

                  {/* תאריך עדכון (לפי lastReportDate) */}
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {row.reportDateKey ? fmtKey(row.reportDateKey) : "—"}
                  </div>

                  {/* סטטוס */}
                  <div>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      padding: "3px 11px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                      backgroundColor: sc.bg, color: sc.color,
                    }}>
                      {sc.badge} {sc.label}
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
                        backgroundColor: row.reportingDelay ? "#7C3AED" : "#d1d5db",
                        transition: "background 0.2s",
                      }} />
                      <span style={{
                        position: "absolute", width: 14, height: 14, top: 2, borderRadius: "50%",
                        backgroundColor: "#fff",
                        left: row.reportingDelay ? 18 : 2,
                        transition: "left 0.2s",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                      }} />
                    </label>
                  </div>

                  {/* פעולה — רק לשורות שאינן עודכן */}
                  <div>
                    {row.status !== "updated" && (
                      <button
                        onClick={() => router.push(
                          withClient(`/upload?fundId=${encodeURIComponent(row.id)}&fundName=${encodeURIComponent(row.name)}`, clientKey)
                        )}
                        style={{
                          padding: "5px 13px", borderRadius: 6, border: "none", cursor: "pointer",
                          backgroundColor: brand.primaryColor, color: "#fff",
                          fontSize: 11, fontWeight: 600, transition: "opacity 0.15s",
                          whiteSpace: "nowrap",
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.opacity = "0.78")}
                        onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
                      >
                        העלה דוח
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ marginTop: 14, fontSize: 11, color: "var(--text-muted)", textAlign: "right", direction: "rtl" }}>
            חודש עדכון צפוי: <strong>{fmtKey(expected)}</strong> &nbsp;·&nbsp;
            ✅ עודכן לחודש הנוכחי &nbsp;·&nbsp;
            ⚠️ חסר חודש אחד &nbsp;·&nbsp;
            ❌ חסר 2+ חודשים או ללא נתונים &nbsp;·&nbsp;
            ⏳ דיליי — מדווח באיחור
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
