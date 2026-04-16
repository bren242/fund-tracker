"use client";

/**
 * FundOnePagerModal
 * ─────────────────
 * Premium AI-generated one-pager for a single fund.
 * Fetched from /api/fund-report. Shows skeleton for AI parts while
 * the Anthropic call is in flight. Prints cleanly via window.print().
 */

import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useBrand } from "@/lib/useBrand";

interface ChartPoint { month: string; fund: number; bm: number | null }
interface AiNarrative {
  story: string;
  strengths: string[];
  warnings: string[];
  character: string;
  verdict: string;
}
interface ReportPayload {
  cached: boolean;
  reportMonth: string;
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
  extremes: {
    bestMonth:  { month: string; value: number } | null;
    worstMonth: { month: string; value: number; bmValue: number | null; defenseRatio: number | null } | null;
  };
  ranks: { totalInCategory: number; byCumulative: number | null; bySharpe: number | null; byConsistency: number | null };
  bmLabel: string;
  chart: ChartPoint[];
  ai: AiNarrative | null;
  aiError?: string;
}

const MONTH_HE: Record<string, string> = {
  "01": "ינו", "02": "פבר", "03": "מרץ", "04": "אפר",
  "05": "מאי", "06": "יוני", "07": "יולי", "08": "אוג",
  "09": "ספט", "10": "אוק", "11": "נוב", "12": "דצמ",
};

function fmtMonth(m: string): string {
  const [y, mo] = m.split("-");
  return `${MONTH_HE[mo] || mo} '${y.slice(2)}`;
}
function fmtMonthLong(m: string): string {
  const [y, mo] = m.split("-");
  return `${MONTH_HE[mo] || mo} ${y}`;
}
function fmtPct(v: number | null | undefined, dp = 1): string {
  if (v === null || v === undefined) return "—";
  return (v * 100).toFixed(dp) + "%";
}
function fmtPctSigned(v: number | null | undefined, dp = 2): string {
  if (v === null || v === undefined) return "—";
  const s = (v * 100).toFixed(dp) + "%";
  return v > 0 ? "+" + s : s;
}

function returnColor(v: number | null | undefined): string {
  if (v === null || v === undefined) return "var(--text-muted)";
  if (v > 0) return "#059669";
  if (v < 0) return "#DC2626";
  return "var(--text-primary)";
}
function sharpeColor(s: number | null): string {
  if (s === null) return "var(--text-muted)";
  if (s >= 1)   return "#059669";
  if (s >= 0.5) return "#B8975A";
  return "#DC2626";
}
function consistencyColor(score: number | null): string {
  if (score === null) return "var(--text-muted)";
  if (score >= 55) return "#059669";
  if (score >= 45) return "#B8975A";
  return "#DC2626";
}

// ── Component ────────────────────────────────────────────────────────

export default function FundOnePagerModal({
  fundId, clientKey, onClose,
}: {
  fundId: string;
  clientKey: string;
  onClose: () => void;
}) {
  const brand = useBrand(clientKey);
  const [data, setData] = useState<ReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Fetch payload
  useEffect(() => {
    let abort = false;
    setError(null);
    setData(null);
    fetch(`/api/fund-report?fundId=${encodeURIComponent(fundId)}&client=${encodeURIComponent(clientKey)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Request failed");
        return r.json();
      })
      .then((d: ReportPayload) => { if (!abort) setData(d); })
      .catch((e: Error) => { if (!abort) setError(e.message); });
    return () => { abort = true; };
  }, [fundId, clientKey]);

  const primary = brand.primaryColor || "#1B3A2F";
  const accent  = brand.accentColor  || "#B8975A";

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .one-pager-root, .one-pager-root * { visibility: visible; }
          .one-pager-overlay { position: absolute !important; background: none !important; padding: 0 !important; }
          .one-pager-root {
            position: absolute !important; inset: 0 !important;
            box-shadow: none !important; border-radius: 0 !important;
            max-width: 100% !important; width: 100% !important;
            max-height: none !important; overflow: visible !important;
            padding: 24px !important;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div
        className="one-pager-overlay"
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20, direction: "rtl",
          backdropFilter: "blur(4px)",
        }}
      >
        <div
          className="one-pager-root"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "var(--bg-page)",
            borderRadius: 16,
            maxWidth: 760, width: "100%",
            maxHeight: "94vh",
            overflowY: "auto",
            padding: "28px 32px 32px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            position: "relative",
          }}
        >
          {/* Top bar: logo + close + print */}
          <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500, letterSpacing: 0.4 }}>
              ONE PAGER • {brand.fullName || brand.name || "Fund Tracker"}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => window.print()}
                disabled={!data}
                style={{
                  fontSize: 12, padding: "6px 12px", borderRadius: 6,
                  border: `1px solid ${accent}`, color: accent, background: "transparent",
                  cursor: data ? "pointer" : "default", opacity: data ? 1 : 0.4,
                  fontWeight: 600, letterSpacing: 0.3,
                }}
              >הדפסה</button>
              <button
                onClick={onClose}
                aria-label="סגור"
                style={{
                  fontSize: 18, width: 30, height: 30, borderRadius: "50%",
                  border: "1px solid var(--border)", background: "var(--bg-surface)",
                  color: "var(--text-secondary)", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >×</button>
            </div>
          </div>

          <div style={{ height: 2, background: `linear-gradient(90deg, ${primary}, ${accent}, transparent)`, marginBottom: 24, opacity: 0.8 }} />

          {error && <ErrorBlock error={error} />}
          {!data && !error && <SkeletonLayout />}
          {data && <Body data={data} primary={primary} accent={accent} brand={brand} />}
        </div>
      </div>
    </>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function ErrorBlock({ error }: { error: string }) {
  return (
    <div style={{ padding: "40px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>לא הצלחנו לטעון את הדוח</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>{error}</div>
    </div>
  );
}

function SkeletonLayout() {
  const skelBg = "linear-gradient(90deg, var(--bg-surface) 0%, var(--bg-surface-alt) 50%, var(--bg-surface) 100%)";
  const skel = (w: string, h: number): React.CSSProperties => ({
    width: w, height: h, borderRadius: 6,
    background: skelBg, backgroundSize: "200% 100%",
    animation: "skeletonShimmer 1.4s infinite",
  });
  return (
    <>
      <style>{`@keyframes skeletonShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      <div style={skel("70%", 28)} />
      <div style={{ ...skel("40%", 14), marginTop: 8 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 24 }}>
        {[1,2,3,4].map(i => <div key={i} style={skel("100%", 88)} />)}
      </div>
      <div style={{ ...skel("100%", 220), marginTop: 24 }} />
      <div style={{ ...skel("100%", 80), marginTop: 24 }} />
    </>
  );
}

function Body({ data, primary, accent, brand }: {
  data: ReportPayload;
  primary: string; accent: string;
  brand: ReturnType<typeof useBrand>;
}) {
  const f = data.fund;
  const m = data.metrics;

  // Metric cards
  const cards = [
    { label: "תשואה מצטברת", value: m.cumulative != null ? fmtPctSigned(m.cumulative) : "—", color: returnColor(m.cumulative), size: 22 },
    { label: "שארפ",          value: m.sharpe != null ? m.sharpe.toFixed(2) : "—", color: sharpeColor(m.sharpe), size: 22 },
    { label: "עקביות",         value: m.consistencyScore != null ? `${m.consistencyScore.toFixed(0)}%` : "—", color: consistencyColor(m.consistencyScore), size: 22 },
    { label: "סטיית תקן",      value: fmtPct(m.stdDev), color: "var(--text-primary)", size: 22 },
  ];

  return (
    <>
      {/* Identity */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>
          {f.name}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
          <span>{data.category.name}</span>
          <span style={{ color: "var(--text-muted)" }}>•</span>
          <span>{f.manager || "—"}</span>
          <span style={{ color: "var(--text-muted)" }}>•</span>
          <span>{f.currency}</span>
          {f.aumMillions != null && <>
            <span style={{ color: "var(--text-muted)" }}>•</span>
            <span>AUM {f.aumMillions.toLocaleString("he-IL")}M</span>
          </>}
          {f.startDate && <>
            <span style={{ color: "var(--text-muted)" }}>•</span>
            <span>הוקמה {f.startDate.slice(0, 7)}</span>
          </>}
        </div>
        {data.ai?.character && (
          <div style={{ fontSize: 13, color: primary, marginTop: 10, fontStyle: "italic", fontWeight: 500 }}>
            אופי: {data.ai.character}
          </div>
        )}
      </div>

      {/* 4 metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
        {cards.map((c, i) => (
          <div key={i} style={{
            background: "var(--bg-surface)", borderRadius: 10, padding: "14px 12px",
            textAlign: "center", border: "1px solid var(--border)",
          }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500 }}>{c.label}</div>
            <div style={{ fontSize: c.size, fontWeight: 700, color: c.color, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      {data.chart.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500 }}>
            תשואה מצטברת מול {data.bmLabel || "בנצ'מרק"}
          </div>
          <div style={{ height: 220, background: "var(--bg-surface)", borderRadius: 10, padding: "12px 8px 4px", border: "1px solid var(--border)" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.chart} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="2 3" vertical={false} />
                <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={38} />
                <Tooltip
                  labelFormatter={(label) => typeof label === "string" ? fmtMonthLong(label) : String(label ?? "")}
                  formatter={(v, name) => [
                    v == null ? "—" : `${v}%`,
                    name === "fund" ? "קרן" : "בנצ'מרק",
                  ]}
                  contentStyle={{ background: "var(--bg-page)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(val) => val === "fund" ? "קרן" : "בנצ'מרק"} />
                <Line type="monotone" dataKey="fund" stroke={primary} strokeWidth={2.2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="bm"   stroke={accent}  strokeWidth={1.6} strokeDasharray="4 4" dot={false} isAnimationActive={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Story */}
      <Section title="סיפור הקרן">
        {data.ai ? (
          <div style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text-primary)" }}>{data.ai.story}</div>
        ) : data.aiError ? (
          <AiUnavailable error={data.aiError} />
        ) : (
          <LineSkeletons lines={4} />
        )}
      </Section>

      {/* Best/Worst month */}
      {(data.extremes.bestMonth || data.extremes.worstMonth) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
          {data.extremes.bestMonth && (
            <ExtremeCard
              title="חודש שיא"
              month={data.extremes.bestMonth.month}
              value={data.extremes.bestMonth.value}
              accentColor="#059669"
            />
          )}
          {data.extremes.worstMonth && (
            <ExtremeCard
              title="חודש שפל"
              month={data.extremes.worstMonth.month}
              value={data.extremes.worstMonth.value}
              accentColor="#DC2626"
              extra={
                data.extremes.worstMonth.bmValue !== null ? (
                  <>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                      BM: {fmtPctSigned(data.extremes.worstMonth.bmValue)}
                    </div>
                    {data.extremes.worstMonth.defenseRatio !== null && data.extremes.worstMonth.defenseRatio > 0 && (
                      <div style={{ fontSize: 11, color: "#059669", marginTop: 2, fontWeight: 600 }}>
                        הגנה: {(data.extremes.worstMonth.defenseRatio * 100).toFixed(0)}%
                      </div>
                    )}
                  </>
                ) : null
              }
            />
          )}
        </div>
      )}

      {/* Ranks */}
      {data.ranks.totalInCategory > 1 && (
        <div style={{ marginBottom: 24, background: "var(--bg-surface)", borderRadius: 10, padding: "14px 18px", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500, marginBottom: 10 }}>
            מיקום בקטגוריה • {data.ranks.totalInCategory} קרנות
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            <RankCell label="תשואה"  rank={data.ranks.byCumulative}  total={data.ranks.totalInCategory} />
            <RankCell label="שארפ"    rank={data.ranks.bySharpe}      total={data.ranks.totalInCategory} />
            <RankCell label="עקביות"  rank={data.ranks.byConsistency} total={data.ranks.totalInCategory} />
          </div>
        </div>
      )}

      {/* Strengths / Warnings */}
      {(data.ai || !data.aiError) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
          <PillarCard
            title="חוזקות"
            icon="✦"
            bg="rgba(5,150,105,0.06)"
            borderColor="rgba(5,150,105,0.25)"
            accentColor="#059669"
            items={data.ai?.strengths ?? null}
          />
          <PillarCard
            title="תשומת לב"
            icon="⚐"
            bg="rgba(217,119,6,0.06)"
            borderColor="rgba(217,119,6,0.25)"
            accentColor="#C2410C"
            items={data.ai?.warnings ?? null}
          />
        </div>
      )}

      {/* Verdict */}
      {data.ai?.verdict && (
        <div style={{
          background: primary, color: "#fff",
          borderRadius: 10, padding: "16px 20px",
          fontSize: 14, fontWeight: 500, textAlign: "center",
          marginBottom: 20, lineHeight: 1.5,
        }}>
          <div style={{ fontSize: 10, opacity: 0.7, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>שורה תחתונה</div>
          {data.ai.verdict}
        </div>
      )}
      {!data.ai && !data.aiError && (
        <LineSkeletons lines={2} height={50} />
      )}

      {/* Footer disclaimer */}
      <div style={{
        marginTop: 24, paddingTop: 16,
        borderTop: "1px solid var(--border)",
        textAlign: "center", fontSize: 10, color: "var(--text-muted)", lineHeight: 1.6,
      }}>
        {brand.footerDisclaimer || "המידע לצורך ניתוח בלבד ואינו מהווה ייעוץ השקעות."}
        <div style={{ marginTop: 4, opacity: 0.7 }}>
          {brand.fullName || brand.name || "Fund Tracker"}
          {data.reportMonth && ` • נתוני ${fmtMonthLong(data.reportMonth)}`}
          {data.cached && <span className="no-print" style={{ marginInlineStart: 6, opacity: 0.5 }}>(cached)</span>}
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      marginBottom: 24, background: "var(--bg-surface)",
      borderRadius: 12, padding: "16px 20px", border: "1px solid var(--border)",
    }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function ExtremeCard({ title, month, value, accentColor, extra }: {
  title: string; month: string; value: number; accentColor: string; extra?: React.ReactNode;
}) {
  return (
    <div style={{
      background: "var(--bg-surface)", borderRadius: 10,
      padding: "14px 16px", border: "1px solid var(--border)",
      borderInlineStart: `3px solid ${accentColor}`,
    }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500 }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 6, fontWeight: 500 }}>
        {fmtMonthLong(month)}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accentColor, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
        {fmtPctSigned(value)}
      </div>
      {extra}
    </div>
  );
}

function RankCell({ label, rank, total }: { label: string; rank: number | null; total: number }) {
  const color = rank === null ? "var(--text-muted)"
             : rank === 1    ? "#059669"
             : rank <= 3     ? "#B8975A"
             : rank <= Math.ceil(total / 2) ? "var(--text-primary)"
             : "#DC2626";
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {rank !== null ? `${rank}/${total}` : "—"}
      </div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 500, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function PillarCard({ title, icon, bg, borderColor, accentColor, items }: {
  title: string; icon: string; bg: string; borderColor: string; accentColor: string;
  items: string[] | null;
}) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: "14px 16px", border: `1px solid ${borderColor}` }}>
      <div style={{ fontSize: 11, color: accentColor, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <span>{icon}</span>{title}
      </div>
      {items === null ? (
        <LineSkeletons lines={3} />
      ) : items.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>—</div>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {items.map((it, i) => (
            <li key={i} style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6, paddingInlineStart: 14, position: "relative" }}>
              <span style={{ position: "absolute", insetInlineStart: 0, top: 7, width: 5, height: 5, borderRadius: "50%", background: accentColor }} />
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LineSkeletons({ lines = 3, height = 12 }: { lines?: number; height?: number }) {
  return (
    <>
      <style>{`@keyframes skeletonShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} style={{
            height, borderRadius: 4,
            width: i === lines - 1 ? "70%" : "100%",
            background: "linear-gradient(90deg, var(--bg-surface-alt) 0%, var(--bg-surface) 50%, var(--bg-surface-alt) 100%)",
            backgroundSize: "200% 100%",
            animation: "skeletonShimmer 1.4s infinite",
          }} />
        ))}
      </div>
    </>
  );
}

function AiUnavailable({ error }: { error: string }) {
  return (
    <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
      הניתוח המילולי אינו זמין כרגע{error ? ` (${error})` : ""}.
    </div>
  );
}
