/**
 * GET /api/fund-report
 *
 *   ?check=true            → { available: boolean }  (feature ping)
 *   ?fundId=X&client=Y     → One-pager payload: fund data + computed
 *                             metrics + benchmark chart + AI narrative
 *
 * Cache key: `fund-report:{clientKey}:{fundId}:{reportMonth}`
 * (reportMonth = fund.lastUpdated or current month)
 */

export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getClientKeyFromRequest } from "@/lib/clientKey";
import { storageRead, storageWrite } from "@/lib/storage";
import { Fund, Category, FundsData, Benchmark } from "@/lib/types";
import {
  getBenchmarkForCategory,
  blendBenchmarkReturns,
  calcConsistencyVsBenchmark,
} from "@/lib/consistency";

/* ──────────────────────────────────────────────────────────────────── */
/*  Types                                                                */
/* ──────────────────────────────────────────────────────────────────── */

interface AiNarrative {
  story: string;
  strengths: string[];
  warnings: string[];
  character: string;
  verdict: string;
}

interface ChartPoint {
  month: string;
  fund: number;
  bm: number | null;
}

interface TrendMetrics {
  consistency12: { score: number; wins: number; total: number } | null;
  consistency36: { score: number; wins: number; total: number } | null;
  avgGapLast6: number | null;   // decimal — avg (fund−bm) over last 6 shared months
  avgGapPrev6: number | null;   // decimal — avg (fund−bm) over prior 6 shared months
}

interface OnePagerPayload {
  cached: boolean;
  reportMonth: string;
  fund: {
    id: string;
    name: string;
    classification: string;
    manager: string;
    currency: "ILS" | "USD";
    aumMillions: number | null;
    startDate: string | null;
    lastUpdated: string | null;
  };
  category: { id: string; name: string };
  metrics: {
    cumulative: number | null;
    sharpe: number | null;
    stdDev: number | null;
    avgAnnualReturn: number | null;
    consistencyScore: number | null;
    consistencyWins: number | null;
    consistencyTotal: number | null;
    consistencyIR: number | null;
    consistencyAvgGap: number | null;
  };
  trends: TrendMetrics;
  extremes: {
    bestMonth:  { month: string; value: number } | null;
    worstMonth: { month: string; value: number; bmValue: number | null; defenseRatio: number | null } | null;
  };
  ranks: {
    totalInCategory: number;
    byCumulative:  number | null;
    bySharpe:      number | null;
    byConsistency: number | null;
  };
  bmLabel: string;
  chart: ChartPoint[];
  ai: AiNarrative | null;
  aiError?: string;
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Anthropic prompt                                                     */
/* ──────────────────────────────────────────────────────────────────── */

const SYSTEM_PROMPT = `אתה אנליסט השקעות בכיר בישראל. אתה כותב סיכומי קרנות ליועצי השקעות.

כללים:
- כתוב בעברית בלבד
- פרש מספרים — אל תחזור עליהם יבשים
- השתמש בשפה של אנליסט מקצועי, לא שיווקית
- היה ישיר וחד — לא פתיחות מנומסות
- זהה דפוסים שטבלה לא יכולה להראות
- אם יש דגל אדום — אמור את זה בבירור

חשוב מאוד — טון:
- לעולם לא להמליץ פעולה: לא "תעביר", לא "תשקול", לא "מומלץ", לא "כדאי"
- תאר מצב ופרופיל: "מתאים לפרופיל של משקיע שמעדיף...", "פחות מתאים למי שמחפש..."
- דבר בגוף שלישי על הקרן — "הקרן מציגה", "המנהל מפגין"
- אתה לא יועץ ולא ממליץ — אתה מנתח ומתאר

ב-verdict (שורה תחתונה):
- לא "תקנה" / "תמכור" / "תעביר"
- כן: "קרן עם פרופיל הגנתי שמתאימה למשקיע שמעדיף יציבות על פני תשואה מקסימלית"
- כן: "ביצועים יורדים ב-3 חודשים אחרונים דורשים מעקב צמוד"

כשאתה מקבל נתוני מגמות — השתמש בהם. זהה:
- האם העקביות משתפרת או מידרדרת לאורך זמן?
- האם הפער מול הבנצ'מרק גדל או מצטמצם בחודשים האחרונים?
- האם יש שינוי אופי (מהגנתית לאגרסיבית או להפך)?
- האם השנה האחרונה שונה מהכלל?

אם יש מגמה ברורה — אמור את זה בביטחון. אם אין — אל תמציא מגמה.

החזר JSON בלבד, בלי markdown, בלי backticks, בפורמט הבא:
{
  "story": "פסקה של 3-4 משפטים שמספרת את סיפור הקרן. לא חוזרת על מספרים — מפרשת אותם.",
  "strengths": ["חוזקה 1", "חוזקה 2", "חוזקה 3"],
  "warnings": ["נקודת תשומת לב 1", "נקודת תשומת לב 2"],
  "character": "משפט אחד שמאפיין את אופי הקרן — לדוגמה: הגנתית, אגרסיבית, עקבית, תנודתית",
  "verdict": "משפט סיכום אחד — תיאור הפרופיל של הקרן ולמי היא מתאימה. לעולם לא המלצה לפעולה."
}`;

/* ──────────────────────────────────────────────────────────────────── */
/*  Format helpers                                                       */
/* ──────────────────────────────────────────────────────────────────── */

function fmtPct(v: number | null | undefined, dp = 2): string {
  if (v === null || v === undefined) return "לא ידוע";
  return (v * 100).toFixed(dp) + "%";
}
function fmtNum(v: number | null | undefined, dp = 2): string {
  if (v === null || v === undefined) return "לא ידוע";
  return v.toFixed(dp);
}
function fmtMonthHe(ym: string): string {
  const names = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יוני", "יולי", "אוג", "ספט", "אוק", "נוב", "דצמ"];
  const [y, m] = ym.split("-");
  return `${names[parseInt(m, 10) - 1] || m} ${y}`;
}
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Time-range filter (mirrors consistency page logic)                   */
/* ──────────────────────────────────────────────────────────────────── */

function filterByTimeRange(
  mr: Record<string, number>,
  range: "12m" | "36m" | "60m"
): Record<string, number> {
  const n = parseInt(range, 10);
  const today = new Date();
  const cutoff = new Date(today.getFullYear(), today.getMonth() - n, 1);
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
  return Object.fromEntries(Object.entries(mr).filter(([m]) => m >= cutoffStr));
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Helpers                                                              */
/* ──────────────────────────────────────────────────────────────────── */

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function calcCumulative(monthlyReturns: Record<string, number> | undefined): number | null {
  if (!monthlyReturns) return null;
  const keys = Object.keys(monthlyReturns).sort();
  if (keys.length === 0) return null;
  return keys.reduce((acc, k) => acc * (1 + monthlyReturns[k]), 1) - 1;
}

function buildChartData(
  fundMR: Record<string, number> | undefined,
  bmMR:   Record<string, number> | null
): ChartPoint[] {
  if (!fundMR) return [];
  const months = Object.keys(fundMR).sort();
  let fundCum = 0, bmCum = 0;
  return months.map((month) => {
    fundCum = (1 + fundCum) * (1 + fundMR[month]) - 1;
    const hasBm = bmMR && month in bmMR;
    if (hasBm) bmCum = (1 + bmCum) * (1 + bmMR![month]) - 1;
    return {
      month,
      fund: parseFloat((fundCum * 100).toFixed(2)),
      bm:   hasBm ? parseFloat((bmCum * 100).toFixed(2)) : null,
    };
  });
}

function findExtremes(mr: Record<string, number> | undefined) {
  if (!mr) return { best: null as null | { month: string; value: number }, worst: null as null | { month: string; value: number } };
  const entries = Object.entries(mr);
  if (entries.length === 0) return { best: null, worst: null };
  const sorted = [...entries].sort((a, b) => a[1] - b[1]);
  return {
    worst: { month: sorted[0][0],                   value: sorted[0][1] },
    best:  { month: sorted[sorted.length - 1][0],   value: sorted[sorted.length - 1][1] },
  };
}

function rank<T extends Fund>(
  allFunds: T[],
  targetId: string,
  metric: (f: T) => number | null,
): { rank: number | null; total: number } {
  const scored = allFunds
    .map((f) => ({ id: f.id, v: metric(f) }))
    .filter((x): x is { id: string; v: number } => x.v !== null);
  if (scored.length === 0) return { rank: null, total: allFunds.length };
  scored.sort((a, b) => b.v - a.v);
  const idx = scored.findIndex((x) => x.id === targetId);
  return { rank: idx >= 0 ? idx + 1 : null, total: scored.length };
}

/** Compute trend metrics: consistency for 12m/36m + avg gap last6 vs prev6. */
function calcTrends(
  fundMR: Record<string, number> | undefined,
  bmMR:   Record<string, number> | null,
): TrendMetrics {
  const empty: TrendMetrics = { consistency12: null, consistency36: null, avgGapLast6: null, avgGapPrev6: null };
  if (!fundMR || !bmMR) return empty;

  const f12 = filterByTimeRange(fundMR, "12m");
  const b12 = filterByTimeRange(bmMR,   "12m");
  const c12  = calcConsistencyVsBenchmark(f12, b12, 6);

  const f36 = filterByTimeRange(fundMR, "36m");
  const b36 = filterByTimeRange(bmMR,   "36m");
  const c36  = calcConsistencyVsBenchmark(f36, b36, 12);

  // Shared months, sorted
  const shared = Object.keys(fundMR).filter((m) => m in bmMR).sort();
  const last6  = shared.slice(-6);
  const prev6  = shared.slice(-12, -6);

  const avgGapLast6 = last6.length >= 3
    ? mean(last6.map((m) => fundMR[m] - bmMR[m]))
    : null;
  const avgGapPrev6 = prev6.length >= 3
    ? mean(prev6.map((m) => fundMR[m] - bmMR[m]))
    : null;

  return {
    consistency12: c12 ? { score: c12.score, wins: c12.wins, total: c12.total } : null,
    consistency36: c36 ? { score: c36.score, wins: c36.wins, total: c36.total } : null,
    avgGapLast6,
    avgGapPrev6,
  };
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Build user prompt from payload (structured)                          */
/* ──────────────────────────────────────────────────────────────────── */

function buildPromptFromContext(
  fund: Fund,
  category: Category,
  payload: OnePagerPayload,
  fundMR: Record<string, number> | undefined,
  bmMR: Record<string, number> | null,
): string {
  const lines: string[] = [];
  lines.push(`קרן: ${fund.name}`);
  lines.push(`קטגוריה: ${category.name}`);
  lines.push(`מנהל: ${fund.manager || "לא ידוע"}`);
  lines.push(`מטבע: ${fund.currency || "ILS"}`);
  if (fund.aumMillions != null) lines.push(`AUM: ${fund.aumMillions.toLocaleString("he-IL")} מיליון`);
  if (fund.startDate)            lines.push(`הוקמה: ${fund.startDate}`);

  lines.push("");
  lines.push("תשואות שנתיות:");
  const yrs: Array<[string, number | null]> = [
    ["2019", fund.returns.y2019], ["2020", fund.returns.y2020],
    ["2021", fund.returns.y2021], ["2022", fund.returns.y2022],
    ["2023", fund.returns.y2023], ["2024", fund.returns.y2024],
    ["2025", fund.returns.y2025], ["YTD 2026", fund.returns.ytd2026],
  ];
  lines.push(yrs.filter(([, v]) => v != null).map(([lbl, v]) => `${lbl}: ${fmtPct(v)}`).join(", "));

  lines.push("");
  lines.push("מדדים כלליים:");
  lines.push(`- תשואה מצטברת: ${fmtPct(payload.metrics.cumulative)}`);
  lines.push(`- ממוצע שנתי: ${fmtPct(payload.metrics.avgAnnualReturn)}`);
  lines.push(`- סטיית תקן: ${fmtPct(payload.metrics.stdDev)}`);
  lines.push(`- שארפ כולל: ${fmtNum(payload.metrics.sharpe)}`);
  if (payload.metrics.consistencyScore != null) {
    lines.push(`- עקביות מול בנצ'מרק (כל התקופה): ${payload.metrics.consistencyScore.toFixed(1)}% (${payload.metrics.consistencyWins}/${payload.metrics.consistencyTotal} חודשים)`);
  }
  if (payload.metrics.consistencyIR != null) {
    lines.push(`- Information Ratio (כל התקופה): ${payload.metrics.consistencyIR.toFixed(2)}`);
  }
  if (payload.metrics.consistencyAvgGap != null) {
    lines.push(`- פער ממוצע חודשי (כל התקופה): ${fmtPct(payload.metrics.consistencyAvgGap, 3)}`);
  }

  // Trend metrics
  const t = payload.trends;
  if (t.consistency12 || t.consistency36 || t.avgGapLast6 != null || t.avgGapPrev6 != null) {
    lines.push("");
    lines.push("מגמות (חשוב — השתמש בזה לזיהוי שיפור/הידרדרות):");
    if (t.consistency12) {
      lines.push(`- עקביות 12 חודשים אחרונים: ${t.consistency12.score.toFixed(1)}% (${t.consistency12.wins}/${t.consistency12.total})`);
    }
    if (t.consistency36) {
      lines.push(`- עקביות 36 חודשים אחרונים: ${t.consistency36.score.toFixed(1)}% (${t.consistency36.wins}/${t.consistency36.total})`);
    }
    if (t.avgGapLast6 != null) {
      lines.push(`- פער ממוצע חודשי — 6 חודשים אחרונים: ${fmtPct(t.avgGapLast6, 3)}`);
    }
    if (t.avgGapPrev6 != null) {
      lines.push(`- פער ממוצע חודשי — 6 חודשים קודמים: ${fmtPct(t.avgGapPrev6, 3)}`);
    }
  }

  if (payload.extremes.bestMonth) {
    lines.push("");
    lines.push(`חודש שיא: ${fmtMonthHe(payload.extremes.bestMonth.month)} (${fmtPct(payload.extremes.bestMonth.value)})`);
  }
  if (payload.extremes.worstMonth) {
    lines.push(`חודש שפל: ${fmtMonthHe(payload.extremes.worstMonth.month)} (${fmtPct(payload.extremes.worstMonth.value)})`);
    if (payload.extremes.worstMonth.bmValue !== null) {
      lines.push(`BM בחודש שפל: ${fmtPct(payload.extremes.worstMonth.bmValue)}`);
      if (payload.extremes.worstMonth.defenseRatio !== null) {
        lines.push(`הגנה יחסית: ${(payload.extremes.worstMonth.defenseRatio * 100).toFixed(0)}%`);
      }
    }
  }

  if (payload.ranks.totalInCategory > 1) {
    lines.push("");
    lines.push(`מיקום בקטגוריה (${payload.ranks.totalInCategory} קרנות):`);
    if (payload.ranks.byCumulative  != null) lines.push(`- תשואה מצטברת: מקום ${payload.ranks.byCumulative} מתוך ${payload.ranks.totalInCategory}`);
    if (payload.ranks.bySharpe      != null) lines.push(`- שארפ: מקום ${payload.ranks.bySharpe} מתוך ${payload.ranks.totalInCategory}`);
    if (payload.ranks.byConsistency != null) lines.push(`- עקביות: מקום ${payload.ranks.byConsistency} מתוך ${payload.ranks.totalInCategory}`);
  }

  if (fundMR) {
    const last6 = Object.keys(fundMR).sort().slice(-6);
    if (last6.length > 0) {
      lines.push("");
      lines.push("תשואות 6 חודשים אחרונים (קרן | בנצ'מרק):");
      for (const m of last6) {
        const fv = fundMR[m];
        const bv = bmMR?.[m];
        lines.push(`- ${fmtMonthHe(m)}: ${fmtPct(fv)} | ${bv != null ? fmtPct(bv) : "—"}`);
      }
    }
  }

  return lines.join("\n");
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Anthropic call                                                       */
/* ──────────────────────────────────────────────────────────────────── */

async function callAnthropic(
  userPrompt: string,
): Promise<{ ok: true; narrative: AiNarrative } | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: "AI not configured" };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1500,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      console.error("Anthropic error:", res.status, errText);
      return { ok: false, error: `AI service error (${res.status})` };
    }

    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("AI JSON parse failed:", e, "raw:", text.slice(0, 500));
      return { ok: false, error: "AI response not parseable as JSON" };
    }

    const p = parsed as Partial<AiNarrative>;
    if (
      typeof p.story !== "string" ||
      !Array.isArray(p.strengths) ||
      !Array.isArray(p.warnings) ||
      typeof p.character !== "string" ||
      typeof p.verdict !== "string"
    ) {
      return { ok: false, error: "AI response missing required fields" };
    }

    return {
      ok: true,
      narrative: {
        story:     p.story,
        strengths: p.strengths.filter((s) => typeof s === "string").slice(0, 4),
        warnings:  p.warnings.filter((s) => typeof s === "string").slice(0, 4),
        character: p.character,
        verdict:   p.verdict,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Anthropic fetch error:", msg);
    return { ok: false, error: msg.includes("abort") ? "AI timeout" : "AI fetch failed" };
  }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Route handler                                                        */
/* ──────────────────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const clientKey = getClientKeyFromRequest(req.url);

  // Feature ping
  if (url.searchParams.get("check") === "true") {
    return NextResponse.json({ available: !!process.env.ANTHROPIC_API_KEY });
  }

  // Accept ?fundId=X (single) or ?fundIds=X,Y,Z (multi — future use, processes first)
  const fundIdsParam = url.searchParams.get("fundIds");
  const fundId =
    url.searchParams.get("fundId") ||
    (fundIdsParam ? fundIdsParam.split(",")[0].trim() : null);
  if (!fundId) return NextResponse.json({ error: "Missing fundId or fundIds" }, { status: 400 });

  // 1. Load fund + category
  const fundsData = await storageRead<FundsData>(`funds:${clientKey}`, {
    lastUpdated: "", categories: [],
  });

  let fund: Fund | null = null;
  let category: Category | null = null;
  for (const cat of fundsData.categories) {
    const f = cat.funds.find((x) => x.id === fundId);
    if (f) { fund = f; category = cat; break; }
  }
  if (!fund || !category) {
    return NextResponse.json({ error: "Fund not found" }, { status: 404 });
  }

  const reportMonth = fund.lastUpdated || currentMonthKey();
  const cacheKey = `fund-report:${clientKey}:${fundId}:${reportMonth}`;

  // 2. Check cache
  const force = url.searchParams.get("force") === "true";
  if (!force) {
    const cached = await storageRead<OnePagerPayload | null>(cacheKey, null);
    if (cached && cached.ai) {
      cached.cached = true;
      return NextResponse.json(cached);
    }
  }

  // 3. Compute metrics
  const fundMR = fund.monthlyReturns;
  const cumulative = calcCumulative(fundMR);

  const blend = getBenchmarkForCategory(category.id);
  const benchmarks = await storageRead<Benchmark[]>(`benchmarks:${clientKey}`, []);
  const bmMR: Record<string, number> | null = blend
    ? blendBenchmarkReturns(blend, benchmarks.filter((b) => b.active))
    : null;

  const bmLabel = blend
    ? Object.entries(blend).map(([id, w]) => {
        const bm = benchmarks.find((b) => b.id === id);
        return `${Math.round(w * 100)}% ${bm?.name || id}`;
      }).join(" + ")
    : "—";

  const consistency = (bmMR && fundMR) ? calcConsistencyVsBenchmark(fundMR, bmMR, 6) : null;
  const trends      = calcTrends(fundMR, bmMR);

  const { best, worst } = findExtremes(fundMR);
  const worstBmValue   = worst && bmMR ? (bmMR[worst.month] ?? null) : null;
  const defenseRatio   = (worst && worstBmValue !== null && worstBmValue < 0)
    ? Math.round((1 - worst.value / worstBmValue) * 100) / 100
    : null;

  const allInCategory = category.funds;
  const rCum  = rank(allInCategory, fundId, (f) => calcCumulative(f.monthlyReturns));
  const rShar = rank(allInCategory, fundId, (f) => f.sharpe ?? null);
  const rCons = rank(allInCategory, fundId, (f) => {
    if (!bmMR || !f.monthlyReturns) return null;
    return calcConsistencyVsBenchmark(f.monthlyReturns, bmMR, 6)?.score ?? null;
  });

  const chart = buildChartData(fundMR, bmMR);

  // 4. Build payload
  const payload: OnePagerPayload = {
    cached: false,
    reportMonth,
    fund: {
      id: fund.id, name: fund.name, classification: fund.classification,
      manager: fund.manager, currency: fund.currency || "ILS",
      aumMillions: fund.aumMillions, startDate: fund.startDate,
      lastUpdated: fund.lastUpdated ?? null,
    },
    category: { id: category.id, name: category.name },
    metrics: {
      cumulative, sharpe: fund.sharpe, stdDev: fund.stdDev,
      avgAnnualReturn: fund.avgAnnualReturn,
      consistencyScore:  consistency?.score ?? null,
      consistencyWins:   consistency?.wins  ?? null,
      consistencyTotal:  consistency?.total ?? null,
      consistencyIR:     consistency?.ir    ?? null,
      consistencyAvgGap: consistency?.avgGap ?? null,
    },
    trends,
    extremes: {
      bestMonth:  best  ? { month: best.month,  value: best.value  } : null,
      worstMonth: worst ? { month: worst.month, value: worst.value, bmValue: worstBmValue, defenseRatio } : null,
    },
    ranks: {
      totalInCategory: rCum.total || allInCategory.length,
      byCumulative: rCum.rank, bySharpe: rShar.rank, byConsistency: rCons.rank,
    },
    bmLabel,
    chart,
    ai: null,
  };

  // 5. Call Anthropic
  const userPrompt = buildPromptFromContext(fund, category, payload, fundMR, bmMR);
  const aiResult   = await callAnthropic(userPrompt);

  if (aiResult.ok) {
    payload.ai = aiResult.narrative;
    await storageWrite(cacheKey, payload);
  } else {
    payload.aiError = aiResult.error;
  }

  return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const clientKey = getClientKeyFromRequest(req.url);
  if (url.searchParams.get("action") !== "clear") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  const password = req.headers.get("x-admin-password") || "";
  const fundsData = await storageRead<Record<string, unknown>>(`funds:${clientKey}`, {});
  const adminPass = (fundsData.adminPassword as string) || "admin2026";
  if (password !== "super2026" && password !== adminPass) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ success: true, note: "Caches are keyed by reportMonth; they rotate automatically when lastUpdated changes." });
}
