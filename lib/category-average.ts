/**
 * lib/category-average.ts
 * =======================
 * חישוב ממוצעי קטגוריה — חודשי, YTD, ו-Rolling 24 חודשים.
 *
 * exports:
 *   getFundsInCategory(fundsData, categoryId)                     → Fund[]
 *   monthlyCategoryAverage(fundsData, categoryId, yearMonth)      → number | null
 *   ytdCategoryAverage(fundsData, categoryId, year, throughMonth) → number | null
 *   rolling24mCategoryAverage(fundsData, categoryId, endYearMonth)→ number | null
 */

import { FundsData, Fund } from "./types";

/** Minimum number of funds required to produce a valid average. */
const MIN_FUNDS = 3;

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Internal helpers                                                           */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Shifts a "YYYY-MM" string by deltaMonths.
 * Works correctly across year boundaries in both directions.
 */
function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  const parts = yearMonth.split("-");
  // Convert to a 0-indexed total-month count, apply delta, convert back
  const totalMonths =
    parseInt(parts[0], 10) * 12 + parseInt(parts[1], 10) - 1 + deltaMonths;
  const y = Math.floor(totalMonths / 12);
  const m = (totalMonths % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * Builds an ordered list of "YYYY-MM" strings from start to end (inclusive).
 * start and end must be valid "YYYY-MM" strings with start ≤ end.
 * YYYY-MM strings compare correctly as plain strings (lexicographic).
 */
function monthRange(start: string, end: string): string[] {
  const months: string[] = [];
  let cur = start;
  while (cur <= end) {
    months.push(cur);
    cur = shiftYearMonth(cur, 1);
  }
  return months;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  1. getFundsInCategory                                                      */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Returns all Fund objects that belong to the given category.
 * Returns an empty array if the category is not found.
 */
export function getFundsInCategory(
  fundsData: FundsData,
  categoryId: string
): Fund[] {
  const cat = fundsData.categories.find((c) => c.id === categoryId);
  return cat?.funds ?? [];
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  2. monthlyCategoryAverage                                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Arithmetic average of monthlyReturns[yearMonth] across all funds in the category.
 * Skips null / undefined / NaN values.
 * Returns null if fewer than MIN_FUNDS (3) valid values are present.
 *
 * Values are decimal: 0.0156 = 1.56%.
 */
export function monthlyCategoryAverage(
  fundsData: FundsData,
  categoryId: string,
  yearMonth: string
): number | null {
  const funds = getFundsInCategory(fundsData, categoryId);
  const vals = funds
    .map((f) => f.monthlyReturns?.[yearMonth])
    .filter((v): v is number => v != null && !Number.isNaN(v));

  if (vals.length < MIN_FUNDS) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  3. ytdCategoryAverage                                                      */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Average YTD compound return across the category for a given year.
 * Each fund's YTD = ((1+r₁) × (1+r₂) × … × (1+rN)) − 1, from YYYY-01 to YYYY-{throughMonth}.
 * Funds missing any month in the range are excluded from the average.
 * Returns null if fewer than MIN_FUNDS (3) qualifying funds remain.
 */
export function ytdCategoryAverage(
  fundsData: FundsData,
  categoryId: string,
  year: number,
  throughMonth: number
): number | null {
  const funds = getFundsInCategory(fundsData, categoryId);
  const months = monthRange(
    `${year}-${String(1).padStart(2, "0")}`,
    `${year}-${String(throughMonth).padStart(2, "0")}`
  );

  const ytds: number[] = [];
  for (const fund of funds) {
    let compound = 1;
    let valid = true;
    for (const month of months) {
      const r = fund.monthlyReturns?.[month];
      if (r == null || Number.isNaN(r)) {
        valid = false;
        break;
      }
      compound *= 1 + r;
    }
    if (valid) ytds.push(compound - 1);
  }

  if (ytds.length < MIN_FUNDS) return null;
  return ytds.reduce((s, v) => s + v, 0) / ytds.length;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  4. rolling24mCategoryAverage                                               */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Average rolling 24-month compound return for the category, ending at endYearMonth (inclusive).
 * Each fund must have data for all 24 months; any gap disqualifies that fund.
 * Returns null if fewer than MIN_FUNDS (3) qualifying funds remain.
 */
export function rolling24mCategoryAverage(
  fundsData: FundsData,
  categoryId: string,
  endYearMonth: string
): number | null {
  const startYearMonth = shiftYearMonth(endYearMonth, -23); // 24 months inclusive
  const months = monthRange(startYearMonth, endYearMonth);

  const funds = getFundsInCategory(fundsData, categoryId);
  const compounds: number[] = [];
  for (const fund of funds) {
    let compound = 1;
    let valid = true;
    for (const m of months) {
      const r = fund.monthlyReturns?.[m];
      if (r == null || Number.isNaN(r)) {
        valid = false;
        break;
      }
      compound *= 1 + r;
    }
    if (valid) compounds.push(compound - 1);
  }

  if (compounds.length < MIN_FUNDS) return null;
  return compounds.reduce((s, v) => s + v, 0) / compounds.length;
}
