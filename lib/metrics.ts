/**
 * lib/metrics.ts — Single source of truth for fund financial computations.
 *
 * All functions are pure: they derive results solely from monthlyReturns.
 * No external state, no React dependencies, no side effects.
 * Callers pass fund.monthlyReturns ?? {} and handle the null return value.
 */

import {
  RISK_FREE_RATE_ANNUAL,
  SHARPE_CAP,
  MIN_MONTHS_FOR_RISK_METRICS,
} from "./constants";

/** "YYYY-MM" → decimal return. Strict: callers should filter nulls before passing. */
export type MonthlyReturns = Record<string, number>;

// ─────────────────────────────────────────────────────────────────────────────
//  Internal helper
// ─────────────────────────────────────────────────────────────────────────────

/** Returns entries sorted by YYYY-MM ascending, filtering out non-numeric values. */
function sortedEntries(mr: MonthlyReturns): [string, number][] {
  return (Object.entries(mr) as [string, unknown][])
    .filter((e): e is [string, number] => typeof e[1] === "number")
    .sort(([a], [b]) => a.localeCompare(b));
}

// ─────────────────────────────────────────────────────────────────────────────
//  Existing (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compound YTD from monthly returns for a given year.
 * Optionally merges a new (month, value) pair before computing — used for preview.
 *
 * @param monthlyReturns  existing YYYY-MM → number map (may contain nulls)
 * @param year            e.g. "2026"
 * @param newMonth        optional key to add/override (e.g. "2026-04")
 * @param newValue        optional value for newMonth
 * @returns compound return as decimal (0.077 = 7.7%), or null if no data
 */
export function computeYTDFromMonthlyReturns(
  monthlyReturns: Record<string, number | null | undefined>,
  year: string,
  newMonth?: string,
  newValue?: number
): number | null {
  const prefix = `${year}-`;
  const merged: Record<string, number> = {};

  for (const [k, v] of Object.entries(monthlyReturns)) {
    if (k.startsWith(prefix) && typeof v === "number") {
      merged[k] = v;
    }
  }

  if (newMonth && newMonth.startsWith(prefix) && typeof newValue === "number") {
    merged[newMonth] = newValue;
  }

  const months = Object.entries(merged).sort(([a], [b]) => a.localeCompare(b));
  if (months.length === 0) return null;

  return months.reduce((acc, [, r]) => (1 + acc) * (1 + r) - 1, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
//  New functions — Stage 2
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The most recent monthly return.
 * @returns `{ value, month }` tuple, or null if monthlyReturns is empty.
 */
export function computeLatestMonthly(
  mr: MonthlyReturns
): { value: number; month: string } | null {
  const entries = sortedEntries(mr);
  if (entries.length === 0) return null;
  const [month, value] = entries[entries.length - 1];
  return { value, month };
}

/**
 * Geometric annual return for a specific calendar year.
 * Requires all 12 months (YYYY-01 through YYYY-12) to be present.
 * Returns null if any month is missing.
 */
export function computeAnnualReturn(
  mr: MonthlyReturns,
  year: number
): number | null {
  let compound = 1;
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    const v = mr[key];
    if (typeof v !== "number") return null;
    compound *= 1 + v;
  }
  return compound - 1;
}

/**
 * Geometric return over the last N months (by calendar order).
 * Takes the N most-recent entries from monthlyReturns.
 * Returns null if fewer than N months are available, or if N ≤ 0.
 *
 * Note: does not require the N months to be consecutive — gaps are silently
 * included as "missing" months and reduce the available count below N.
 */
export function computePeriodReturn(
  mr: MonthlyReturns,
  months: number
): number | null {
  if (months <= 0) return null;
  const entries = sortedEntries(mr);
  if (entries.length < months) return null;
  const window = entries.slice(entries.length - months);
  return window.reduce((acc, [, r]) => (1 + acc) * (1 + r) - 1, 0);
}

/**
 * CAGR — Compound Annual Growth Rate across all available months.
 * Formula: (∏(1+rᵢ))^(12/N) − 1  where N = number of months.
 *
 * This is the canonical avgAnnualReturn calculation.
 * Replaces the old arithmetic mean of yearly returns stored in KV.
 * Returns null if fewer than MIN_MONTHS_FOR_RISK_METRICS months available.
 */
export function computeAvgAnnualReturn(mr: MonthlyReturns): number | null {
  const values = sortedEntries(mr).map(([, v]) => v);
  if (values.length < MIN_MONTHS_FOR_RISK_METRICS) return null;
  const compound = values.reduce((acc, r) => acc * (1 + r), 1);
  return Math.pow(compound, 12 / values.length) - 1;
}

/**
 * Annualized Sharpe Ratio.
 * Formula: ((mean(monthly) − RFR/12) / stdDev(monthly)) × √12
 *
 * - Sample stdDev (N−1 denominator).
 * - Returns null if stdDev is exactly 0 (all returns identical — not meaningful).
 * - Result is clamped to [−SHARPE_CAP, +SHARPE_CAP] rather than discarded.
 * - Returns null if fewer than MIN_MONTHS_FOR_RISK_METRICS months available.
 *
 * @param riskFreeAnnual  Annual risk-free rate (decimal). Defaults to RISK_FREE_RATE_ANNUAL (3%).
 */
export function computeSharpe(
  mr: MonthlyReturns,
  riskFreeAnnual: number = RISK_FREE_RATE_ANNUAL
): number | null {
  const values = sortedEntries(mr).map(([, v]) => v);
  if (values.length < MIN_MONTHS_FOR_RISK_METRICS) return null;

  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return null;

  const rfrMonthly = riskFreeAnnual / 12;
  const sharpe = ((mean - rfrMonthly) / stdDev) * Math.sqrt(12);

  if (!isFinite(sharpe)) return null;
  return Math.max(-SHARPE_CAP, Math.min(SHARPE_CAP, sharpe));
}

/**
 * Annualized standard deviation of monthly returns.
 * Formula: sampleStdDev(monthly) × √12  (N−1 denominator).
 * Returns null if fewer than MIN_MONTHS_FOR_RISK_METRICS months available.
 */
export function computeStdDev(mr: MonthlyReturns): number | null {
  const values = sortedEntries(mr).map(([, v]) => v);
  if (values.length < MIN_MONTHS_FOR_RISK_METRICS) return null;

  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance) * Math.sqrt(12);
}

/**
 * The earliest YYYY-MM key present in monthlyReturns.
 * Returns null if monthlyReturns is empty.
 */
export function computeStartMonth(mr: MonthlyReturns): string | null {
  const entries = sortedEntries(mr);
  return entries.length > 0 ? entries[0][0] : null;
}

/**
 * The most recent YYYY-MM key present in monthlyReturns.
 * Returns null if monthlyReturns is empty.
 */
export function computeLatestMonth(mr: MonthlyReturns): string | null {
  const entries = sortedEntries(mr);
  return entries.length > 0 ? entries[entries.length - 1][0] : null;
}

/**
 * Returns true if monthlyReturns contains at least `requiredMonths` numeric entries.
 */
export function hasMinimumHistory(
  mr: MonthlyReturns,
  requiredMonths: number
): boolean {
  return sortedEntries(mr).length >= requiredMonths;
}
