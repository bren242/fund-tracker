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
  /** % months above benchmark, 0-100 */
  score: number;
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
      fundStats.push({ fundId: fund.id, fundName: fund.name, ir: result.ir, score: result.score });
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

/* ══════════════════════════════════════════════════════════════════════════ */
/*  V2 — 12. getWindowEndMonth  (dynamic, data-driven)                         */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface WindowEndInfo {
  /** Final window end month, YYYY-MM */
  endMonth: string;
  endMonthLabel: string;
  /** Median last-month across all funds with data */
  consensusFundMonth: string;
  /** Min last-month across benchmarks used in any CATEGORY_BLEND entry */
  benchmarkCeiling: string;
  /** Fund IDs whose last data month is behind endMonth */
  partialFundIds: string[];
}

/**
 * Derives the dynamic window end month from real data.
 *
 * Algorithm:
 *   1. For every fund: find its last YYYY-MM with a monthly return.
 *   2. Sort those months ascending; take the median → "consensus fund month".
 *      Funds below the median are "partial" — they don't block the window.
 *   3. For every benchmark referenced in CATEGORY_BLEND: find its last month.
 *      Take the minimum → "benchmark ceiling" (hard cap).
 *   4. endMonth = min(consensusFundMonth, benchmarkCeiling).
 */
export function getWindowEndMonth(
  allFunds: Fund[],
  benchmarks: Benchmark[]
): WindowEndInfo {
  // Step 1: collect last month per fund
  const fundData: Array<{ id: string; lastMonth: string }> = [];
  for (const fund of allFunds) {
    const months = Object.keys(fund.monthlyReturns ?? {}).sort();
    if (months.length > 0) {
      fundData.push({ id: fund.id, lastMonth: months[months.length - 1] });
    }
  }

  if (fundData.length === 0) {
    return { endMonth: "", endMonthLabel: "", consensusFundMonth: "", benchmarkCeiling: "", partialFundIds: [] };
  }

  // Step 2: median of last months → consensus
  const sortedLastMonths = fundData.map((f) => f.lastMonth).sort();
  const consensusFundMonth = sortedLastMonths[Math.floor(sortedLastMonths.length / 2)];

  // Step 3: min last month across all benchmarks referenced in any blend
  const relevantBmIds = new Set(
    Object.values(CATEGORY_BLEND).flatMap((blend) => Object.keys(blend))
  );
  const bmLastMonths = Array.from(relevantBmIds)
    .map((id) => {
      const bm = benchmarks.find((b) => b.id === id);
      const months = Object.keys(bm?.monthlyReturns ?? {}).sort();
      return months.length > 0 ? months[months.length - 1] : null;
    })
    .filter((m): m is string => m != null);

  const benchmarkCeiling =
    bmLastMonths.length > 0
      ? bmLastMonths.reduce((a, b) => (a < b ? a : b))
      : consensusFundMonth;

  // Step 4: endMonth = min(consensus, ceiling)
  const endMonth = consensusFundMonth < benchmarkCeiling ? consensusFundMonth : benchmarkCeiling;

  // Partial = funds whose last month is before endMonth
  const partialFundIds = fundData.filter((f) => f.lastMonth < endMonth).map((f) => f.id);

  return { endMonth, endMonthLabel: hebrewMonthLabel(endMonth), consensusFundMonth, benchmarkCeiling, partialFundIds };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  V2 — 13. buildWindowInfo                                                   */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface WindowInfo {
  endMonth: string;
  endMonthLabel: string;
  /** 24 | 36 | 48 */
  months: number;
  windowMonths: string[];
}

/** Builds the full window descriptor given a known endMonth and size. */
export function buildWindowInfo(endMonth: string, windowSize: number): WindowInfo {
  return {
    endMonth,
    endMonthLabel: hebrewMonthLabel(endMonth),
    months: windowSize,
    windowMonths: windowMonthKeys(endMonth, windowSize),
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  V2 — 14. computeMaxDrawdown                                               */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface MaxDrawdownResult {
  /** Negative percentage, e.g. -12.43. 0 means no drawdown. */
  drawdownPct: number;
  peakMonthIndex: number | null;
  troughMonthIndex: number | null;
  peakMonthKey: string | null;
  troughMonthKey: string | null;
  /** troughIndex - peakIndex; 0 if no drawdown */
  durationMonths: number;
  /** Months from trough until wealth recovers to peak; null if not yet recovered */
  recoveryMonths: number | null;
  /** How many months of data were available for this calculation */
  monthsAvailable: number;
}

const MDD_EPSILON = 1e-9;

/**
 * Computes Max Drawdown using geometric compounding of monthly returns.
 * monthlyReturns and monthKeys must be the same length and ordered chronologically.
 * Throws if lengths differ.
 */
export function computeMaxDrawdown(
  monthlyReturns: number[],
  monthKeys: string[]
): MaxDrawdownResult {
  if (monthlyReturns.length !== monthKeys.length) {
    throw new Error(
      `computeMaxDrawdown: length mismatch (returns=${monthlyReturns.length}, keys=${monthKeys.length})`
    );
  }

  const n = monthlyReturns.length;
  const NO_DD: MaxDrawdownResult = {
    drawdownPct: 0,
    peakMonthIndex: null,
    troughMonthIndex: null,
    peakMonthKey: null,
    troughMonthKey: null,
    durationMonths: 0,
    recoveryMonths: null,
    monthsAvailable: n,
  };

  if (n === 0) return NO_DD;

  // Build wealth index (geometric compounding)
  const wealth = new Array<number>(n);
  wealth[0] = 1 + monthlyReturns[0];
  for (let i = 1; i < n; i++) {
    wealth[i] = wealth[i - 1] * (1 + monthlyReturns[i]);
  }

  // Build running max and drawdown series
  const runningMax = new Array<number>(n);
  const drawdown   = new Array<number>(n);
  runningMax[0] = wealth[0];
  drawdown[0]   = 0;
  for (let i = 1; i < n; i++) {
    runningMax[i] = Math.max(runningMax[i - 1], wealth[i]);
    drawdown[i]   = wealth[i] / runningMax[i] - 1;
  }

  // Max drawdown = minimum of drawdown series
  let maxDD = 0;
  for (let i = 0; i < n; i++) {
    if (drawdown[i] < maxDD) maxDD = drawdown[i];
  }

  if (maxDD >= -MDD_EPSILON) return NO_DD; // no meaningful drawdown

  // Trough index: argmin(drawdown)
  let troughIndex = 0;
  for (let i = 1; i < n; i++) {
    if (drawdown[i] < drawdown[troughIndex]) troughIndex = i;
  }

  // Peak index: last index ≤ troughIndex where wealth[i] = runningMax[troughIndex]
  // Scan backward from troughIndex to find the last peak
  const peakWealth = runningMax[troughIndex];
  let peakIndex = 0;
  for (let i = troughIndex; i >= 0; i--) {
    if (Math.abs(wealth[i] - peakWealth) < MDD_EPSILON) {
      peakIndex = i;
      break;
    }
  }

  // Recovery: first index after trough where wealth >= peakWealth
  let recoveryMonths: number | null = null;
  for (let i = troughIndex + 1; i < n; i++) {
    if (wealth[i] >= peakWealth - MDD_EPSILON) {
      recoveryMonths = i - troughIndex;
      break;
    }
  }

  return {
    drawdownPct:     parseFloat((maxDD * 100).toFixed(2)),
    peakMonthIndex:  peakIndex,
    troughMonthIndex: troughIndex,
    peakMonthKey:    monthKeys[peakIndex],
    troughMonthKey:  monthKeys[troughIndex],
    durationMonths:  troughIndex - peakIndex,
    recoveryMonths,
    monthsAvailable: n,
  };
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  V2.5 — 15. WindowMetrics / computeWindowMetrics / computeAllWindows       */
/* ══════════════════════════════════════════════════════════════════════════ */

export type WindowLabel = 'YTD' | '12M' | '24M' | '36M' | 'lifetime';

export interface WindowMetrics {
  windowLabel: WindowLabel;
  monthsCount: number;
  /** Cumulative geometric return, as percent e.g. 12.34 */
  fundReturn: number;
  benchmarkReturn: number;
  /** fundReturn - benchmarkReturn, as percent */
  excessReturn: number;
  informationRatio: number | null;
  monthsAboveBenchmark: { count: number; total: number };
  monthsAboveCategory:  { count: number; total: number };
  maxDrawdown: MaxDrawdownResult;
  /** Up-market capture ratio, as percent */
  upCapture: number | null;
  /** Down-market capture ratio, as percent */
  downCapture: number | null;
  rankInCategory: number | null;
  totalInCategory: number | null;
}

const WIN_SIZES: Partial<Record<WindowLabel, number>> = { '12M': 12, '24M': 24, '36M': 36 };
const MIN_IR_MONTHS      = 2;
const MIN_CAPTURE_MONTHS = 3;

function wArrMean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function wSampleStd(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = wArrMean(arr);
  return Math.sqrt(arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / (arr.length - 1));
}

function wGeoReturn(returns: number[]): number {
  return returns.reduce((acc, r) => acc * (1 + r), 1) - 1;
}

/**
 * Computes performance metrics for a single time window.
 * All input arrays are parallel, ordered chronologically.
 * Returns null when the window has insufficient data.
 */
export function computeWindowMetrics(
  fundReturns: number[],
  benchmarkReturns: number[],
  categoryAverageReturns: number[],
  monthKeys: string[],
  windowLabel: WindowLabel,
  categoryFundsIRs: number[]
): WindowMetrics | null {
  const n = monthKeys.length;
  if (n === 0) return null;

  // Determine slice start
  let sliceStart: number;
  if (windowLabel === 'lifetime') {
    sliceStart = 0;
  } else if (windowLabel === 'YTD') {
    const endYear = Number(monthKeys[n - 1].slice(0, 4));
    sliceStart = monthKeys.findIndex(k => Number(k.slice(0, 4)) === endYear);
    if (sliceStart === -1) return null;
  } else {
    const size = WIN_SIZES[windowLabel]!;
    if (n < size) return null;
    sliceStart = n - size;
  }

  const fRet  = fundReturns.slice(sliceStart);
  const bRet  = benchmarkReturns.slice(sliceStart);
  const cRet  = categoryAverageReturns.slice(sliceStart);
  const keys  = monthKeys.slice(sliceStart);
  const count = fRet.length;
  if (count === 0) return null;

  // Cumulative returns (as %)
  const fundReturn      = parseFloat((wGeoReturn(fRet) * 100).toFixed(2));
  const benchmarkReturn = parseFloat((wGeoReturn(bRet) * 100).toFixed(2));
  const excessReturn    = parseFloat((fundReturn - benchmarkReturn).toFixed(2));

  // Monthly excess (decimal)
  const monthlyExcess = fRet.map((f, i) => f - bRet[i]);

  // Information Ratio (annualized, sample std)
  let informationRatio: number | null = null;
  if (count >= MIN_IR_MONTHS) {
    const avg = wArrMean(monthlyExcess);
    const std = wSampleStd(monthlyExcess);
    if (std > 1e-10) {
      informationRatio = parseFloat((avg / std * Math.sqrt(12)).toFixed(2));
    }
  }

  // Months above benchmark / category
  const aboveBm  = fRet.filter((f, i) => f > bRet[i]).length;
  const aboveCat = fRet.filter((f, i) => f > cRet[i]).length;

  // Max Drawdown
  const maxDrawdown = computeMaxDrawdown(fRet, keys);

  // Up Capture (months where benchmark > 0)
  const upIdxs = bRet.reduce<number[]>((acc, b, i) => { if (b > 0) acc.push(i); return acc; }, []);
  let upCapture: number | null = null;
  if (upIdxs.length >= MIN_CAPTURE_MONTHS) {
    const avgFUp = wArrMean(upIdxs.map(i => fRet[i]));
    const avgBUp = wArrMean(upIdxs.map(i => bRet[i]));
    if (Math.abs(avgBUp) > 1e-10) {
      upCapture = parseFloat((avgFUp / avgBUp * 100).toFixed(1));
    }
  }

  // Down Capture (months where benchmark < 0)
  const dnIdxs = bRet.reduce<number[]>((acc, b, i) => { if (b < 0) acc.push(i); return acc; }, []);
  let downCapture: number | null = null;
  if (dnIdxs.length >= MIN_CAPTURE_MONTHS) {
    const avgFDn = wArrMean(dnIdxs.map(i => fRet[i]));
    const avgBDn = wArrMean(dnIdxs.map(i => bRet[i]));
    if (Math.abs(avgBDn) > 1e-10) {
      downCapture = parseFloat((avgFDn / avgBDn * 100).toFixed(1));
    }
  }

  // Rank in category by IR
  let rankInCategory: number | null = null;
  let totalInCategory: number | null = null;
  if (informationRatio !== null && categoryFundsIRs.length > 0) {
    totalInCategory = categoryFundsIRs.length;
    rankInCategory  = 1 + categoryFundsIRs.filter(ir => ir > informationRatio!).length;
  }

  return {
    windowLabel,
    monthsCount: count,
    fundReturn,
    benchmarkReturn,
    excessReturn,
    informationRatio,
    monthsAboveBenchmark: { count: aboveBm,  total: count },
    monthsAboveCategory:  { count: aboveCat, total: count },
    maxDrawdown,
    upCapture,
    downCapture,
    rankInCategory,
    totalInCategory,
  };
}

/**
 * Computes WindowMetrics for all 5 standard windows.
 * categoryFundsIRsByWindow: per-window list of all other category funds' IRs (for rank).
 */
export function computeAllWindows(
  fundReturns: number[],
  benchmarkReturns: number[],
  categoryAverageReturns: number[],
  monthKeys: string[],
  categoryFundsIRsByWindow: Partial<Record<WindowLabel, number[]>>
): Record<WindowLabel, WindowMetrics | null> {
  const labels: WindowLabel[] = ['YTD', '12M', '24M', '36M', 'lifetime'];
  return Object.fromEntries(
    labels.map(wl => [
      wl,
      computeWindowMetrics(
        fundReturns, benchmarkReturns, categoryAverageReturns, monthKeys,
        wl, categoryFundsIRsByWindow[wl] ?? []
      ),
    ])
  ) as Record<WindowLabel, WindowMetrics | null>;
}
