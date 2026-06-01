// ─────────────────────────────────────────────────────────────────────────────
//  Risk metric constants — used by lib/metrics.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Annual risk-free rate used for Sharpe Ratio calculations.
 * 3% — rough 10-year average of Israeli Makam (short-term government bonds).
 * Intentionally fixed: frequent changes would distort historical Sharpe comparisons.
 * Update only if the interest-rate environment changes dramatically over the long term.
 */
export const RISK_FREE_RATE_ANNUAL = 0.03;

/** Sharpe results are clamped to [−SHARPE_CAP, +SHARPE_CAP]. */
export const SHARPE_CAP = 5;

/** Minimum number of monthly data points required to compute Sharpe, StdDev, and CAGR. */
export const MIN_MONTHS_FOR_RISK_METRICS = 12;

// ─────────────────────────────────────────────────────────────────────────────
//  UI constants
// ─────────────────────────────────────────────────────────────────────────────

/** Category section header colors — shared between screen table and print report */
export const SECTION_COLORS: Record<string, string> = {
  "bond-hedged": "#1a3a5f",
  "multi-strategy": "#2d5016",
  "equity-hedged": "#1a4971",
  "blended": "#4a1d6e",
  "real-estate": "#064e3b",
  "open-trust": "#1a3a5f",
  "closed-trust": "#1a3a5f",
  "private-debt": "#78350f",
  "clo": "#3f3f46",
};
