export type TimeRange = "ytd" | "12m" | "3y" | "5y" | "max" | "custom";

export const PRESETS: TimeRange[] = ["ytd", "12m", "3y", "5y", "max", "custom"];
export const DEFAULT_RANGE: TimeRange = "12m";

export const MONTHS_HE = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

export const PRESET_LABELS: Record<TimeRange, string> = {
  ytd: "מתחילת שנה",
  "12m": "12 חודשים",
  "3y": "3 שנים",
  "5y": "5 שנים",
  max: "MAX",
  custom: "מותאם",
};

/** Adds n months to a YYYY-MM string. n may be negative. */
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Converts a TimeRange preset + latestMonth anchor into an exact { from, to } pair.
 *
 * - Preset ranges are anchored to latestMonth (last month with fund data).
 * - Returns null when latestMonth is null (data not yet loaded) for non-custom ranges.
 * - custom: uses customFrom/customTo directly; auto-swaps if from > to.
 */
export function rangeToDateRange(
  range: TimeRange,
  latestMonth: string | null,
  customFrom?: string,
  customTo?: string,
): { from: string; to: string } | null {
  if (range === "custom") {
    if (!customFrom || !customTo) return null;
    const [f, t] = customFrom <= customTo
      ? [customFrom, customTo]
      : [customTo, customFrom];
    return { from: f, to: t };
  }

  if (!latestMonth) return null;

  const [anchorY] = latestMonth.split("-").map(Number);

  switch (range) {
    case "ytd":  return { from: `${anchorY}-01`,         to: latestMonth };
    case "12m":  return { from: addMonths(latestMonth, -11), to: latestMonth };
    case "3y":   return { from: addMonths(latestMonth, -36), to: latestMonth };
    case "5y":   return { from: addMonths(latestMonth, -60), to: latestMonth };
    case "max":  return { from: "2019-01",               to: latestMonth };
  }
}

/** Formats "2026-04" → "אפריל 2026" */
export function formatMonthHe(yyyyMm: string): string {
  const parts = yyyyMm.split("-");
  const monthIdx = parseInt(parts[1], 10) - 1;
  return `${MONTHS_HE[monthIdx] ?? parts[1]} ${parts[0]}`;
}

/** Lexicographic compare for YYYY-MM strings. Returns -1 / 0 / 1. */
export function compareYYYYMM(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
