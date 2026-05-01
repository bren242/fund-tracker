"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useClientKey } from "@/lib/useClientKey";
import { useBrand } from "@/lib/useBrand";
import ClientGate from "@/components/ClientGate";
import { brandCssVars } from "@/lib/colors";

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Types                                                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

interface FundMetrics {
  fund:        { id: string; name: string; classification: string; lastReportDate: string | null };
  ir:          number | null;
  vsBenchmark: { monthsAbove: number; monthsBelow: number; totalMonths: number; percentageAbove: number; benchmarkName: string; insufficientData: boolean };
  vsCategory:  { monthsAbove: number; monthsBelow: number; totalMonths: number; percentageAbove: number; insufficientData: boolean };
  monthly:     { fundReturn: number | null; categoryAvg: number | null; diff: number | null };
  ytd:         { fundReturn: number | null; categoryAvg: number | null; diff: number | null; fromMonth: string };
  rolling24m:  { fundReturn: number | null; categoryAvg: number | null; diff: number | null; fromMonth: string };
}

interface CompareData {
  sameCategory: boolean;
  error?:       string;
  categoryInfo: { id: string; name: string; fundsCount: number; fundsWithMonthlyData: number };
  endMonth:     string;
  funds:        FundMetrics[];
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Helpers                                                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const CURRENT_YEAR   = new Date().getFullYear();
const FUND_YEARS     = Array.from({ length: CURRENT_YEAR - 2019 }, (_, i) => CURRENT_YEAR - i);
const GOLD_COLOR     = "#B8975A";

function fmtPct(v: number | null, decimals = 1): string {
  if (v == null) return "—";
  const pct = v * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(decimals)}%`;
}
function fmtIR(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
}
function diffColor(v: number | null): string {
  if (v == null) return "var(--text-muted)";
  return v > 0 ? "#059669" : v < 0 ? "#DC2626" : "var(--text-secondary)";
}
function irColor(ir: number | null): string {
  if (ir == null) return "var(--text-muted)";
  if (ir > 0.5)  return "#059669";
  if (ir > 0)    return "#D97706";
  return "#DC2626";
}
function ringColor(score: number): string {
  if (score >= 55) return "#059669";
  if (score >= 45) return "#D97706";
  return "#DC2626";
}

function ScoreRing({ pct, color }: { pct: number; color: string }) {
  const r = 20, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={48} height={48} viewBox="0 0 48 48" style={{ display: "block" }}>
      <circle cx={24} cy={24} r={r} fill="none" stroke="var(--border)" strokeWidth={4} />
      <circle
        cx={24} cy={24} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
        style={{ transform: "rotate(-90deg) scaleX(-1)", transformOrigin: "24px 24px" }}
      />
      <text x={24} y={28} textAnchor="middle" fontSize={9} fontWeight={700} fill={color}>
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Compare view                                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

function CompareView({
  fundIds,
  clientKey,
}: { fundIds: string[]; clientKey: string }) {
  const brand  = useBrand(clientKey);
  const router = useRouter();
  const G      = brand.primaryColor || "#1B3A2F";

  const [data,         setData]         = useState<CompareData | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [endMonth,     setEndMonth]     = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [selectedMon,  setSelectedMon]  = useState<number>(new Date().getMonth() + 1);
  const [initialized,  setInitialized]  = useState(false);

  /* AI */
  const [aiText,    setAiText]    = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState(false);

  const fundsParam = fundIds.join(",");

  const fetchData = useCallback(async (month: string) => {
    if (!month) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(
        `/api/consistency-compare-data?funds=${encodeURIComponent(fundsParam)}&endMonth=${month}&client=${encodeURIComponent(clientKey)}`
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `HTTP ${res.status}`);
      }
      const json: CompareData = await res.json();
      if (!json.sameCategory) {
        setError(json.error ?? "ניתן להשוות רק קרנות מאותה קטגוריה");
        return;
      }
      setData(json);
      if (!initialized) {
        /* Snap to latest lastReportDate among funds */
        const latestDate = json.funds.reduce((acc, f) => {
          if (f.fund.lastReportDate && f.fund.lastReportDate > acc) return f.fund.lastReportDate;
          return acc;
        }, "");
        if (latestDate) {
          const [y, m] = latestDate.split("-").map(Number);
          setSelectedYear(y); setSelectedMon(m);
          setEndMonth(`${y}-${String(m).padStart(2, "0")}`);
          setInitialized(true);
          return;
        }
        setInitialized(true);
      }
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [clientKey, fundsParam, initialized]);

  useEffect(() => {
    const now = new Date();
    const def = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    setEndMonth(def);
  }, [fundsParam]);

  useEffect(() => { if (endMonth) fetchData(endMonth); }, [endMonth]); // eslint-disable-line

  /* Fire AI once data is ready and endMonth is in sync */
  useEffect(() => {
    if (!data || loading) return;
    if (endMonth && data.endMonth !== endMonth) return;
    setAiText(null); setAiError(false); setAiLoading(true);
    fetch("/api/consistency-compare-ai", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(data),
    })
      .then((r) => r.json())
      .then((j: { analysis?: string }) => {
        if (j.analysis) setAiText(j.analysis); else setAiError(true);
      })
      .catch(() => setAiError(true))
      .finally(() => setAiLoading(false));
  }, [data, loading, endMonth]); // eslint-disable-line

  /* Derived */
  const maxYear  = CURRENT_YEAR;
  const maxMonth = new Date().getMonth() + 1;

  /* Highlight logic */
  const bestIR  = useMemo(() => {
    if (!data) return null;
    const best = data.funds.reduce((a, b) =>
      (b.ir ?? -Infinity) > (a.ir ?? -Infinity) ? b : a
    );
    return best.ir != null ? best.fund.id : null;
  }, [data]);

  const bestCatPct = useMemo(() => {
    if (!data) return null;
    const best = data.funds.reduce((a, b) =>
      b.vsCategory.percentageAbove > a.vsCategory.percentageAbove ? b : a
    );
    return best.fund.id;
  }, [data]);

  const handleApply = () => {
    setEndMonth(`${selectedYear}-${String(selectedMon).padStart(2, "0")}`);
  };

  const handleRemoveFund = (fundId: string) => {
    const remaining = fundIds.filter((id) => id !== fundId);
    if (remaining.length < 2) {
      router.push(`/${clientKey}/consistency`);
    } else {
      router.push(`/${clientKey}/consistency/compare?funds=${remaining.join(",")}`);
    }
  };

  const selSt: React.CSSProperties = {
    padding: "6px 10px", borderRadius: 8, fontSize: 13,
    border: "1px solid var(--border)", backgroundColor: "var(--bg-input)",
    color: "var(--text-primary)", cursor: "pointer",
  };

  return (
    <div style={{
      ...brandCssVars(brand.primaryColor, brand.accentColor) as React.CSSProperties,
      minHeight: "100vh", backgroundColor: "var(--bg-page)",
    }}>
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        .cmp-fade { animation: fadeUp 0.3s ease both; }
        .cmp-card-hover:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.10) !important; }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 64px" }}>

        {/* Back */}
        <a
          href={`/${clientKey}/consistency`}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 12, color: "var(--text-muted)", textDecoration: "none",
            marginBottom: 16,
          }}
        >
          ← חזרה לרשימה
        </a>

        {/* Header */}
        <div style={{ marginBottom: 22, display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            השוואת עקביות
            {data && ` — ${data.categoryInfo.name}`}
          </h1>
          {data && (
            <span style={{
              fontSize: 11, fontWeight: 500, padding: "3px 10px",
              borderRadius: 100, border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}>
              {data.funds.length} קרנות
            </span>
          )}
        </div>

        {/* Period selector */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "12px 16px", borderRadius: 10,
          backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
          marginBottom: 28, position: "sticky", top: 0, zIndex: 20,
        }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>תקופה:</span>
          <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} style={selSt}>
            {FUND_YEARS.filter((y) => y <= maxYear).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select value={selectedMon} onChange={(e) => setSelectedMon(Number(e.target.value))} style={selSt}>
            {MONTHS_HE.map((name, i) => {
              const mon = i + 1;
              const disabled = selectedYear === maxYear && mon > maxMonth;
              return <option key={mon} value={mon} disabled={disabled}>{name}</option>;
            })}
          </select>
          <button
            onClick={handleApply}
            style={{
              padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              backgroundColor: G, color: "#fff", border: "none", cursor: "pointer",
            }}
          >
            הצג
          </button>
          {endMonth && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: "auto" }}>
              חלון: 24 חודשים עד {endMonth}
            </span>
          )}
        </div>

        {/* Loading / Error */}
        {loading && (
          <div style={{ textAlign: "center", padding: 56, color: "var(--text-muted)" }}>טוען...</div>
        )}
        {error && (
          <div style={{ textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 14, color: "#DC2626", marginBottom: 16 }}>{error}</div>
            <button
              onClick={() => router.push(`/${clientKey}/consistency`)}
              style={{
                padding: "8px 20px", borderRadius: 8, fontSize: 13,
                backgroundColor: G, color: "#fff", border: "none", cursor: "pointer",
              }}
            >
              חזרה לרשימה
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Fund cards grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${data.funds.length}, 1fr)`,
              gap: 16, marginBottom: 24,
            }}>
              {data.funds.map((fd) => {
                const isGold       = fd.fund.id === bestIR;
                const isBestCat    = fd.fund.id === bestCatPct;
                const bmScore      = fd.vsBenchmark.insufficientData ? null : fd.vsBenchmark.percentageAbove;
                const catScore     = fd.vsCategory.insufficientData  ? null : fd.vsCategory.percentageAbove;

                return (
                  <div
                    key={fd.fund.id}
                    className="cmp-fade cmp-card-hover"
                    style={{
                      position: "relative",
                      borderRadius: 14,
                      padding: "20px 18px 18px",
                      backgroundColor: "var(--bg-surface)",
                      border: `2px solid ${isGold ? GOLD_COLOR : "var(--border)"}`,
                      boxShadow: isGold
                        ? `0 0 0 1px ${GOLD_COLOR}22, 0 2px 8px rgba(0,0,0,0.06)`
                        : "0 1px 4px rgba(0,0,0,0.04)",
                      transition: "box-shadow 0.15s",
                    }}
                  >
                    {/* Best-consistency tag */}
                    {isBestCat && (
                      <div style={{
                        position: "absolute", top: -1, right: 12,
                        fontSize: 9, fontWeight: 700, letterSpacing: "0.4px",
                        padding: "2px 8px", borderRadius: "0 0 6px 6px",
                        backgroundColor: "#059669", color: "#fff",
                        textTransform: "uppercase",
                      }}>
                        הכי עקבית
                      </div>
                    )}

                    {/* Remove button */}
                    <button
                      onClick={() => handleRemoveFund(fd.fund.id)}
                      style={{
                        position: "absolute", top: 10, left: 10,
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--text-muted)", padding: 2, borderRadius: 4,
                        fontSize: 14, lineHeight: 1,
                        opacity: 0.6,
                      }}
                      title="הסר קרן"
                    >
                      ✕
                    </button>

                    {/* Fund name */}
                    <div style={{
                      fontSize: 13, fontWeight: 700, color: "var(--text-primary)",
                      marginBottom: 2, paddingLeft: 20, direction: "rtl",
                    }}>
                      {fd.fund.name}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 16, direction: "rtl" }}>
                      {fd.fund.classification}
                    </div>

                    {/* IR */}
                    <div style={{ marginBottom: 14, textAlign: "center" }}>
                      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>
                        Information Ratio
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: irColor(fd.ir), lineHeight: 1 }}>
                        {fmtIR(fd.ir)}
                      </div>
                    </div>

                    {/* Score rings */}
                    <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 16 }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.4px" }}>מול בנצ׳מרק</div>
                        {bmScore != null
                          ? <ScoreRing pct={bmScore} color={ringColor(bmScore)} />
                          : <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "8px 0" }}>אין נתונים</div>
                        }
                        {!fd.vsBenchmark.insufficientData && (
                          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                            {fd.vsBenchmark.monthsAbove}/{fd.vsBenchmark.totalMonths}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.4px" }}>מול קטגוריה</div>
                        {catScore != null
                          ? <ScoreRing pct={catScore} color={ringColor(catScore)} />
                          : <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "8px 0" }}>אין נתונים</div>
                        }
                        {!fd.vsCategory.insufficientData && (
                          <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                            {fd.vsCategory.monthsAbove}/{fd.vsCategory.totalMonths}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Returns */}
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                      {[
                        { label: "חודשי",    r: fd.monthly,    from: null },
                        { label: "YTD",      r: fd.ytd,        from: fd.ytd.fromMonth },
                        { label: "Rolling 24M", r: fd.rolling24m, from: fd.rolling24m.fromMonth },
                      ].map(({ label, r, from }) => (
                        <div key={label} style={{ marginBottom: 10, direction: "rtl" }}>
                          <div style={{
                            fontSize: 9, fontWeight: 600, letterSpacing: "0.4px",
                            textTransform: "uppercase", color: "var(--text-muted)",
                            marginBottom: 3,
                          }}>
                            {label}{from && <span style={{ fontWeight: 400, marginRight: 4, fontSize: 8 }}>מ-{from}</span>}
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1, marginBottom: 2 }}>
                            {fmtPct(r.fundReturn)}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                            קטגוריה: {fmtPct(r.categoryAvg)}
                          </div>
                          <div style={{
                            fontSize: 11, fontWeight: 600,
                            color: diffColor(r.diff),
                          }}>
                            {r.diff != null ? `${fmtPct(r.diff)} מול קטגוריה` : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* AI comparative analysis */}
            <div style={{
              borderRadius: 14, padding: "24px 28px 20px",
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              marginBottom: 16,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 600, letterSpacing: "0.7px",
                textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 14,
              }}>
                ניתוח השוואתי
              </div>

              {aiLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-muted)", fontSize: 13 }}>
                  <svg width={16} height={16} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
                    <style>{`@keyframes cmp-spin { to { transform: rotate(360deg); } }`}</style>
                    <circle
                      cx={8} cy={8} r={6}
                      fill="none" stroke="currentColor" strokeWidth={2}
                      strokeDasharray="20 18"
                      style={{ transformOrigin: "8px 8px", animation: "cmp-spin 0.8s linear infinite" }}
                    />
                  </svg>
                  מנתח...
                </div>
              )}
              {!aiLoading && aiError && (
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>ניתוח לא זמין כרגע</div>
              )}
              {!aiLoading && aiText && (
                <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text-secondary)", margin: 0, direction: "rtl" }}>
                  {aiText}
                </p>
              )}
              <div style={{
                fontSize: 10, color: "var(--text-muted)", marginTop: 16, paddingTop: 12,
                borderTop: "1px solid var(--border)",
              }}>
                המידע לצורך ניתוח בלבד ואינו מהווה ייעוץ השקעות.
              </div>
            </div>

            <p style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "right", lineHeight: 1.6 }}>
              כל החישובים מבוססים על חלון Rolling 24 חודשים המסתיים ב-{endMonth}.
              {data && ` ממוצע קטגוריה מחושב מ-${data.categoryInfo.fundsWithMonthlyData} קרנות עם נתונים.`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Content (reads URL params, validates, redirects)                          */
/* ══════════════════════════════════════════════════════════════════════════ */

function CompareContent() {
  const clientKey = useClientKey();
  const params    = useSearchParams();
  const router    = useRouter();

  const fundsParam = params.get("funds") ?? "";
  const fundIds    = useMemo(() => {
    const ids = fundsParam.split(",").map((s) => s.trim()).filter(Boolean);
    return ids.length >= 2 && ids.length <= 4 ? ids : null;
  }, [fundsParam]);

  useEffect(() => {
    if (!fundIds) router.replace(`/${clientKey}/consistency`);
  }, [fundIds, router, clientKey]);

  if (!fundIds) return null;

  return (
    <ClientGate clientKey={clientKey}>
      <CompareView fundIds={fundIds} clientKey={clientKey} />
    </ClientGate>
  );
}

export default function ComparePage() {
  return (
    <Suspense>
      <CompareContent />
    </Suspense>
  );
}
