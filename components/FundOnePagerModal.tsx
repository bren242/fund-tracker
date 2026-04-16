"use client";

/**
 * FundOnePagerModal — Apple-grade premium one-pager
 * Fetches from /api/fund-report. Renders skeleton for AI sections.
 * Prints cleanly via window.print().
 */

import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useBrand } from "@/lib/useBrand";

/* ── Types ────────────────────────────────────────────────────────── */

interface ChartPoint { month: string; fund: number; bm: number | null }
interface AiNarrative {
  story: string; strengths: string[]; warnings: string[];
  character: string; verdict: string;
}
interface TrendMetrics {
  consistency12: { score: number; wins: number; total: number } | null;
  consistency36: { score: number; wins: number; total: number } | null;
  avgGapLast6: number | null;
  avgGapPrev6: number | null;
}
interface ReportPayload {
  cached: boolean; reportMonth: string;
  fund: {
    id: string; name: string; classification: string; manager: string;
    currency: "ILS" | "USD"; aumMillions: number | null;
    startDate: string | null; lastUpdated: string | null;
  };
  category: { id: string; name: string };
  metrics: {
    cumulative: number | null; sharpe: number | null; stdDev: number | null;
    avgAnnualReturn: number | null;
    consistencyScore: number | null; consistencyWins: number | null;
    consistencyTotal: number | null; consistencyIR: number | null;
    consistencyAvgGap: number | null;
  };
  trends: TrendMetrics;
  extremes: {
    bestMonth:  { month: string; value: number } | null;
    worstMonth: { month: string; value: number; bmValue: number | null; defenseRatio: number | null } | null;
  };
  ranks: { totalInCategory: number; byCumulative: number | null; bySharpe: number | null; byConsistency: number | null };
  bmLabel: string; chart: ChartPoint[];
  ai: AiNarrative | null; aiError?: string;
}

/* ── Tiny helpers ─────────────────────────────────────────────────── */

const MONTH_HE: Record<string, string> = {
  "01": "ינו", "02": "פבר", "03": "מרץ", "04": "אפר",
  "05": "מאי", "06": "יוני", "07": "יולי", "08": "אוג",
  "09": "ספט", "10": "אוק", "11": "נוב", "12": "דצמ",
};
const MONTH_HE_FULL: Record<string, string> = {
  "01": "ינואר", "02": "פברואר", "03": "מרץ", "04": "אפריל",
  "05": "מאי", "06": "יוני", "07": "יולי", "08": "אוגוסט",
  "09": "ספטמבר", "10": "אוקטובר", "11": "נובמבר", "12": "דצמבר",
};
function fmtM(m: string): string {
  const [y, mo] = m.split("-"); return `${MONTH_HE[mo] || mo} '${y.slice(2)}`;
}
function fmtML(m: string): string {
  const [y, mo] = m.split("-"); return `${MONTH_HE_FULL[mo] || mo} ${y}`;
}
function pct(v: number | null | undefined, dp = 1): string {
  if (v == null) return "—"; return (v * 100).toFixed(dp) + "%";
}
function pctS(v: number | null | undefined, dp = 1): string {
  if (v == null) return "—"; const s = pct(v, dp); return v > 0 ? "+" + s : s;
}
function retColor(v: number | null): string {
  if (v == null) return "#1a1a1a";
  return v > 0 ? "#059669" : v < 0 ? "#DC2626" : "#1a1a1a";
}
function sharpeC(s: number | null): string {
  if (s == null) return "#999"; if (s >= 1) return "#059669"; if (s >= 0.5) return "#B8975A"; return "#DC2626";
}
function consC(s: number | null): string {
  if (s == null) return "#999"; if (s >= 55) return "#059669"; if (s >= 45) return "#B8975A"; return "#DC2626";
}

/* ── Skeleton ─────────────────────────────────────────────────────── */

function Skel({ w = "100%", h = 14, r = 6 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: "linear-gradient(90deg, #e8e8e8 0%, #f4f4f4 50%, #e8e8e8 100%)",
      backgroundSize: "200% 100%",
      animation: "opSkel 1.4s infinite",
    }} />
  );
}

/* ── Main export ──────────────────────────────────────────────────── */

export default function FundOnePagerModal({
  fundId, clientKey, onClose,
}: {
  fundId: string; clientKey: string; onClose: () => void;
}) {
  const brand = useBrand(clientKey);
  const [data, setData] = useState<ReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    let abort = false;
    setError(null); setData(null);
    fetch(`/api/fund-report?fundId=${encodeURIComponent(fundId)}&client=${encodeURIComponent(clientKey)}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json()).error || "Error"); return r.json(); })
      .then((d: ReportPayload) => { if (!abort) setData(d); })
      .catch((e: Error) => { if (!abort) setError(e.message); });
    return () => { abort = true; };
  }, [fundId, clientKey]);

  const primary = brand.primaryColor || "#1B3A2F";
  const accent  = brand.accentColor  || "#B8975A";
  const logo    = brand.logoLight || brand.logo || "";
  const today   = new Date().toLocaleDateString("he-IL");

  return (
    <>
      <style>{`
        @keyframes opSkel {
          0%   { background-position: 200% 0 }
          100% { background-position: -200% 0 }
        }
        .fund-onepager-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(0,0,0,0.52);
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
        }
        .fund-onepager-modal {
          background: #F8F7F4;
          border-radius: 20px;
          max-width: 740px; width: 100%;
          max-height: 94vh; overflow-y: auto;
          padding: 36px 40px 40px;
          box-shadow: 0 32px 80px rgba(0,0,0,0.22), 0 0 0 0.5px rgba(0,0,0,0.08);
          position: relative; direction: rtl;
        }
        .onepager-section { break-inside: avoid; page-break-inside: avoid; }
        .no-print {}
        .print-only { display: none !important; }

        /* ── Print ── */
        @media print {
          body > *:not(.fund-onepager-overlay) { display: none !important; }
          .fund-onepager-overlay {
            position: static !important; background: none !important;
            display: block !important; padding: 0 !important;
          }
          .fund-onepager-modal {
            position: static !important; max-width: 100% !important;
            width: 100% !important; max-height: none !important;
            overflow: visible !important; border-radius: 0 !important;
            box-shadow: none !important; border: none !important;
            padding: 0 !important; margin: 0 !important;
            background: #fff !important;
          }
          .no-print   { display: none !important; }
          .print-only { display: flex !important; }
          .onepager-section {
            break-inside: avoid; page-break-inside: avoid;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @page {
            size: A4 portrait;
            margin: 15mm 18mm 20mm 18mm;
          }
        }
      `}</style>

      <div className="fund-onepager-overlay" onClick={onClose}>
        <div className="fund-onepager-modal" onClick={(e) => e.stopPropagation()}>

          {/* Print-only header */}
          <div className="print-only" style={{ flexDirection: "column" }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              paddingBottom: 16, borderBottom: "0.5px solid #ddd", marginBottom: 28,
            }}>
              {logo
                ? <img src={logo} alt="" style={{ height: 26, objectFit: "contain" }} />
                : <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: primary }}>{brand.fullName || brand.name}</div>
              }
              <div style={{ fontSize: 9, color: "#999", letterSpacing: 0.3 }}>
                ONE PAGER • {brand.fullName || brand.name} • {today}
              </div>
            </div>
          </div>

          {/* Screen-only top bar */}
          <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 10, color: "#B8975A", letterSpacing: 2, fontWeight: 600, textTransform: "uppercase" }}>
              ONE PAGER
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => window.print()}
                disabled={!data}
                style={{
                  fontSize: 11, padding: "5px 12px", borderRadius: 6,
                  border: `0.5px solid ${accent}`, color: accent, background: "transparent",
                  cursor: data ? "pointer" : "default", opacity: data ? 1 : 0.4,
                  fontWeight: 600, letterSpacing: 0.5,
                }}
              >הדפסה</button>
              <button
                onClick={onClose}
                aria-label="סגור"
                style={{
                  width: 28, height: 28, borderRadius: "50%",
                  border: "0.5px solid #ddd", background: "#fff",
                  color: "#888", cursor: "pointer", fontSize: 16,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >×</button>
            </div>
          </div>

          {error  && <ErrBlock error={error} />}
          {!data && !error && <SkeletonPage />}
          {data  && <Body data={data} primary={primary} accent={accent} brand={brand} />}

          {/* Print-only footer */}
          {data && (
            <div className="print-only" style={{ flexDirection: "column", marginTop: 32 }}>
              <div style={{
                borderTop: "0.5px solid #ddd", paddingTop: 14, textAlign: "center",
              }}>
                <div style={{ fontSize: 7.5, color: "#bbb", lineHeight: 1.6, marginBottom: 8 }}>
                  {brand.footerDisclaimer || "המידע לצורך ניתוח בלבד ואינו מהווה ייעוץ השקעות. אין לראות במידע המלצה לרכישה או מכירה של ניירות ערך."}
                </div>
                <div style={{ fontSize: 10, color: primary, letterSpacing: 2, fontWeight: 700 }}>
                  {brand.fullName || brand.name}
                </div>
                <div style={{ fontSize: 7, color: "#ccc", marginTop: 4 }}>
                  © {new Date().getFullYear()} {brand.fullName || brand.name}. כל הזכויות שמורות.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Error ────────────────────────────────────────────────────────── */

function ErrBlock({ error }: { error: string }) {
  return (
    <div style={{ padding: "48px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 30, marginBottom: 10 }}>⚠️</div>
      <div style={{ fontSize: 14, color: "#666" }}>לא הצלחנו לטעון את הדוח</div>
      <div style={{ fontSize: 11, color: "#aaa", marginTop: 6 }}>{error}</div>
    </div>
  );
}

/* ── Skeleton page ────────────────────────────────────────────────── */

function SkeletonPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Skel w="55%" h={10} />
      <Skel w="75%" h={30} />
      <Skel w="40%" h={12} />
      {/* KPI strip */}
      <div style={{ height: 90, background: "#fff", borderRadius: 14, border: "0.5px solid #e5e5e5" }} />
      {/* Chart */}
      <Skel h={230} />
      {/* Story */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "24px 0" }}>
        <Skel w="90%" h={18} /><Skel w="80%" h={18} /><Skel w="65%" h={18} />
      </div>
    </div>
  );
}

/* ── Body ─────────────────────────────────────────────────────────── */

function Body({ data, primary, accent, brand }: {
  data: ReportPayload; primary: string; accent: string;
  brand: ReturnType<typeof useBrand>;
}) {
  const f = data.fund;
  const m = data.metrics;

  return (
    <>
      {/* ── Hero ── */}
      <div className="onepager-section" style={{ marginBottom: 28 }}>
        {/* Category label above name */}
        <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: accent, fontWeight: 600, marginBottom: 8 }}>
          {data.category.name}
        </div>
        {/* Fund name */}
        <div style={{ fontSize: 32, fontWeight: 700, color: primary, lineHeight: 1.15, marginBottom: 8 }}>
          {f.name}
        </div>
        {/* Meta row */}
        <div style={{ fontSize: 12, color: "#999", display: "flex", flexWrap: "wrap", gap: "3px 10px", marginBottom: data.ai?.character ? 10 : 0 }}>
          {f.manager && <span>{f.manager}</span>}
          {f.manager && <span>•</span>}
          <span>{f.currency}</span>
          {f.aumMillions != null && <><span>•</span><span>AUM {f.aumMillions.toLocaleString("he-IL")}M</span></>}
          {f.startDate && <><span>•</span><span>הוקמה {f.startDate.slice(0, 7)}</span></>}
        </div>
        {/* Character from AI */}
        {data.ai?.character ? (
          <div style={{ fontSize: 14, fontStyle: "italic", color: primary, fontWeight: 400, marginTop: 6 }}>
            {data.ai.character}
          </div>
        ) : !data.aiError && (
          <div style={{ marginTop: 8 }}><Skel w="50%" h={14} /></div>
        )}
      </div>

      {/* ── KPI strip — single card with dividers ── */}
      <div className="onepager-section" style={{ marginBottom: 28 }}>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          background: "#fff", borderRadius: 14, border: "0.5px solid #e5e5e5",
          overflow: "hidden",
        }}>
          {[
            { label: "תשואה מצטברת", value: m.cumulative != null ? pctS(m.cumulative) : "—", color: retColor(m.cumulative), sub: null },
            { label: "שארפ", value: m.sharpe != null ? m.sharpe.toFixed(2) : "—", color: sharpeC(m.sharpe), sub: null },
            { label: "עקביות", value: m.consistencyScore != null ? `${m.consistencyScore.toFixed(0)}%` : "—", color: consC(m.consistencyScore), sub: m.consistencyTotal ? `${m.consistencyWins}/${m.consistencyTotal} חודשים` : null },
            { label: "סטיית תקן", value: pct(m.stdDev), color: "#1a1a1a", sub: null },
          ].map((c, i) => (
            <div key={i} style={{
              padding: "18px 14px", textAlign: "center",
              borderInlineStart: i > 0 ? "0.5px solid #eee" : "none",
            }}>
              <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 500, marginBottom: 6 }}>{c.label}</div>
              <div style={{ fontSize: 30, fontWeight: 300, color: c.color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{c.value}</div>
              {c.sub && <div style={{ fontSize: 10, color: "#bbb", marginTop: 4 }}>{c.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Chart ── */}
      {data.chart.length > 0 && (
        <div className="onepager-section" style={{ marginBottom: 28 }}>
          <div style={{
            background: "#fff", borderRadius: 14, padding: "20px 16px 10px",
            border: "0.5px solid #e5e5e5",
          }}>
            <div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: "#aaa", fontWeight: 500, textAlign: "center", marginBottom: 14 }}>
              תשואה מצטברת מול {data.bmLabel !== "—" ? data.bmLabel : "בנצ׳מרק"}
            </div>
            <div style={{ height: 210 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.chart} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="#f0f0f0" strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={fmtM} tick={{ fontSize: 9.5, fill: "#bbb" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 9.5, fill: "#bbb" }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip
                    labelFormatter={(l) => typeof l === "string" ? fmtML(l) : String(l ?? "")}
                    formatter={(v, name) => [v == null ? "—" : `${v}%`, name === "fund" ? "קרן" : "בנצ׳מרק"]}
                    contentStyle={{ background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 8, fontSize: 11, direction: "rtl" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, color: "#aaa" }} formatter={(v) => v === "fund" ? "קרן" : "בנצ׳מרק"} />
                  <Line type="monotone" dataKey="fund" stroke={primary} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="bm"   stroke={accent}  strokeWidth={1.5} strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── AI story ── */}
      <div className="onepager-section" style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{ fontSize: 10, color: accent, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600, marginBottom: 14 }}>ניתוח AI</div>
        {data.ai ? (
          <div style={{ fontSize: 16, fontWeight: 300, lineHeight: 1.75, color: "#1a1a1a", padding: "0 8px", maxWidth: 580, margin: "0 auto" }}>
            {data.ai.story}
          </div>
        ) : data.aiError ? (
          <div style={{ fontSize: 12, color: "#aaa", fontStyle: "italic" }}>
            הניתוח המילולי אינו זמין כרגע{data.aiError !== "AI not configured" ? ` (${data.aiError})` : ""}.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 520, margin: "0 auto" }}>
            <Skel h={16} /><Skel w="90%" h={16} /><Skel w="78%" h={16} /><Skel w="60%" h={16} />
          </div>
        )}
      </div>

      {/* ── Extremes ── */}
      {(data.extremes.bestMonth || data.extremes.worstMonth) && (
        <div className="onepager-section" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
          {data.extremes.bestMonth && (
            <ExtremeCard
              title="חודש שיא" month={data.extremes.bestMonth.month}
              value={data.extremes.bestMonth.value} color="#059669"
              borderColor="rgba(5,150,105,0.12)" bg="rgba(5,150,105,0.03)"
            />
          )}
          {data.extremes.worstMonth && (
            <ExtremeCard
              title="חודש שפל" month={data.extremes.worstMonth.month}
              value={data.extremes.worstMonth.value} color="#DC2626"
              borderColor="rgba(220,38,38,0.12)" bg="rgba(220,38,38,0.03)"
              extra={
                <>
                  {data.extremes.worstMonth.bmValue !== null && (
                    <div style={{ fontSize: 10, color: "#bbb", marginTop: 6 }}>
                      בנצ׳מרק: {pctS(data.extremes.worstMonth.bmValue)}
                    </div>
                  )}
                  {data.extremes.worstMonth.defenseRatio !== null && data.extremes.worstMonth.defenseRatio > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <span style={{
                        fontSize: 10, color: "#065F46", fontWeight: 600,
                        background: "rgba(5,150,105,0.08)", borderRadius: 6, padding: "3px 12px",
                      }}>
                        הגנה של {(data.extremes.worstMonth.defenseRatio * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </>
              }
            />
          )}
        </div>
      )}

      {/* ── Ranks ── */}
      {data.ranks.totalInCategory > 1 && (
        <div className="onepager-section" style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: 1.5, textAlign: "center", marginBottom: 14 }}>
            מיקום בקטגוריה • {data.ranks.totalInCategory} קרנות
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
            background: "#fff", borderRadius: 14, border: "0.5px solid #e5e5e5", overflow: "hidden",
          }}>
            {[
              { label: "תשואה", rank: data.ranks.byCumulative  },
              { label: "שארפ",  rank: data.ranks.bySharpe      },
              { label: "עקביות",rank: data.ranks.byConsistency },
            ].map((r, i) => {
              const total = data.ranks.totalInCategory;
              const isTop3 = r.rank != null && r.rank <= 3;
              const rc = r.rank === 1 ? "#059669" : r.rank != null && r.rank <= 3 ? "#B8975A" : r.rank != null && r.rank > Math.ceil(total / 2) ? "#DC2626" : primary;
              return (
                <div key={i} style={{
                  textAlign: "center", padding: "18px 10px",
                  borderInlineStart: i > 0 ? "0.5px solid #eee" : "none",
                }}>
                  <div style={{ fontSize: 30, fontWeight: 300, color: rc, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                    {r.rank != null ? r.rank : "—"}
                  </div>
                  {r.rank != null && <div style={{ fontSize: 10, color: "#bbb", marginTop: 2 }}>מתוך {total}</div>}
                  <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6, fontWeight: isTop3 ? 600 : 400 }}>{r.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Strengths / Warnings ── */}
      {(data.ai || !data.aiError) && (
        <div className="onepager-section" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
          <PillarCard
            title="חוזקות" icon="✦" accentColor="#059669"
            bg="rgba(5,150,105,0.03)" borderColor="rgba(5,150,105,0.1)"
            items={data.ai?.strengths ?? null}
          />
          <PillarCard
            title="תשומת לב" icon="⚐" accentColor="#C2410C"
            bg="rgba(217,119,6,0.03)" borderColor="rgba(217,119,6,0.1)"
            items={data.ai?.warnings ?? null}
          />
        </div>
      )}

      {/* ── Verdict ── */}
      <div className="onepager-section" style={{ marginBottom: 28, textAlign: "center" }}>
        {/* Gold divider */}
        <div style={{ width: 40, height: 2, background: accent, margin: "0 auto 12px", borderRadius: 1 }} />
        <div style={{ fontSize: 10, color: accent, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600, marginBottom: 10 }}>
          שורה תחתונה
        </div>
        {data.ai?.verdict ? (
          <div style={{ fontSize: 17, fontWeight: 400, color: primary, lineHeight: 1.6, maxWidth: 560, margin: "0 auto" }}>
            {data.ai.verdict}
          </div>
        ) : !data.aiError ? (
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <Skel h={17} /><div style={{ marginTop: 8 }}><Skel w="75%" h={17} /></div>
          </div>
        ) : null}
      </div>

      {/* ── Screen disclaimer ── */}
      <div className="no-print" style={{
        borderTop: "0.5px solid #e5e5e5", paddingTop: 20, marginTop: 8,
        textAlign: "center", fontSize: 9, color: "#bbb", lineHeight: 1.7,
      }}>
        {brand.footerDisclaimer || "המידע לצורך ניתוח בלבד ואינו מהווה ייעוץ השקעות."}
        <div style={{ marginTop: 3, fontSize: 10, letterSpacing: 1.5, color: primary, fontWeight: 600 }}>
          {brand.fullName || brand.name}
        </div>
        {data.reportMonth && (
          <div style={{ marginTop: 1, fontSize: 9, color: "#ccc" }}>
            נתוני {fmtML(data.reportMonth)}
            {data.cached && <span style={{ marginInlineStart: 8, opacity: 0.6 }}>(cached)</span>}
          </div>
        )}
      </div>
    </>
  );
}

/* ── Sub-components ───────────────────────────────────────────────── */

function ExtremeCard({ title, month, value, color, bg, borderColor, extra }: {
  title: string; month: string; value: number;
  color: string; bg: string; borderColor: string;
  extra?: React.ReactNode;
}) {
  return (
    <div style={{
      background: bg, borderRadius: 12, padding: "16px 18px",
      border: `0.5px solid ${borderColor}`,
      borderInlineStart: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 500 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#555", marginTop: 8, fontWeight: 500 }}>{fmtML(month)}</div>
      <div style={{ fontSize: 34, fontWeight: 300, color, marginTop: 2, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
        {pctS(value)}
      </div>
      {extra}
    </div>
  );
}

function PillarCard({ title, icon, accentColor, bg, borderColor, items }: {
  title: string; icon: string; accentColor: string;
  bg: string; borderColor: string; items: string[] | null;
}) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: "16px 18px", border: `0.5px solid ${borderColor}` }}>
      <div style={{ fontSize: 11, color: accentColor, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginBottom: 12, display: "flex", gap: 6 }}>
        <span>{icon}</span>{title}
      </div>
      {items === null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <Skel h={11} /><Skel w="85%" h={11} /><Skel w="70%" h={11} />
        </div>
      ) : items.length === 0 ? (
        <div style={{ fontSize: 11, color: "#bbb", fontStyle: "italic" }}>—</div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
          {items.map((it, i) => (
            <li key={i} style={{ fontSize: 13, color: "#333", lineHeight: 1.55, paddingInlineStart: 14, position: "relative" }}>
              <span style={{
                position: "absolute", insetInlineStart: 0, top: 7,
                width: 5, height: 5, borderRadius: "50%", background: accentColor,
              }} />
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
