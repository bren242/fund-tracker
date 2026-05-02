import { describe, it, expect } from "vitest";
import {
  windowMonthKeys,
  computeCategoryAverageReturn,
  computeWorstMonth,
  computeCategoryStats,
  computeSameMonthCohortPosition,
} from "../lib/consistency";
import { Fund } from "../lib/types";

/* ── test helpers ─────────────────────────────────────────────────────────── */

function makeFund(
  id: string,
  name: string,
  monthlyReturns: Record<string, number>
): Fund {
  return {
    id,
    name,
    classification: "",
    startDate: null,
    manager: "",
    lastReportDate: null,
    monthlyReturn: null,
    returns: {
      ytd2026: null, y2025: null, y2024: null, y2023: null,
      y2022: null, y2021: null, y2020: null, y2019: null,
    },
    avgAnnualReturn: null,
    sharpe: null,
    stdDev: null,
    aumMillions: null,
    monthlyReturns,
  };
}

/* ── shared fixture: 24-month window ending 2026-04 ─────────────────────── */

const END_MONTH = "2026-04";
const WINDOW    = windowMonthKeys(END_MONTH, 24); // 2024-05 → 2026-04

// Benchmark: flat 0.01 every month
const BENCHMARK: Record<string, number> = {};
for (const m of WINDOW) BENCHMARK[m] = 0.01;

// טריו: mostly 0.015, worst month 2025-09 (−0.014), best 2025-10 (0.025)
const trioReturns: Record<string, number> = {};
for (const m of WINDOW) {
  if (m === "2025-09")      trioReturns[m] = -0.014;
  else if (m === "2025-10") trioReturns[m] =  0.025;
  else                      trioReturns[m] =  0.015;
}
const trio = makeFund("fund-24", "טריו", trioReturns);

// Fund A: alternating 0.018 / 0.012 (excess 0.008 / 0.002 — always positive, has variance)
const fundAReturns: Record<string, number> = {};
WINDOW.forEach((m, i) => { fundAReturns[m] = i % 2 === 0 ? 0.018 : 0.012; });
const fundA = makeFund("fund-a", "אלפא", fundAReturns);

// Fund B: alternating 0.005 / 0.02 (excess −0.005 / 0.01 — mixed wins)
const fundBReturns: Record<string, number> = {};
WINDOW.forEach((m, i) => { fundBReturns[m] = i % 2 === 0 ? 0.005 : 0.020; });
const fundB = makeFund("fund-b", "ביתא", fundBReturns);

// Fund C: 0.008 every month except 2025-06 (0.025) — mostly below benchmark
const fundCReturns: Record<string, number> = {};
for (const m of WINDOW) fundCReturns[m] = 0.008;
fundCReturns["2025-06"] = 0.025;
const fundC = makeFund("fund-c", "גמא", fundCReturns);

const ALL_FUNDS = [trio, fundA, fundB, fundC];

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  1. windowMonthKeys                                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */

describe("windowMonthKeys", () => {
  it("returns exactly windowSize months", () => {
    expect(windowMonthKeys("2026-04", 24)).toHaveLength(24);
    expect(windowMonthKeys("2026-04", 36)).toHaveLength(36);
    expect(windowMonthKeys("2026-04", 48)).toHaveLength(48);
  });

  it("last month equals endMonth", () => {
    const w = windowMonthKeys("2026-04", 24);
    expect(w[w.length - 1]).toBe("2026-04");
  });

  it("first month is endMonth − (windowSize − 1) months", () => {
    // 24M window ending 2026-04 → starts 2024-05
    expect(windowMonthKeys("2026-04", 24)[0]).toBe("2024-05");
  });

  it("handles year boundary correctly", () => {
    // 3M window ending 2025-02 → 2024-12, 2025-01, 2025-02
    const w = windowMonthKeys("2025-02", 3);
    expect(w).toEqual(["2024-12", "2025-01", "2025-02"]);
  });

  it("months are in ascending order", () => {
    const w = windowMonthKeys("2026-04", 24);
    for (let i = 1; i < w.length; i++) {
      expect(w[i] > w[i - 1]).toBe(true);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  2. computeCategoryAverageReturn                                             */
/* ═══════════════════════════════════════════════════════════════════════════ */

describe("computeCategoryAverageReturn", () => {
  it("returns arithmetic mean when >= 3 funds have data", () => {
    // trio(2025-09)=−0.014, fundA(2025-09)=0.018 (index 16, even), fundB(2025-09)=0.005 (even), fundC(2025-09)=0.008
    const expected = (-0.014 + 0.018 + 0.005 + 0.008) / 4;
    const result = computeCategoryAverageReturn(ALL_FUNDS, "2025-09");
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(expected, 10);
  });

  it("returns null when fewer than 3 funds have data for the month", () => {
    const funds = [
      makeFund("x", "x", { "2025-09": 0.01 }),
      makeFund("y", "y", { "2025-09": 0.02 }),
    ];
    expect(computeCategoryAverageReturn(funds, "2025-09")).toBeNull();
  });

  it("skips funds with no data for the requested month", () => {
    const funds = [
      makeFund("a", "a", { "2025-09": 0.01 }),
      makeFund("b", "b", { "2025-09": 0.02 }),
      makeFund("c", "c", { "2025-10": 0.05 }), // different month
    ];
    // Only 2 funds have data for 2025-09 → null
    expect(computeCategoryAverageReturn(funds, "2025-09")).toBeNull();
  });

  it("returns null when no fund has data for the month", () => {
    expect(computeCategoryAverageReturn(ALL_FUNDS, "2099-01")).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  3. computeWorstMonth                                                        */
/* ═══════════════════════════════════════════════════════════════════════════ */

describe("computeWorstMonth", () => {
  it("identifies the month with the lowest excess return", () => {
    // 2025-09: excess = −0.014 − 0.01 = −0.024 (worst)
    // 2025-10: excess =  0.025 − 0.01 =  0.015 (best)
    // all others: excess = 0.015 − 0.01 = 0.005
    const result = computeWorstMonth(trio, BENCHMARK, ALL_FUNDS, WINDOW);
    expect(result).not.toBeNull();
    expect(result!.monthKey).toBe("2025-09");
  });

  it("returns the correct fund return and benchmark return", () => {
    const result = computeWorstMonth(trio, BENCHMARK, ALL_FUNDS, WINDOW);
    expect(result!.fundReturn).toBeCloseTo(-0.014, 10);
    expect(result!.benchmarkReturn).toBeCloseTo(0.01, 10);
  });

  it("returns the correct fundVsBenchmark (excess)", () => {
    const result = computeWorstMonth(trio, BENCHMARK, ALL_FUNDS, WINDOW);
    // −0.014 − 0.01 = −0.024
    expect(result!.fundVsBenchmark).toBeCloseTo(-0.024, 10);
  });

  it("returns Hebrew month label", () => {
    const result = computeWorstMonth(trio, BENCHMARK, ALL_FUNDS, WINDOW);
    expect(result!.monthLabelHebrew).toBe("ספטמבר 2025");
  });

  it("returns category average return for the worst month", () => {
    const result = computeWorstMonth(trio, BENCHMARK, ALL_FUNDS, WINDOW);
    const expected = (-0.014 + 0.018 + 0.005 + 0.008) / 4;
    expect(result!.categoryAverageReturn).not.toBeNull();
    expect(result!.categoryAverageReturn!).toBeCloseTo(expected, 10);
  });

  it("returns null when fund has no data in the window", () => {
    const emptyFund = makeFund("empty", "empty", {});
    expect(computeWorstMonth(emptyFund, BENCHMARK, ALL_FUNDS, WINDOW)).toBeNull();
  });

  it("categoryAverageReturn is null when fewer than 3 other funds have data", () => {
    // Only 2 funds total in category for this month
    const tinyFunds = [trio, makeFund("x", "x", { "2025-09": 0.01 })];
    const result = computeWorstMonth(trio, BENCHMARK, tinyFunds, WINDOW);
    expect(result).not.toBeNull();
    expect(result!.categoryAverageReturn).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  4. computeCategoryStats                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

describe("computeCategoryStats", () => {
  it("returns a result with the correct category metadata", () => {
    const stats = computeCategoryStats(
      "equity-hedged", "לונג", ALL_FUNDS, BENCHMARK, WINDOW
    );
    expect(stats.categoryKey).toBe("equity-hedged");
    expect(stats.categoryLabel).toBe("לונג");
  });

  it("includes only funds with a valid (non-null) IR", () => {
    const stats = computeCategoryStats(
      "equity-hedged", "לונג", ALL_FUNDS, BENCHMARK, WINDOW
    );
    // All 4 funds have variance → all should have IR
    expect(stats.fundCount).toBeGreaterThan(0);
    for (const f of stats.funds) {
      expect(typeof f.ir).toBe("number");
      expect(isFinite(f.ir)).toBe(true);
    }
  });

  it("sorts funds descending by IR", () => {
    const stats = computeCategoryStats(
      "equity-hedged", "לונג", ALL_FUNDS, BENCHMARK, WINDOW
    );
    for (let i = 1; i < stats.funds.length; i++) {
      expect(stats.funds[i - 1].ir).toBeGreaterThanOrEqual(stats.funds[i].ir);
    }
  });

  it("Fund A (constant positive excess with variance) has the highest IR", () => {
    // Fund A: excess alternates 0.008/0.002 — always positive, moderate variance → highest IR
    const stats = computeCategoryStats(
      "equity-hedged", "לונג", ALL_FUNDS, BENCHMARK, WINDOW
    );
    expect(stats.funds[0].fundId).toBe("fund-a");
  });

  it("averageIR is the mean IR of qualifying funds", () => {
    const stats = computeCategoryStats(
      "equity-hedged", "לונג", ALL_FUNDS, BENCHMARK, WINDOW
    );
    if (stats.funds.length > 0) {
      const manual = stats.funds.reduce((s, f) => s + f.ir, 0) / stats.funds.length;
      expect(stats.averageIR).toBeCloseTo(manual, 2);
    }
  });

  it("returns empty result for a fund set with no monthly data", () => {
    const noDataFunds = [
      makeFund("x", "x", {}),
      makeFund("y", "y", {}),
    ];
    const stats = computeCategoryStats(
      "equity-hedged", "לונג", noDataFunds, BENCHMARK, WINDOW
    );
    expect(stats.fundCount).toBe(0);
    expect(stats.funds).toHaveLength(0);
    expect(stats.averageIR).toBe(0);
  });

  it("excludes fund with fewer months than minMonths threshold", () => {
    // Fund with only 11 months of data in the window (default minMonths=12)
    const shortFund = makeFund("short", "short", {});
    for (const m of WINDOW.slice(-11)) shortFund.monthlyReturns![m] = 0.015;
    const stats = computeCategoryStats(
      "eq", "eq", [shortFund], BENCHMARK, WINDOW
    );
    expect(stats.fundCount).toBe(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  5. computeSameMonthCohortPosition                                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

describe("computeSameMonthCohortPosition", () => {
  // Controlled cohort for deterministic rank/percentile checks
  const cohortFunds = [
    makeFund("f1", "f1", { "2025-09": 0.010 }),  // rank 1
    makeFund("f2", "f2", { "2025-09": 0.005 }),  // rank 2
    makeFund("f3", "f3", { "2025-09": -0.020 }), // rank 4
    makeFund("f4", "f4", { "2025-09": -0.025 }), // rank 5
  ];
  // testFund: −0.005 → rank 3 out of 5, beats f3 and f4
  const testFund = makeFund("test", "test", { "2025-09": -0.005 });
  const allCohort = [testFund, ...cohortFunds];

  it("returns the correct rank (1 = best)", () => {
    const pos = computeSameMonthCohortPosition(testFund, allCohort, "2025-09");
    expect(pos).not.toBeNull();
    expect(pos!.rank).toBe(3); // two funds above: 0.010 and 0.005
  });

  it("returns the correct total (all funds with data for that month)", () => {
    const pos = computeSameMonthCohortPosition(testFund, allCohort, "2025-09");
    expect(pos!.total).toBe(5);
  });

  it("returns the correct percentile (% of peers beaten)", () => {
    // beats f3 (−0.020) and f4 (−0.025) → 2 out of 4 others = 50%
    const pos = computeSameMonthCohortPosition(testFund, allCohort, "2025-09");
    expect(pos!.percentile).toBe(50);
  });

  it("rank 1 when fund has the highest return", () => {
    const best = makeFund("best", "best", { "2025-09": 0.999 });
    const pos = computeSameMonthCohortPosition(best, [...allCohort, best], "2025-09");
    expect(pos!.rank).toBe(1);
    expect(pos!.percentile).toBe(100);
  });

  it("rank = total when fund has the lowest return", () => {
    const worst = makeFund("worst", "worst", { "2025-09": -0.999 });
    const pos = computeSameMonthCohortPosition(worst, [...allCohort, worst], "2025-09");
    expect(pos!.rank).toBe(pos!.total);
    expect(pos!.percentile).toBe(0);
  });

  it("returns null when fund has no data for the month", () => {
    const noData = makeFund("nd", "nd", {});
    expect(computeSameMonthCohortPosition(noData, allCohort, "2025-09")).toBeNull();
  });

  it("returns null when fund is the only one with data", () => {
    const solo = makeFund("solo", "solo", { "2025-09": 0.01 });
    expect(computeSameMonthCohortPosition(solo, [solo], "2025-09")).toBeNull();
  });

  it("returns the fund's own return in fundReturn", () => {
    const pos = computeSameMonthCohortPosition(testFund, allCohort, "2025-09");
    expect(pos!.fundReturn).toBeCloseTo(-0.005, 10);
  });
});
