"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useClientKey, withClient } from "@/lib/useClientKey";
import { useBrand } from "@/lib/useBrand";
import { FundsData, Fund } from "@/lib/types";
import ClientGate from "@/components/ClientGate";
import BrandLogo from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeProvider";
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

type StatusKey = "updated" | "warning" | "old";

function computeStatus(fund: Fund, expected: string): StatusKey {
  const latest = getLatestKey(fund);
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
  status: StatusKey;
}

/* ── page component ──────────────────────────────────────── */
function FundStatusContent() {
  const clientKey = useClientKey();
  const router = useRouter();
  const brand = useBrand(clientKey);
  const [data, setData] = useState<FundsData | null>(null);
  const [filter, setFilter] = useState<"all" | StatusKey>("all");

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

  const rows = useMemo((): FundRow[] => {
    if (!data) return [];
    const out: FundRow[] = [];
    for (const cat of data.categories) {
      for (const fund of cat.funds) {
        if (fund.active === false) continue;
        const lk = getLatestKey(fund);
        const rdk = fund.lastReportDate ?? null; // "YYYY-MM" or null
        const mismatch = !!lk && !!rdk && lk !== rdk;
        out.push({
          id: fund.id,
          name: fund.name,
          category: cat.name,
          currency: fund.currency ?? "—",
          latestMonth: lk ? fmtKey(lk) : null,
          latestKey: lk,
          reportDateKey: rdk,
          mismatch,
          status: computeStatus(fund, expected),
        });
      }
    }
    return out;
  }, [data, expected]);

  const counts = useMemo(() => ({
    total:   rows.length,
    updated: rows.filter((r) => r.status === "updated").length,
    warning: rows.filter((r) => r.status === "warning").length,
    old:     rows.filter((r) => r.status === "old").length,
  }), [rows]);

  const filtered = useMemo(
    () => filter === "all" ? rows : rows.filter((r) => r.status === filter),
    [rows, filter]
  );

  const navLink: React.CSSProperties = {
    fontSize: 12, color: "var(--text-secondary)", textDecoration: "none",
    padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)",
    transition: "border-color 0.15s", cursor: "pointer",
  };

  const FILTERS: { id: "all" | StatusKey; label: string; count: number }[] = [
    { id: "all",     label: "הכל",         count: counts.total },
    { id: "updated", label: "עודכנו ✅",   count: counts.updated },
    { id: "warning", label: "ממתינות ⚠️", count: counts.warning },
    { id: "old",     label: "ישנות ❌",    count: counts.old },
  ];

  const STAT_CARDS = [
    { label: "סה״כ קרנות",           value: counts.total,   color: brand.primaryColor || "#1B3A2F" },
    { label: "עודכנו לחודש הנוכחי", value: counts.updated, color: "#059669" },
    { label: "ממתינות לעדכון",       value: counts.total - counts.updated, color: "#D97706" },
  ];

  const COL = "1fr 160px 76px 110px 120px 130px 116px";

  return (
    <ClientGate clientKey={clientKey}>
      <div style={{ minHeight: "100vh", ...brandCssVars(brand.primaryColor, brand.accentColor) } as React.CSSProperties}>

        {/* Brand accent bar */}
        <div style={{ height: 4, backgroundColor: brand.primaryColor }} />

        {/* Top nav */}
        <div style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
          <div style={{ maxWidth: 1500, margin: "0 auto", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <BrandLogo brand={brand} height={28} variant="light" />
              <span style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 600 }}>{brand.mainTitle}</span>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>/ סטטוס קרנות</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <a href={withClient("/", clientKey)} style={navLink}>דוח</a>
              <a href={withClient("/analysis", clientKey)} style={navLink}>ניתוח</a>
              <a href={withClient("/charts", clientKey)} style={navLink}>גרפים</a>
              <span style={{ ...navLink, backgroundColor: brand.primaryColor, color: "#fff", fontWeight: 700, border: "none" }}>סטטוס</span>
              <a href={withClient("/admin", clientKey)} style={navLink}>ניהול</a>
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ maxWidth: 1500, margin: "0 auto", padding: "28px 24px 40px" }}>

          {/* Stat cards */}
          <div style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
            {STAT_CARDS.map((s) => (
              <div key={s.label} style={{
                flex: "1 1 200px", backgroundColor: "var(--bg-surface)",
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

          {/* Filter bar */}
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
              {["שם קרן", "קטגוריה", "מטבע", "חודש אחרון", "תאריך עדכון", "סטטוס", "פעולה"].map((h) => (
                <div key={h} style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 0.4, textTransform: "uppercase" }}>{h}</div>
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
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{row.category}</div>

                  {/* מטבע */}
                  <div>
                    {row.currency !== "—" ? (
                      <span style={{
                        padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                        backgroundColor: row.currency === "USD" ? "#DBEAFE" : "#D1FAE5",
                        color: row.currency === "USD" ? "#1D4ED8" : "#065F46",
                      }}>{row.currency}</span>
                    ) : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>}
                  </div>

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

                  {/* פעולה */}
                  <div>
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
            ❌ חסר 2+ חודשים או ללא נתונים
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
