/**
 * lib/consistency.ts
 * ==================
 * מנוע עקביות — חישוב ביצועי קרן מול בנצ'מרק ומול ממוצע קטגוריה.
 *
 * exports:
 *   getBenchmarkForCategory(categoryId)          → BenchmarkBlend | null
 *   blendBenchmarkReturns(blend, benchmarks)     → Record<string, number>
 *   calcConsistencyVsBenchmark(fund, bm, min)    → ConsistencyResult | null
 *   calcConsistencyVsCategory(fund, cat, min)    → ConsistencyResult | null
 *   calcCategoryAverage(funds, month)            → number | null
 *   buildCategoryAvgReturns(funds)               → Record<string, number>
 *   calcOverallScore(bm, cat)                    → OverallScore | null
 */

import { Fund, Benchmark } from "./types";

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Types                                                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

/** Weight map: benchmarkId → weight. Weights must sum to 1.0. */
export interface BenchmarkBlend {
  [benchmarkId: string]: number;
}

export interface ConsistencyResult {
  /** 0–100: אחוז החודשים בהם הקרן עקפה את הייחוס */
  score: number;
  /** מספר חודשים שהקרן עקפה */
  wins: number;
  /** סה"כ חודשים משותפים */
  total: number;
  /** ממוצע פערים חודשיים (קרן − ייחוס), decimal */
  avgGap: number;
  /** Information Ratio: avgGap ÷ stdDev(gaps), sample. null אם stdDev=0 או total<2 */
  ir: number | null;
}

export interface OverallScore {
  /** 0–100: ממוצע 50/50 של score vs BM + score vs Category */
  score: number;
  bm: ConsistencyResult;
  category: ConsistencyResult;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  1. getBenchmarkForCategory                                                */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * מיפוי קטגוריה → הרכב בנצ'מרק משוקלל.
 * קטגוריות שאין להן מיפוי מחזירות null (אין השוואה לבנצ'מרק).
 */
const CATEGORY_BLEND: Record<string, BenchmarkBlend> = {
  "equity-hedged":  { "bm-ta125": 1.0 },
  "bond-hedged":    { "bm-ta125": 0.15, "bm-telbond-maagar": 0.85 },
  "multi-strategy": { "bm-ta125": 0.30, "bm-telbond-maagar": 0.70 },
};

/**
 * מחזיר את הרכב הבנצ'מרק לקטגוריה.
 * מחזיר null אם אין בנצ'מרק מוגדר לקטגוריה.
 */
export function getBenchmarkForCategory(categoryId: string): BenchmarkBlend | null {
  return CATEGORY_BLEND[categoryId] ?? null;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Blend helper                                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * בונה סדרת תשואות חודשית ממוזגת ממספר בנצ'מרקים ומשקלות.
 * blended[month] = Σ(weight_i × return_i[month])
 * כולל רק חודשים שבהם **כל** הבנצ'מרקים בהרכב מכילים נתון.
 */
export function blendBenchmarkReturns(
  blend: BenchmarkBlend,
  benchmarks: Benchmark[]
): Record<string, number> {
  const bmMap = new Map(
    benchmarks.map((b) => [b.id, b.monthlyReturns ?? {}])
  );

  const bmIds = Object.keys(blend);
  if (bmIds.length === 0) return {};

  // מציא חודשים שנמצאים בכל הבנצ'מרקים בהרכב
  const monthSets = bmIds.map((id) => new Set(Object.keys(bmMap.get(id) ?? {})));
  const commonMonths: Set<string> = monthSets.reduce<Set<string>>(
    (acc, set) => new Set(Array.from(acc).filter((m) => set.has(m))),
    monthSets[0]
  );

  const result: Record<string, number> = {};
  for (const month of Array.from(commonMonths)) {
    let blended = 0;
    for (const [bmId, weight] of Object.entries(blend)) {
      const ret = bmMap.get(bmId)?.[month];
      if (ret == null) continue;
      blended += weight * ret;
    }
    result[month] = blended;
  }
  return result;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Statistics helpers (private)                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** סטיית תקן sample (÷ N-1). מחזיר null אם פחות מ-2 תצפיות. */
function sampleStdDev(arr: number[]): number | null {
  if (arr.length < 2) return null;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Core consistency engine (shared logic)                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

function calcConsistency(
  fundMonthlyReturns: Record<string, number>,
  referenceMonthlyReturns: Record<string, number>,
  minMonths: number,
  withIR: boolean
): ConsistencyResult | null {
  const commonMonths = Object.keys(fundMonthlyReturns)
    .filter((m) => m in referenceMonthlyReturns)
    .sort();

  if (commonMonths.length < minMonths) return null;

  const gaps = commonMonths.map(
    (m) => fundMonthlyReturns[m] - referenceMonthlyReturns[m]
  );

  const wins  = gaps.filter((g) => g > 0).length;
  const total = gaps.length;
  const avg   = mean(gaps);
  const std   = withIR ? sampleStdDev(gaps) : null;
  const ir    = withIR && std !== null && std > 0
    ? Math.round((avg / std) * 1000) / 1000
    : null;

  return {
    score:  Math.round((wins / total) * 10000) / 100,   // 2 d.p., 0–100
    wins,
    total,
    avgGap: Math.round(avg * 1_000_000) / 1_000_000,    // 6 d.p., decimal
    ir,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  2. calcConsistencyVsBenchmark                                             */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * מחשב עקביות קרן מול בנצ'מרק (או בנצ'מרק ממוזג).
 * שני הקלטים: Record<"YYYY-MM", number> עם תשואות עשרוניות.
 * מחזיר null אם פחות מ-minMonths חודשים משותפים.
 */
export function calcConsistencyVsBenchmark(
  fundMonthlyReturns: Record<string, number>,
  benchmarkMonthlyReturns: Record<string, number>,
  minMonths = 12
): ConsistencyResult | null {
  return calcConsistency(fundMonthlyReturns, benchmarkMonthlyReturns, minMonths, true);
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  3. calcConsistencyVsCategory                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * מחשב עקביות קרן מול ממוצע הקטגוריה.
 * categoryAvgMonthlyReturns: מפה מוכנה של חודש → ממוצע קטגוריה.
 * מחזיר null אם פחות מ-minMonths חודשים משותפים.
 * IR לא מחושב (ייחוס קטגוריה — פחות משמעותי).
 */
export function calcConsistencyVsCategory(
  fundMonthlyReturns: Record<string, number>,
  categoryAvgMonthlyReturns: Record<string, number>,
  minMonths = 12
): ConsistencyResult | null {
  return calcConsistency(fundMonthlyReturns, categoryAvgMonthlyReturns, minMonths, false);
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  4. calcCategoryAverage + buildCategoryAvgReturns                          */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * ממוצע אריתמטי של תשואות חודשיות עבור כל הקרנות בקטגוריה לחודש נתון.
 * מחזיר null אם אף קרן אין לה נתון לאותו חודש.
 */
export function calcCategoryAverage(funds: Fund[], month: string): number | null {
  const vals = funds
    .map((f) => f.monthlyReturns?.[month])
    .filter((v): v is number => v != null);

  if (vals.length === 0) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

/**
 * בונה מפה מלאה של ממוצע קטגוריה לכל החודשים הזמינים.
 * נוח להעברה ל-calcConsistencyVsCategory.
 * כולל רק חודשים שלפחות קרן אחת יש לה נתון.
 */
export function buildCategoryAvgReturns(funds: Fund[]): Record<string, number> {
  const monthSet = new Set<string>();
  for (const fund of funds) {
    for (const month of Object.keys(fund.monthlyReturns ?? {})) {
      monthSet.add(month);
    }
  }

  const result: Record<string, number> = {};
  for (const month of Array.from(monthSet)) {
    const avg = calcCategoryAverage(funds, month);
    if (avg !== null) result[month] = avg;
  }
  return result;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  5. calcOverallScore                                                        */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * ציון כולל = ממוצע 50/50 של score vs BM + score vs Category.
 * מחזיר null אם אחד מהם null (נתונים לא מספיקים).
 */
export function calcOverallScore(
  consistencyBM: ConsistencyResult | null,
  consistencyCategory: ConsistencyResult | null
): OverallScore | null {
  if (!consistencyBM || !consistencyCategory) return null;

  return {
    score: Math.round(((consistencyBM.score + consistencyCategory.score) / 2) * 100) / 100,
    bm:       consistencyBM,
    category: consistencyCategory,
  };
}
