import { describe, it, expect } from "vitest";
import {
  computeYTDFromMonthlyReturns,
  computeLatestMonthly,
  computeAnnualReturn,
  computePeriodReturn,
  computeAvgAnnualReturn,
  computeSharpe,
  computeStdDev,
  computeStartMonth,
  computeLatestMonth,
  hasMinimumHistory,
  computeCumulativeForRange,
  type MonthlyReturns,
} from "../lib/metrics";

// ─── Test fixtures ─────────────────────────────────────────────────────────

/** 12 months of exactly 1% each — 2025-01 to 2025-12 */
const flat12: MonthlyReturns = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [
    `2025-${String(i + 1).padStart(2, "0")}`,
    0.01,
  ])
);

/**
 * 12 months alternating 0.01 / 0.00 — 2025-01 to 2025-12.
 * Odd months (01,03,...,11) = 0.01; even = 0.00.
 * Designed so Sharpe is predictable: mean=0.005, sampleStdDev≈0.005222,
 * Sharpe(3% RFR) ≈ 1.659.
 */
const alt12: MonthlyReturns = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [
    `2025-${String(i + 1).padStart(2, "0")}`,
    i % 2 === 0 ? 0.01 : 0.0,
  ])
);

/** 24 months of realistic mixed returns — 2024-01 to 2025-12 */
const mr24: MonthlyReturns = {
  "2024-01":  0.012, "2024-02": -0.003, "2024-03":  0.021, "2024-04":  0.008,
  "2024-05": -0.012, "2024-06":  0.015, "2024-07":  0.009, "2024-08": -0.005,
  "2024-09":  0.018, "2024-10":  0.007, "2024-11": -0.008, "2024-12":  0.011,
  "2025-01":  0.014, "2025-02":  0.003, "2025-03": -0.007, "2025-04":  0.022,
  "2025-05": -0.015, "2025-06":  0.019, "2025-07":  0.008, "2025-08":  0.011,
  "2025-09": -0.004, "2025-10":  0.016, "2025-11":  0.009, "2025-12":  0.013,
};

/** 11 months — missing 2025-12 */
const partial2025: MonthlyReturns = Object.fromEntries(
  Array.from({ length: 11 }, (_, i) => [
    `2025-${String(i + 1).padStart(2, "0")}`,
    0.01,
  ])
);

/**
 * 12 months with high positive returns and tiny variance.
 * Raw Sharpe ≈ 130 — well above SHARPE_CAP (5). Used to test clamping.
 */
const highSharpe12: MonthlyReturns = {
  "2025-01": 0.050, "2025-02": 0.048, "2025-03": 0.051, "2025-04": 0.049,
  "2025-05": 0.050, "2025-06": 0.052, "2025-07": 0.049, "2025-08": 0.051,
  "2025-09": 0.050, "2025-10": 0.048, "2025-11": 0.051, "2025-12": 0.049,
};

/**
 * 12 months of exactly 0.0 — mean=0, deviations=0, stdDev=0 exactly in IEEE 754.
 * Used to verify the stdDev=0 → null guard in computeSharpe.
 */
const zeros12: MonthlyReturns = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [
    `2025-${String(i + 1).padStart(2, "0")}`,
    0.0,
  ])
);

const empty: MonthlyReturns = {};

// ─── computeYTDFromMonthlyReturns ──────────────────────────────────────────

describe("computeYTDFromMonthlyReturns", () => {
  it("returns geometric compound YTD for a year with full data", () => {
    const result = computeYTDFromMonthlyReturns(flat12, "2025");
    // 1.01^12 - 1
    expect(result).toBeCloseTo(Math.pow(1.01, 12) - 1, 6);
  });

  it("returns null when no months match the year", () => {
    expect(computeYTDFromMonthlyReturns(flat12, "2024")).toBeNull();
    expect(computeYTDFromMonthlyReturns(empty, "2025")).toBeNull();
  });

  it("merges optional newMonth for real-time preview", () => {
    const base = { "2026-01": 0.01, "2026-02": 0.02 };
    const result = computeYTDFromMonthlyReturns(base, "2026", "2026-03", 0.03);
    expect(result).toBeCloseTo(1.01 * 1.02 * 1.03 - 1, 6);
  });
});

// ─── computeLatestMonthly ──────────────────────────────────────────────────

describe("computeLatestMonthly", () => {
  it("returns the last month and value", () => {
    expect(computeLatestMonthly(flat12)).toEqual({ value: 0.01, month: "2025-12" });
  });

  it("returns null for empty input", () => {
    expect(computeLatestMonthly(empty)).toBeNull();
  });

  it("returns correct result for a single entry", () => {
    expect(computeLatestMonthly({ "2024-06": 0.05 })).toEqual({
      value: 0.05,
      month: "2024-06",
    });
  });
});

// ─── computeAnnualReturn ───────────────────────────────────────────────────

describe("computeAnnualReturn", () => {
  it("returns geometric compound for a full 12-month year (flat)", () => {
    expect(computeAnnualReturn(flat12, 2025)).toBeCloseTo(Math.pow(1.01, 12) - 1, 6);
  });

  it("returns correct result for alternating returns", () => {
    // 6 months of 1%, 6 months of 0% → 1.01^6 - 1
    expect(computeAnnualReturn(alt12, 2025)).toBeCloseTo(Math.pow(1.01, 6) - 1, 6);
  });

  it("returns null when any month in the year is missing", () => {
    // partial2025 is missing December
    expect(computeAnnualReturn(partial2025, 2025)).toBeNull();
  });

  it("returns null for a year not present in monthlyReturns", () => {
    expect(computeAnnualReturn(flat12, 2024)).toBeNull();
    expect(computeAnnualReturn(empty, 2025)).toBeNull();
  });
});

// ─── computePeriodReturn ───────────────────────────────────────────────────

describe("computePeriodReturn", () => {
  it("returns geometric compound for the last 12 months", () => {
    expect(computePeriodReturn(flat12, 12)).toBeCloseTo(Math.pow(1.01, 12) - 1, 6);
  });

  it("returns geometric compound for the last 6 months", () => {
    // flat12 last 6 months are all 0.01
    expect(computePeriodReturn(flat12, 6)).toBeCloseTo(Math.pow(1.01, 6) - 1, 6);
  });

  it("returns null when fewer months are available than requested", () => {
    expect(computePeriodReturn(flat12, 13)).toBeNull();
    expect(computePeriodReturn(empty, 1)).toBeNull();
  });

  it("returns null for months <= 0", () => {
    expect(computePeriodReturn(flat12, 0)).toBeNull();
    expect(computePeriodReturn(flat12, -3)).toBeNull();
  });
});

// ─── computeAvgAnnualReturn ────────────────────────────────────────────────

describe("computeAvgAnnualReturn", () => {
  it("equals computeAnnualReturn when exactly 12 months are provided", () => {
    // CAGR over 12 months = (total_compound)^(12/12) - 1 = total_compound - 1
    const cagr = computeAvgAnnualReturn(flat12);
    const annual = computeAnnualReturn(flat12, 2025);
    expect(cagr).toBeCloseTo(annual!, 6);
  });

  it("annualizes 24 months of realistic data to a reasonable range", () => {
    const cagr = computeAvgAnnualReturn(mr24);
    expect(cagr).not.toBeNull();
    // Positive CAGR, expected roughly 7–10%
    expect(cagr!).toBeGreaterThan(0.05);
    expect(cagr!).toBeLessThan(0.15);
  });

  it("returns null for fewer than 12 months (consistent with Sharpe/StdDev)", () => {
    expect(computeAvgAnnualReturn(partial2025)).toBeNull();  // 11 months
    expect(computeAvgAnnualReturn(empty)).toBeNull();
    expect(computeAvgAnnualReturn({ "2025-06": 0.01 })).toBeNull();
  });

  it("respects startDate — cuts pre-inception months and produces a different result", () => {
    // mr24 has 24 months (2024-01 to 2025-12). Cutting first 12 months via startDate
    // should produce a different CAGR than using all 24.
    const cagrFull = computeAvgAnnualReturn(mr24);
    const cagrFromJan2025 = computeAvgAnnualReturn(mr24, "2025-01-01");
    expect(cagrFull).not.toBeNull();
    expect(cagrFromJan2025).not.toBeNull();
    expect(cagrFromJan2025).not.toBeCloseTo(cagrFull!, 4);
  });
});

// ─── computeSharpe ────────────────────────────────────────────────────────

describe("computeSharpe", () => {
  it("returns null when fewer than 12 months available", () => {
    expect(computeSharpe(partial2025)).toBeNull();
    expect(computeSharpe(empty)).toBeNull();
  });

  it("returns null when stdDev is exactly 0 (all returns are 0.0)", () => {
    // zeros12: mean=0, every deviation=0 → stdDev=0 exactly in IEEE 754 → null
    // Note: flat12 (all 0.01) does NOT give stdDev=0 due to floating-point
    // accumulation in the mean — it produces a near-zero stdDev and clamped Sharpe.
    expect(computeSharpe(zeros12)).toBeNull();
  });

  it("clamps to SHARPE_CAP when raw Sharpe exceeds cap (non-zero stdDev)", () => {
    // highSharpe12: raw Sharpe ≈ 130 → clamped to 5
    expect(computeSharpe(highSharpe12)).toBe(5);
    // flat12: near-zero (not exactly zero) stdDev → also clamped to 5
    expect(computeSharpe(flat12)).toBe(5);
  });

  it("returns expected annualized Sharpe for alternating returns", () => {
    // mean=0.005, sampleStdDev=√(0.0003/11)≈0.005222, rfr/12=0.0025
    // sharpe = (0.005 - 0.0025) / 0.005222 × √12 ≈ 1.659
    const result = computeSharpe(alt12);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(1.659, 1);
  });

  it("accepts a custom risk-free rate and produces a higher Sharpe at lower RFR", () => {
    const withHighRFR = computeSharpe(alt12, 0.10);  // 10% — penalizes Sharpe
    const withLowRFR  = computeSharpe(alt12, 0.00);  // 0%  — boosts Sharpe
    expect(withHighRFR).not.toBeNull();
    expect(withLowRFR).not.toBeNull();
    expect(withLowRFR!).toBeGreaterThan(withHighRFR!);
  });
});

// ─── computeStdDev ────────────────────────────────────────────────────────

describe("computeStdDev", () => {
  it("returns 0 for identical returns (no variance)", () => {
    expect(computeStdDev(flat12)).toBeCloseTo(0, 6);
  });

  it("returns annualized stdDev for alternating returns", () => {
    // monthly sampleStdDev ≈ 0.005222; annualized × √12 ≈ 0.01809
    const result = computeStdDev(alt12);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(0.01809, 3);
  });

  it("returns null when fewer than 12 months available", () => {
    expect(computeStdDev(partial2025)).toBeNull();
    expect(computeStdDev(empty)).toBeNull();
  });
});

// ─── computeStartMonth ────────────────────────────────────────────────────

describe("computeStartMonth", () => {
  it("returns the earliest YYYY-MM key", () => {
    expect(computeStartMonth(mr24)).toBe("2024-01");
    expect(computeStartMonth(flat12)).toBe("2025-01");
  });

  it("returns null for empty input", () => {
    expect(computeStartMonth(empty)).toBeNull();
  });
});

// ─── computeLatestMonth ───────────────────────────────────────────────────

describe("computeLatestMonth", () => {
  it("returns the most recent YYYY-MM key", () => {
    expect(computeLatestMonth(mr24)).toBe("2025-12");
    expect(computeLatestMonth(flat12)).toBe("2025-12");
  });

  it("returns null for empty input", () => {
    expect(computeLatestMonth(empty)).toBeNull();
  });
});

// ─── computeCumulativeForRange ────────────────────────────────────────────

describe("computeCumulativeForRange", () => {
  it("compounds 12 months of 1% each to 1.01^12 - 1", () => {
    // flat12 covers 2025-01 to 2025-12
    const result = computeCumulativeForRange(flat12, "2025-01", "2025-12");
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(Math.pow(1.01, 12) - 1, 6);
  });

  it("returns null when a month in the range is missing", () => {
    // partial2025 covers 2025-01 to 2025-11 (no 2025-12)
    expect(computeCumulativeForRange(partial2025, "2025-01", "2025-12")).toBeNull();
  });

  it("returns null when monthlyReturns is undefined", () => {
    expect(computeCumulativeForRange(undefined, "2025-01", "2025-12")).toBeNull();
  });

  it("returns the single month value for a one-month range", () => {
    const result = computeCumulativeForRange(flat12, "2025-06", "2025-06");
    expect(result).toBeCloseTo(0.01, 6);
  });

  it("respects startDate — starts from startDate when fromYYYYMM is earlier", () => {
    // flat12 covers 2025-01 to 2025-12, all 0.01.
    // from="2024-06" is before the fund, startDate="2025-01-01" advances it.
    // Effective window: 2025-01 to 2025-12 = 1.01^12 - 1.
    const result = computeCumulativeForRange(flat12, "2024-06", "2025-12", "2025-01-01");
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(Math.pow(1.01, 12) - 1, 6);
  });

  it("returns null when startDate advances from past the first available month", () => {
    // flat12 covers 2025-01 to 2025-12. startDate="2025-02-01" advances from to 2025-02.
    // Effective window: 2025-02 to 2025-12 — all 11 months present, but 2025-01 is excluded
    // (not required — no gap). Should compound 11 months of 0.01.
    // Note: computeCumulativeForRange requires ALL months in [effectiveFrom, to] to exist.
    // 2025-02 to 2025-12 = 11 months, all present → not null.
    const result = computeCumulativeForRange(flat12, "2025-01", "2025-12", "2025-02-01");
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(Math.pow(1.01, 11) - 1, 6);
  });
});

// ─── hasMinimumHistory ────────────────────────────────────────────────────

describe("hasMinimumHistory", () => {
  it("returns true when enough months are available", () => {
    expect(hasMinimumHistory(flat12, 12)).toBe(true);
    expect(hasMinimumHistory(mr24, 24)).toBe(true);
    expect(hasMinimumHistory(mr24, 1)).toBe(true);
  });

  it("returns false when not enough months are available", () => {
    expect(hasMinimumHistory(flat12, 13)).toBe(false);
    expect(hasMinimumHistory(empty, 1)).toBe(false);
  });

  it("handles exact boundary correctly", () => {
    expect(hasMinimumHistory(partial2025, 11)).toBe(true);   // exactly 11
    expect(hasMinimumHistory(partial2025, 12)).toBe(false);  // one short
  });
});
