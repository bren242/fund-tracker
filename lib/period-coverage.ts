/**
 * lib/period-coverage.ts — Period coverage computation with honest labeling.
 *
 * Fixes the 5Y < 3Y bug: a fund with 40 months of history incorrectly showed
 * a "5Y" return by compounding only the 40 months that existed in that window.
 * This module computes coverage (actual vs expected months) and labels accordingly:
 *   ≥95%       → "full"       — label unchanged ("5Y", "3Y", "12M")
 *   1–94%      → "partial"    — amber sub-label with actual duration + start date
 *   0 months   → "insufficient" — value is null (no data at all)
 *
 * MAX is always treated as "full" regardless of months available.
 */

export type CoverageStatus = "full" | "partial" | "insufficient";

export interface PeriodResult {
  /** Compound return as decimal (e.g. 0.77 = 77%), or null if insufficient */
  value: number | null;
  /** Number of months the period is supposed to span */
  monthsExpected: number;
  /** Number of months actually present in monthlyReturns for this window */
  monthsActual: number;
  /** monthsActual / monthsExpected (0–1). Always 1.0 for MAX. */
  coverage: number;
  status: CoverageStatus;
  /** Earliest YYYY-MM key present in this window, or null if no data */
  effectiveFromYM: string | null;
  /**
   * Human-readable label for the period.
   * full       → same as requestedLabel ("5Y", "3Y", "MAX", …)
   * partial    → e.g. "40M · מ-01/2023"  (in amber in the UI)
   * insufficient → "" (value is null — cell shows "—")
   */
  effectiveLabel: string;
  /**
   * CAGR annualized over the actual months present.
   * Formula: (1 + compound)^(12 / monthsActual) − 1
   * null when value is null or monthsActual === 0.
   */
  cagr: number | null;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** "YYYY-MM" → "MM/YYYY" for display */
export function formatYM(ym: string): string {
  const [y, m] = ym.split("-");
  return `${m}/${y}`;
}

/** Months count → compact Hebrew label: 12→"12M", 24→"2Y", 36→"3Y", etc. */
export function formatDuration(months: number): string {
  if (months % 12 === 0 && months >= 12) return `${months / 12}Y`;
  return `${months}M`;
}

// ─── main export ──────────────────────────────────────────────────────────────

/**
 * Computes a period return with coverage awareness.
 *
 * @param monthlyReturns  Fund's YYYY-MM → decimal map (e.g. 0.03 = 3%)
 * @param fromYearMonth   Window start "YYYY-MM" inclusive, or null for MAX
 * @param toYearMonth     Window end "YYYY-MM" inclusive
 * @param requestedLabel  The label as requested by the caller ("5Y", "MAX", etc.)
 * @param expectedMonths  How many months the window is supposed to span (0 for MAX)
 */
export function computePeriodWithCoverage(
  monthlyReturns: Record<string, number> | undefined,
  fromYearMonth: string | null,
  toYearMonth: string,
  requestedLabel: string,
  expectedMonths: number,
  startDate?: string
): PeriodResult {
  const isMax = requestedLabel === "MAX" || fromYearMonth === null;
  const isYtd = requestedLabel === "YTD";

  // Effective floor: the later of fromYearMonth and fund startDate
  const startYYYYMM = startDate ? startDate.slice(0, 7) : null;

  // Collect keys in window, sorted ascending
  const keys = monthlyReturns
    ? Object.keys(monthlyReturns)
        .filter((k) => {
          if (fromYearMonth !== null && k < fromYearMonth) return false;
          if (startYYYYMM !== null && k < startYYYYMM) return false;
          if (k > toYearMonth) return false;
          return typeof monthlyReturns[k] === "number";
        })
        .sort()
    : [];

  const monthsActual = keys.length;
  // YTD: expected = completed months this year = month part of toYearMonth − 1
  // e.g. "2026-05" → 4 (Jan–Apr completed; May still in progress)
  const monthsExpected = isMax
    ? monthsActual
    : isYtd
    ? Math.max(0, parseInt(toYearMonth.split("-")[1]) - 1)
    : expectedMonths;
  const coverage = monthsExpected === 0 ? 1 : monthsActual / monthsExpected;

  // Determine status
  let status: CoverageStatus;
  if (isMax) {
    status = monthsActual > 0 ? "full" : "insufficient";
  } else if (coverage >= 0.95) {
    status = "full";
  } else if (monthsActual > 0) {
    status = "partial";
  } else {
    status = "insufficient";
  }

  if (monthsActual === 0) {
    return {
      value: null,
      monthsExpected,
      monthsActual,
      coverage,
      status: "insufficient",
      effectiveFromYM: null,
      effectiveLabel: "",
      cagr: null,
    };
  }

  // Compound return as decimal (0.77 = 77%)
  const compound = keys.reduce((acc, k) => acc * (1 + monthlyReturns![k]), 1) - 1;
  const value = compound;
  const effectiveFromYM = keys[0];

  // CAGR
  const cagr = Math.pow(1 + compound, 12 / monthsActual) - 1;

  // Label
  let effectiveLabel: string;
  if (status === "full") {
    effectiveLabel = requestedLabel;
  } else {
    // partial — show actual duration + start month
    effectiveLabel = `${monthsActual}M · מ-${formatYM(effectiveFromYM)}`;
  }

  return {
    value,
    monthsExpected,
    monthsActual,
    coverage,
    status,
    effectiveFromYM,
    effectiveLabel,
    cagr,
  };
}
