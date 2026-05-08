/**
 * lib/metrics.ts — Shared financial computation utilities.
 * Stage 2 seed: this file will grow when derived fields are removed from KV.
 */

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
