import { describe, it, expect } from "vitest";
import {
  computePeriodWithCoverage,
  formatYM,
  formatDuration,
  type PeriodResult,
} from "../lib/period-coverage";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a Record<"YYYY-MM", number> for a consecutive range of months */
function makeMonths(
  startYM: string,
  count: number,
  value = 0.01
): Record<string, number> {
  const [y, m] = startYM.split("-").map(Number);
  const result: Record<string, number> = {};
  for (let i = 0; i < count; i++) {
    const date = new Date(y, m - 1 + i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    result[key] = value;
  }
  return result;
}

// ─── formatYM ─────────────────────────────────────────────────────────────────

describe("formatYM", () => {
  it("formats YYYY-MM to MM/YYYY", () => {
    expect(formatYM("2023-01")).toBe("01/2023");
    expect(formatYM("2026-12")).toBe("12/2026");
  });
});

// ─── formatDuration ───────────────────────────────────────────────────────────

describe("formatDuration", () => {
  it("uses Y suffix for multiples of 12", () => {
    expect(formatDuration(12)).toBe("1Y");
    expect(formatDuration(36)).toBe("3Y");
    expect(formatDuration(60)).toBe("5Y");
  });
  it("uses M suffix otherwise", () => {
    expect(formatDuration(6)).toBe("6M");
    expect(formatDuration(40)).toBe("40M");
  });
});

// ─── computePeriodWithCoverage ────────────────────────────────────────────────

describe("computePeriodWithCoverage", () => {
  // Test 1 — veteran fund: full 60 months → full coverage
  it("returns full coverage for a 60-month window with 60 months of data", () => {
    const mr = makeMonths("2021-05", 60, 0.01);
    const result = computePeriodWithCoverage(mr, "2021-05", "2026-04", "5Y", 60);
    expect(result.status).toBe("full");
    expect(result.monthsActual).toBe(60);
    expect(result.monthsExpected).toBe(60);
    expect(result.coverage).toBeCloseTo(1.0);
    expect(result.effectiveLabel).toBe("5Y");
    expect(result.value).not.toBeNull();
    // 60 months of 1% each: compound = 1.01^60 - 1 ≈ 0.8167 (decimal)
    expect(result.value!).toBeCloseTo(Math.pow(1.01, 60) - 1, 6);
    // CAGR annualized over 60 months = (1.01^60)^(12/60) - 1 = 1.01^12 - 1 ≈ 12.68%
    expect(result.cagr!).toBeCloseTo(Math.pow(1.01, 12) - 1, 6);
  });

  // Test 2 — young fund: 40 months in a 60-month window → partial
  it("returns partial coverage for 40 months in a 60-month window", () => {
    const mr = makeMonths("2023-01", 40, 0.01);
    // Window: 2021-05 → 2026-04 (60M expected), fund only has 2023-01–2026-04
    const result = computePeriodWithCoverage(mr, "2021-05", "2026-04", "5Y", 60);
    expect(result.status).toBe("partial");
    expect(result.monthsActual).toBe(40);
    expect(result.coverage).toBeCloseTo(40 / 60, 6);
    expect(result.effectiveLabel).toBe("40M · מ-01/2023");
    expect(result.value).not.toBeNull();
    expect(result.cagr).not.toBeNull();
  });

  // Test 3 — young fund: 20 months in a 60-month window → partial (any data = show value)
  it("returns partial for < 50% coverage (20 of 60 months) — any data shows value", () => {
    const mr = makeMonths("2024-09", 20, 0.01); // 2024-09 → 2026-04 = 20 months in window
    const result = computePeriodWithCoverage(mr, "2021-05", "2026-04", "5Y", 60);
    expect(result.status).toBe("partial");
    expect(result.value).not.toBeNull();
    expect(result.cagr).not.toBeNull();
    expect(result.monthsActual).toBe(20);
    expect(result.effectiveLabel).toBe("20M · מ-09/2024");
  });

  // Test 3b — insufficient only when 0 months in window
  it("returns insufficient only when 0 months exist in window", () => {
    const mr = makeMonths("2030-01", 5, 0.01); // all outside window
    const result = computePeriodWithCoverage(mr, "2021-05", "2026-04", "5Y", 60);
    expect(result.status).toBe("insufficient");
    expect(result.value).toBeNull();
    expect(result.effectiveLabel).toBe("");
  });

  // Test 4 — boundary: exactly 50% (30 of 60 months) → partial
  it("treats exactly 50% coverage as partial", () => {
    const mr = makeMonths("2023-11", 30, 0.01);
    const result = computePeriodWithCoverage(mr, "2021-05", "2026-04", "5Y", 60);
    expect(result.status).toBe("partial");
    expect(result.monthsActual).toBe(30);
  });

  // Test 5 — boundary: exactly 95% (57 of 60 months) → full
  it("treats 95% coverage as full", () => {
    const mr = makeMonths("2021-08", 57, 0.01); // 3 months gap at start
    const result = computePeriodWithCoverage(mr, "2021-05", "2026-04", "5Y", 60);
    expect(result.status).toBe("full");
    expect(result.effectiveLabel).toBe("5Y");
  });

  // Test 6 — MAX always full regardless of count
  it("MAX is always full regardless of months available", () => {
    const mr = makeMonths("2024-01", 5, 0.02);
    const result = computePeriodWithCoverage(mr, null, "2026-04", "MAX", 0);
    expect(result.status).toBe("full");
    expect(result.effectiveLabel).toBe("MAX");
    expect(result.monthsActual).toBe(5);
    expect(result.monthsExpected).toBe(5); // MAX sets expected = actual
    expect(result.coverage).toBe(1);
  });

  // Test 7 — empty monthlyReturns → insufficient
  it("returns insufficient when monthlyReturns is empty or undefined", () => {
    const r1 = computePeriodWithCoverage({}, "2021-05", "2026-04", "5Y", 60);
    expect(r1.status).toBe("insufficient");
    expect(r1.value).toBeNull();

    const r2 = computePeriodWithCoverage(undefined, "2021-05", "2026-04", "5Y", 60);
    expect(r2.status).toBe("insufficient");
    expect(r2.value).toBeNull();
  });

  // Test 8 — YTD in May with 4 months of data → full (4/4 = 100%)
  it("YTD in May with 4 months of data is full", () => {
    const mr = makeMonths("2026-01", 4, 0.01); // Jan–Apr 2026
    // toYearMonth="2026-05" → expectedMonths = 5-1 = 4
    const result = computePeriodWithCoverage(mr, "2026-01", "2026-05", "YTD", 5);
    expect(result.status).toBe("full");
    expect(result.monthsActual).toBe(4);
    expect(result.monthsExpected).toBe(4);
    expect(result.coverage).toBeCloseTo(1.0);
    expect(result.effectiveLabel).toBe("YTD");
  });

  // Test 9 — YTD in May with 2 months of data → partial (2/4 = 50%)
  it("YTD in May with 2 months of data is partial", () => {
    const mr = makeMonths("2026-01", 2, 0.01); // Jan–Feb 2026
    const result = computePeriodWithCoverage(mr, "2026-01", "2026-05", "YTD", 5);
    expect(result.status).toBe("partial");
    expect(result.monthsActual).toBe(2);
    expect(result.monthsExpected).toBe(4);
    expect(result.coverage).toBeCloseTo(0.5);
  });

  // Test 10 — חצבים ואליו scenario: 5Y preset with startDate=2024-01 → partial + value
  it("preset 5Y: fund starting 2024-01 in 2021-05→2026-04 window is partial with value", () => {
    const mr = makeMonths("2024-01", 28, 0.01); // 28 months
    const result = computePeriodWithCoverage(mr, "2021-05", "2026-04", "5Y", 60);
    expect(result.status).toBe("partial");
    expect(result.value).not.toBeNull();
    expect(result.monthsActual).toBe(28);
    expect(result.effectiveLabel).toBe("28M · מ-01/2024");
  });

  // Test 11 — custom range same window as 5Y: identical value to preset
  it("custom range with same window as 5Y preset yields same value", () => {
    const mr = makeMonths("2024-01", 28, 0.01);
    const presetResult  = computePeriodWithCoverage(mr, "2021-05", "2026-04", "5Y", 60);
    const customResult  = computePeriodWithCoverage(mr, "2021-05", "2026-04", "custom", 48);
    expect(presetResult.status).toBe("partial");
    expect(customResult.status).toBe("partial");
    expect(presetResult.value).not.toBeNull();
    expect(customResult.value).not.toBeNull();
    expect(presetResult.value).toBeCloseTo(customResult.value!, 10);
    expect(presetResult.monthsActual).toBe(customResult.monthsActual);
    expect(presetResult.effectiveLabel).toBe(customResult.effectiveLabel);
  });
});
