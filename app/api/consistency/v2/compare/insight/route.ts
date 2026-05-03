/**
 * GET /api/consistency/v2/compare/insight?funds=fund-19,fund-22&client=green
 *
 * AI insight only — 2-3 factual sentences comparing the funds.
 * Slow endpoint, kept off the critical path.
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { storageRead } from "@/lib/storage";
import { FundsData, Fund, Category, Benchmark } from "@/lib/types";
import {
  getWindowEndMonth,
  getBenchmarkForCategory,
  blendBenchmarkReturns,
  buildCategoryAvgReturns,
  computeWindowMetrics,
  computeAllWindows,
  type WindowLabel,
} from "@/lib/consistency";
import { getBenchmarkDescription } from "@/lib/consistency-v2/ai-prompts";
import { makeAICacheKey, getAICache, setAICache } from "@/lib/consistency-v2/ai-cache";
import { callAIWithForbidden } from "@/lib/consistency-v2/ai-caller";

const COMPARE_SYSTEM_PROMPT = `\
אתה מנתח נתוני עקביות של קרנות השקעה עבור יועץ פיננסי. כתוב 2-3 משפטים עובדתיים בלבד.
כללים:
1. עברית בלבד.
2. עובדות ומספרים בלבד — ללא הדרכה, ללא המלצה, ללא שיפוטים.
3. מותר: טווח ערכים, פערים כמותיים, השוואה מספרית.
4. אסור: "מובילה", "עדיפה", "חלשה", "מומלץ", "כדאי", "יועצים", "משקיעים", "השתפרה", "מגמת".
5. ללא disclaimer.

החזר JSON תקין בלבד: {"text": "2-3 משפטים עובדתיים"}`;

const COMPARE_FORBIDDEN = [
  "מובילה", "עדיפה", "חלשה", "מומלץ", "כדאי", "יועצים", "משקיעים", "השתפרה", "מגמת",
];

const HEBREW_MONTHS = [
  "ינואר","פברואר","מרץ","אפריל","מאי","יוני",
  "יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר",
];
function hebrewYM(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return `${HEBREW_MONTHS[mo - 1]} ${y}`;
}

interface CompareInsightOutput { text: string }

export async function GET(req: NextRequest) {
  const sp      = req.nextUrl.searchParams;
  const client  = sp.get("client") ?? "green";
  const fundIds = (sp.get("funds") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  if (fundIds.length < 2 || fundIds.length > 4) {
    return NextResponse.json({ aiInsight: null });
  }

  const [fundsData, benchmarks] = await Promise.all([
    storageRead<FundsData>(`funds:${client}`, { lastUpdated: "", categories: [] }),
    storageRead<Benchmark[]>(`benchmarks:${client}`, []),
  ]);

  const resolved: Array<{ fund: Fund; category: Category }> = [];
  for (const id of fundIds) {
    for (const cat of fundsData.categories) {
      const f = cat.funds.find((f) => f.id === id);
      if (f) { resolved.push({ fund: f, category: cat }); break; }
    }
  }

  if (resolved.length < 2) return NextResponse.json({ aiInsight: null });

  const categoryIds = new Set(resolved.map((r) => r.category.id));
  if (categoryIds.size > 1) return NextResponse.json({ aiInsight: null });

  const category = resolved[0].category;
  const blend = getBenchmarkForCategory(category.id);
  if (!blend) return NextResponse.json({ aiInsight: null });

  const allFunds    = fundsData.categories.flatMap((c) => c.funds);
  const { endMonth } = getWindowEndMonth(allFunds, benchmarks);
  const bmAll        = blendBenchmarkReturns(blend, benchmarks);
  const catAvgAll    = buildCategoryAvgReturns(category.funds);

  const WIN_LABELS: WindowLabel[] = ["YTD", "12M", "24M", "36M", "lifetime"];

  // Build summary for each fund — use the 24M window as primary, fallback to lifetime
  const fundSummaries = resolved.map(({ fund }) => {
    const fundMr = fund.monthlyReturns ?? {};
    const monthKeys: string[] = [], fundReturns: number[] = [];
    const benchmarkReturns: number[] = [], categoryAverageReturns: number[] = [];

    for (const m of Object.keys(fundMr).sort()) {
      const fr = fundMr[m], br = bmAll[m];
      if (fr == null || br == null) continue;
      monthKeys.push(m); fundReturns.push(fr);
      benchmarkReturns.push(br); categoryAverageReturns.push(catAvgAll[m] ?? 0);
    }

    const categoryFundsIRsByWindow: Partial<Record<WindowLabel, number[]>> = {};
    for (const wl of WIN_LABELS) {
      const irs: number[] = [];
      for (const other of category.funds) {
        if (other.id === fund.id) continue;
        const omr = other.monthlyReturns ?? {};
        const oMk: string[] = [], oF: number[] = [], oB: number[] = [], oC: number[] = [];
        for (const m of Object.keys(omr).sort()) {
          const fr = omr[m], br = bmAll[m];
          if (fr == null || br == null) continue;
          oMk.push(m); oF.push(fr); oB.push(br); oC.push(catAvgAll[m] ?? 0);
        }
        const metrics = computeWindowMetrics(oF, oB, oC, oMk, wl, []);
        if (metrics?.informationRatio != null) irs.push(metrics.informationRatio);
      }
      if (irs.length > 0) categoryFundsIRsByWindow[wl] = irs;
    }

    const allWindows = computeAllWindows(
      fundReturns, benchmarkReturns, categoryAverageReturns,
      monthKeys, categoryFundsIRsByWindow
    );

    const w24  = allWindows["24M"];
    const wITD = allWindows.lifetime;
    const primary = w24 ?? wITD;

    return {
      name:     fund.name,
      months:   primary?.monthsCount ?? monthKeys.length,
      ir:       primary?.informationRatio,
      excess:   primary?.excessReturn,
      aboveBm:  primary ? `${primary.monthsAboveBenchmark.count}/${primary.monthsAboveBenchmark.total}` : null,
      mdd:      primary?.maxDrawdown.drawdownPct !== 0 ? primary?.maxDrawdown.drawdownPct : null,
      up:       primary?.upCapture,
      down:     primary?.downCapture,
    };
  });

  const aiInput = {
    category: category.name,
    benchmark: getBenchmarkDescription(category.id),
    asOf: endMonth ? hebrewYM(endMonth) : "",
    funds: fundSummaries,
  };

  const cacheKey = makeAICacheKey("compare", aiInput);
  let ai: CompareInsightOutput | null = await getAICache<CompareInsightOutput>(cacheKey);

  if (!ai) {
    const lines = [
      `השוואה | קטגוריה: ${aiInput.category} | בנצ'מרק: ${aiInput.benchmark} | נכון ל: ${aiInput.asOf}`,
      "",
      ...aiInput.funds.map((f) => [
        `── ${f.name} (${f.months} חודשים) ──`,
        `  IR: ${f.ir != null ? f.ir.toFixed(2) : "—"}`,
        `  עודף על בנצ'מרק: ${f.excess != null ? (f.excess > 0 ? "+" : "") + f.excess.toFixed(1) + "%" : "—"}`,
        `  חודשים מעל בנצ'מרק: ${f.aboveBm ?? "—"}`,
        f.mdd != null ? `  MDD: ${f.mdd.toFixed(1)}%` : null,
        f.up   != null ? `  Up Capture: ${f.up.toFixed(0)}%` : null,
        f.down != null ? `  Down Capture: ${f.down.toFixed(0)}%` : null,
      ].filter(Boolean).join("\n")),
    ];

    const userMessage = lines.join("\n") + "\n\nכתוב תובנה עובדתית כ-JSON.";
    ai = await callAIWithForbidden<CompareInsightOutput>(
      COMPARE_SYSTEM_PROMPT, userMessage, COMPARE_FORBIDDEN, 2, 800
    );
    if (ai) await setAICache(cacheKey, ai);
  }

  return NextResponse.json({ aiInsight: ai });
}
