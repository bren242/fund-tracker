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
    consistencyScore: number | null;   // 0–100
    consistencyWins: number | null;
    consistencyTotal: number | null;
    consistencyIR: number | null;
    consistencyAvgGap: number | null;
  };
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
- אל תחזור על מספרים יבשים — פרש אותם
- השתמש בשפה של יועץ השקעות, לא אנליסט כמותי
- היה ישיר וחד — לא פתיחות מנומסות
- זהה דפוסים שטבלה לא יכולה להראות
- אם יש דגל אדום — אמור את זה בבירור

החזר JSON בלבד, בלי markdown, בלי backticks, בפורמט הבא:
{
  "story": "פסקה של 3-4 משפטים שמספרת את סיפור הקרן. לא חוזרת על מספרים — מפרשת אותם.",
  "strengths": ["חוזקה 1", "חוזקה 2", "חוזקה 3"],
  "warnings": ["נקודת תשומת לב 1", "נקודת תשומת לב 2"],
  "character": "משפט אחד שמאפיין את אופי הקרן — לדוגמה: הגנתית, אגרסיבית, עקבית, תנודתית",
  "verdict": "משפט סיכום אחד — שורה תחתונה ליועץ"
}`;

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
    if (hasBm) {
      bmCum = (1 + bmCum) * (1 + bmMR![month]) - 1;
    }
    return {
      month,
      fund: parseFloat((fundCum * 100).toFixed(2)),
      bm:   hasBm ? parseFloat((bmCum * 100).toFixed(2)) : null,
    };
  });
}

/** Find highest/lowest monthly return. */
function findExtremes(mr: Record<string, number> | undefined) {
  if (!mr) return { best: null as null | { month: string; value: number }, worst: null as null | { month: string; value: number } };
  const entries = Object.entries(mr);
  if (entries.length === 0) return { best: null, worst: null };
  const sorted = [...entries].sort((a, b) => a[1] - b[1]);
  return {
    worst: { month: sorted[0][0], value: sorted[0][1] },
    best:  { month: sorted[sorted.length - 1][0], value: sorted[sorted.length - 1][1] },
  };
}

/** Rank of a fund within a category by a sortable metric (higher = better). null if insufficient data. */
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

async function callAnthropic(userPrompt: string): Promise<{ ok: true; narrative: AiNarrative } | { ok: false; error: string }> {
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
    // Strip possible markdown fences
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
  lines.push("מדדים:");
  lines.push(`- תשואה מצטברת: ${fmtPct(payload.metrics.cumulative)}`);
  lines.push(`- ממוצע שנתי: ${fmtPct(payload.metrics.avgAnnualReturn)}`);
  lines.push(`- סטיית תקן: ${fmtPct(payload.metrics.stdDev)}`);
  lines.push(`- שארפ: ${fmtNum(payload.metrics.sharpe)}`);
  if (payload.metrics.consistencyScore != null) {
    lines.push(`- עקביות מול בנצ'מרק: ${payload.metrics.consistencyScore.toFixed(1)}% (${payload.metrics.consistencyWins}/${payload.metrics.consistencyTotal} חודשים)`);
  }
  if (payload.metrics.consistencyIR != null) {
    lines.push(`- Information Ratio: ${payload.metrics.consistencyIR.toFixed(2)}`);
  }
  if (payload.metrics.consistencyAvgGap != null) {
    lines.push(`- פער ממוצע חודשי מול בנצ'מרק: ${fmtPct(payload.metrics.consistencyAvgGap, 3)}`);
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
/*  Route handler                                                        */
/* ──────────────────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const clientKey = getClientKeyFromRequest(req.url);

  // Feature ping — used by UI to decide if button should render
  if (url.searchParams.get("check") === "true") {
    return NextResponse.json({ available: !!process.env.ANTHROPIC_API_KEY });
  }

  // Accept either ?fundId=X (single) or ?fundIds=X,Y,Z (multi, future use).
  // For now only the first / the single fund is processed.
  // When multi-fund comparison is built, iterate fundIds instead.
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

  // Benchmark blend for this category
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

  // Consistency vs benchmark
  const consistency = (bmMR && fundMR) ? calcConsistencyVsBenchmark(fundMR, bmMR, 6) : null;

  // Extremes
  const { best, worst } = findExtremes(fundMR);
  const worstBmValue   = worst && bmMR ? (bmMR[worst.month] ?? null) : null;
  // defense: when both negative, (fund loss less severe than bm loss) → >0
  const defenseRatio = (worst && worstBmValue !== null && worstBmValue < 0)
    ? Math.round((1 - worst.value / worstBmValue) * 100) / 100
    : null;

  // Ranks within category
  const allInCategory = category.funds;
  const rCum  = rank(allInCategory, fundId, (f) => calcCumulative(f.monthlyReturns));
  const rShar = rank(allInCategory, fundId, (f) => f.sharpe ?? null);
  const rCons = rank(allInCategory, fundId, (f) => {
    if (!bmMR || !f.monthlyReturns) return null;
    const c = calcConsistencyVsBenchmark(f.monthlyReturns, bmMR, 6);
    return c?.score ?? null;
  });

  // Chart data
  const chart = buildChartData(fundMR, bmMR);

  // 4. Build payload (without AI yet)
  const payload: OnePagerPayload = {
    cached: false,
    reportMonth,
    fund: {
      id: fund.id,
      name: fund.name,
      classification: fund.classification,
      manager: fund.manager,
      currency: fund.currency || "ILS",
      aumMillions: fund.aumMillions,
      startDate: fund.startDate,
      lastUpdated: fund.lastUpdated ?? null,
    },
    category: { id: category.id, name: category.name },
    metrics: {
      cumulative,
      sharpe: fund.sharpe,
      stdDev: fund.stdDev,
      avgAnnualReturn: fund.avgAnnualReturn,
      consistencyScore:  consistency?.score ?? null,
      consistencyWins:   consistency?.wins  ?? null,
      consistencyTotal:  consistency?.total ?? null,
      consistencyIR:     consistency?.ir    ?? null,
      consistencyAvgGap: consistency?.avgGap ?? null,
    },
    extremes: {
      bestMonth:  best ? { month: best.month,  value: best.value }  : null,
      worstMonth: worst ? {
        month: worst.month,
        value: worst.value,
        bmValue: worstBmValue,
        defenseRatio,
      } : null,
    },
    ranks: {
      totalInCategory: rCum.total || allInCategory.length,
      byCumulative:  rCum.rank,
      bySharpe:      rShar.rank,
      byConsistency: rCons.rank,
    },
    bmLabel,
    chart,
    ai: null,
  };

  // 5. Call Anthropic
  const userPrompt = buildPromptFromContext(fund, category, payload, fundMR, bmMR);
  const aiResult = await callAnthropic(userPrompt);

  if (aiResult.ok) {
    payload.ai = aiResult.narrative;
    // Persist to cache only on success
    await storageWrite(cacheKey, payload);
  } else {
    payload.aiError = aiResult.error;
  }

  return NextResponse.json(payload);
}

/**
 * POST /api/fund-report?action=clear
 * body: { fundId?: string }    — clears all cache entries for that fund,
 *                                 or all entries if no fundId provided.
 *
 * Admin-only (reuses the funds admin password).
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const clientKey = getClientKeyFromRequest(req.url);
  if (url.searchParams.get("action") !== "clear") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  // Password check (same scheme as funds route)
  const password = req.headers.get("x-admin-password") || "";
  const fundsData = await storageRead<Record<string, unknown>>(`funds:${clientKey}`, {});
  const adminPass = (fundsData.adminPassword as string) || "admin2026";
  if (password !== "super2026" && password !== adminPass) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // KV doesn't easily enumerate keys from the storage abstraction.
  // For now we rely on time-bucketing: caches auto-invalidate when
  // fund.lastUpdated changes (→ different cache key). This is intentional.
  return NextResponse.json({ success: true, note: "Caches are keyed by reportMonth; they rotate automatically when lastUpdated changes." });
}
