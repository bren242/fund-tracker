/**
 * lib/fundDerived.ts
 *
 * Derived metric accessors — single fallback layer between UI and storage.
 *
 * Priority: computed from monthlyReturns (lib/metrics.ts) → stored KV value.
 * Returns null only when both sources are unavailable.
 */

import * as metrics from "@/lib/metrics";
import type { Fund } from "@/lib/types";

export function getLastUpdated(fund: Fund): string | null {
  return metrics.computeLatestMonth(fund.monthlyReturns ?? {}) ?? fund.lastUpdated ?? null;
}

export function getYTD(fund: Fund, year: number): number | null {
  const r = fund.returns as Record<string, number | null>;
  return (
    metrics.computeYTDFromMonthlyReturns(fund.monthlyReturns ?? {}, String(year)) ??
    r[`ytd${year}`] ??
    null
  );
}

export function getAnnualReturn(fund: Fund, year: number): number | null {
  const r = fund.returns as Record<string, number | null>;
  return (
    metrics.computeAnnualReturn(fund.monthlyReturns ?? {}, year) ??
    r[`y${year}`] ??
    null
  );
}

export function getSharpe(fund: Fund): number | null {
  return metrics.computeSharpe(fund.monthlyReturns ?? {}) ?? fund.sharpe ?? null;
}

export function getStdDev(fund: Fund): number | null {
  return metrics.computeStdDev(fund.monthlyReturns ?? {}) ?? fund.stdDev ?? null;
}

export function getAvgAnnualReturn(fund: Fund): number | null {
  return (
    metrics.computeAvgAnnualReturn(fund.monthlyReturns ?? {}) ??
    fund.avgAnnualReturn ??
    null
  );
}

export function getLatestMonthly(fund: Fund): number | null {
  return (
    metrics.computeLatestMonthly(fund.monthlyReturns ?? {})?.value ??
    fund.monthlyReturn ??
    null
  );
}

/** YTD 2026 for NOX: compute from monthlyReturns2026 (keys "01".."12"), fallback to stored ytd2026. */
export function getNoxYtd2026(fund: Fund): number | null {
  const mr = fund.monthlyReturns2026;
  if (mr && Object.keys(mr).length > 0) {
    return Object.values(mr).reduce((acc, r) => acc * (1 + r), 1) - 1;
  }
  return fund.returns?.ytd2026 ?? null;
}

/** Latest month value for NOX: from monthlyReturns2026 (sorted last), fallback to monthlyReturn. */
export function getNoxLatestMonthly(fund: Fund): number | null {
  const mr = fund.monthlyReturns2026;
  if (mr && Object.keys(mr).length > 0) {
    const latestKey = Object.keys(mr).sort().at(-1)!;
    return mr[latestKey] ?? null;
  }
  return fund.monthlyReturn ?? null;
}
