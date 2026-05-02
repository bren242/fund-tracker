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

import { Fund, Benchmark, FundsData } from "./types";
import { monthlyCategoryAverage } from "./category-average";

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
/*  5. consistencyVsCategory                                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface CategoryConsistencyResult {
  /** חודשים שבהם הקרן עקפה את ממוצע הקטגוריה */
  monthsAboveCategory: number;
  /** חודשים שבהם הקרן הייתה מתחת לממוצע הקטגוריה */
  monthsBelowCategory: number;
  /** סה"כ חודשים שבהם גם לקרן וגם לממוצע הקטגוריה יש נתון */
  totalMonths: number;
  /** אחוז החודשים שהקרן עקפה את הקטגוריה (0–100, 2 d.p.) */
  percentageAbove: number;
  /** true אם יש פחות מ-12 חודשי השוואה משותפים */
  insufficientData: boolean;
}

/**
 * מחשב לכל חודש שיש לקרן האם ביצועיה מעל ממוצע הקטגוריה.
 * משתמש ב-monthlyCategoryAverage (מינימום 3 קרנות בקטגוריה לכל חודש).
 * חודשים שבהם אין מספיק נתוני קטגוריה מדולגים.
 */
export function consistencyVsCategory(
  fund: Fund,
  fundsData: FundsData,
  categoryId: string
): CategoryConsistencyResult {
  const fundReturns = fund.monthlyReturns ?? {};
  const months = Object.keys(fundReturns).sort();

  let above = 0;
  let below = 0;
  let total = 0;

  for (const m of months) {
    const catAvg = monthlyCategoryAverage(fundsData, categoryId, m);
    if (catAvg == null) continue; // פחות מ-3 קרנות בקטגוריה לחודש זה
    total++;
    if (fundReturns[m] > catAvg) above++;
    else below++;
  }

  return {
    monthsAboveCategory: above,
    monthsBelowCategory: below,
    totalMonths: total,
    percentageAbove:
      total > 0 ? Math.round((above / total) * 10_000) / 100 : 0,
    insufficientData: total < 12,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  6. calcOverallScore                                                        */
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

/* ══════════════════════════════════════════════════════════════════════════ */
/*  V2 — Types                                                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface WorstMonth {
  monthKey: string;
  monthLabelHebrew: string;
  fundReturn: number;
  benchmarkReturn: number;
  categoryAverageReturn: number | null;
  fundVsBenchmark: number;
}

export interface CategoryFundStat {
  fundId: string;
  fundName: string;
  ir: number;
}

export interface CategoryStats {
  categoryKey: string;
  categoryLabel: string;
  fundCount: number;
  averageIR: number;
  funds: CategoryFundStat[];
}

export interface SameMonthCohortPosition {
  fundReturn: number;
  rank: number;
  total: number;
  percentile: number;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  V2 — Private helpers                                                       */
/* ══════════════════════════════════════════════════════════════════════════ */

const HEBREW_MONTH_NAMES = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

function hebrewMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  return `${HEBREW_MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  V2 — 7. windowMonthKeys                                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Generates the list of YYYY-MM month keys for a rolling window.
 * Returns exactly windowSize months ending at endMonth (inclusive), ascending.
 */
export function windowMonthKeys(endMonth: string, windowSize: number): string[] {
  const [y, m] = endMonth.split("-").map(Number);
  const months: string[] = [];
  for (let i = windowSize - 1; i >= 0; i--) {
    const t = y * 12 + m - 1 - i;
    const yr = Math.floor(t / 12);
    const mo = (t % 12) + 1;
    months.push(`${yr}-${String(mo).padStart(2, "0")}`);
  }
  return months;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  V2 — 8. computeCategoryAverageReturn                                       */
/* ══════════════════════════════════════════════════════════════════════════ */

const MIN_FUNDS_COHORT = 3;

/**
 * Arithmetic average of monthlyReturns[monthKey] across funds.
 * Returns null if fewer than 3 funds have data for that month.
 */
export function computeCategoryAverageReturn(
  categoryFunds: Fund[],
  monthKey: string
): number | null {
  const vals = categoryFunds
    .map((f) => f.monthlyReturns?.[monthKey])
    .filter((v): v is number => v != null && !Number.isNaN(v));
  if (vals.length < MIN_FUNDS_COHORT) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  V2 — 9. computeWorstMonth                                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Finds the month in windowMonths where (fundReturn − benchmarkReturn) is lowest.
 * Returns null if there is no month where both fund and benchmark have data.
 *
 * categoryFunds: all funds in the same category (including subject fund),
 * used to compute the category average for the identified worst month.
 */
export function computeWorstMonth(
  fund: Fund,
  benchmarkReturns: Record<string, number>,
  categoryFunds: Fund[],
  windowMonths: string[]
): WorstMonth | null {
  const mr = fund.monthlyReturns ?? {};

  let worstKey: string | null = null;
  let worstExcess = Infinity;

  for (const m of windowMonths) {
    const fr = mr[m];
    const br = benchmarkReturns[m];
    if (fr == null || br == null) continue;
    const excess = fr - br;
    if (excess < worstExcess) {
      worstExcess = excess;
      worstKey = m;
    }
  }

  if (worstKey === null) return null;

  return {
    monthKey: worstKey,
    monthLabelHebrew: hebrewMonthLabel(worstKey),
    fundReturn: mr[worstKey]!,
    benchmarkReturn: benchmarkReturns[worstKey]!,
    categoryAverageReturn: computeCategoryAverageReturn(categoryFunds, worstKey),
    fundVsBenchmark: worstExcess,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  V2 — 10. computeCategoryStats                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Computes IR for every fund in the category over windowMonths.
 * Only funds with a valid (non-null) IR are included.
 * Result is sorted descending by IR.
 * averageIR is the mean IR across all qualifying funds.
 * fundCount is the number of qualifying funds.
 */
export function computeCategoryStats(
  categoryKey: string,
  categoryLabel: string,
  categoryFunds: Fund[],
  benchmarkReturns: Record<string, number>,
  windowMonths: string[],
  minMonths = 12
): CategoryStats {
  const fundStats: CategoryFundStat[] = [];

  for (const fund of categoryFunds) {
    const mr = fund.monthlyReturns ?? {};
    const fundWindow: Record<string, number> = {};
    const bmWindow: Record<string, number> = {};
    for (const m of windowMonths) {
      if (mr[m] != null) fundWindow[m] = mr[m];
      if (benchmarkReturns[m] != null) bmWindow[m] = benchmarkReturns[m];
    }
    const result = calcConsistencyVsBenchmark(fundWindow, bmWindow, minMonths);
    if (result?.ir != null) {
      fundStats.push({ fundId: fund.id, fundName: fund.name, ir: result.ir });
    }
  }

  fundStats.sort((a, b) => b.ir - a.ir);

  const averageIR =
    fundStats.length > 0
      ? Math.round(
          (fundStats.reduce((s, f) => s + f.ir, 0) / fundStats.length) * 1000
        ) / 1000
      : 0;

  return { categoryKey, categoryLabel, fundCount: fundStats.length, averageIR, funds: fundStats };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  V2 — 11. computeSameMonthCohortPosition                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Returns rank and percentile of a fund within its category for a specific month.
 *
 * rank 1 = best performer. percentile = % of OTHER funds in the category
 * that the subject fund outperformed (e.g., 78 means "beat 78% of peers").
 *
 * Returns null if the fund has no return for monthKey or is the only fund
 * with data that month.
 */
export function computeSameMonthCohortPosition(
  fund: Fund,
  categoryFunds: Fund[],
  monthKey: string
): SameMonthCohortPosition | null {
  const fundReturn = fund.monthlyReturns?.[monthKey];
  if (fundReturn == null) return null;

  const otherReturns = categoryFunds
    .filter((f) => f.id !== fund.id)
    .map((f) => f.monthlyReturns?.[monthKey])
    .filter((v): v is number => v != null && !Number.isNaN(v));

  if (otherReturns.length === 0) return null;

  const strictlyAbove = otherReturns.filter((r) => r > fundReturn).length;
  const beaten        = otherReturns.filter((r) => fundReturn > r).length;

  return {
    fundReturn,
    rank:       1 + strictlyAbove,
    total:      otherReturns.length + 1,
    percentile: Math.round((beaten / otherReturns.length) * 100),
  };
}
