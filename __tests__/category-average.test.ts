import { describe, it, expect } from "vitest";
import {
  monthlyCategoryAverage,
  ytdCategoryAverage,
  rolling24mCategoryAverage,
  getFundsInCategory,
} from "../lib/category-average";
import { FundsData, Fund } from "../lib/types";

/* ── helpers ─────────────────────────────────────────────────────────────── */

function makeFund(
  id: string,
  monthlyReturns: Record<string, number>
): Fund {
  return {
    id,
    name: `Fund ${id}`,
    classification: "",
    startDate: null,
    manager: "",
    lastReportDate: null,
    monthlyReturn: null,
    returns: {
      ytd2026: null,
      y2025: null,
      y2024: null,
      y2023: null,
      y2022: null,
      y2021: null,
      y2020: null,
      y2019: null,
    },
    avgAnnualReturn: null,
    sharpe: null,
    stdDev: null,
    aumMillions: null,
    monthlyReturns,
  };
}

function makeFundsData(
  funds: Fund[],
  categoryId = "test-cat"
): FundsData {
  return {
    lastUpdated: "2025-01",
    categories: [
      {
        id: categoryId,
        name: "Test Category",
        parentSection: "Test",
        funds,
      },
    ],
  };
}

/* ── 1. monthlyCategoryAverage ───────────────────────────────────────────── */

describe("monthlyCategoryAverage", () => {
  it("returns arithmetic mean of 3 funds for a given month", () => {
    // 0.01 + 0.02 + 0.03 = 0.06 / 3 = 0.02
    const data = makeFundsData([
      makeFund("a", { "2025-01": 0.01 }),
      makeFund("b", { "2025-01": 0.02 }),
      makeFund("c", { "2025-01": 0.03 }),
    ]);
    const result = monthlyCategoryAverage(data, "test-cat", "2025-01");
    expect(result).toBeCloseTo(0.02, 12);
  });

  it("returns null when fewer than 3 funds have data", () => {
    const data = makeFundsData([
      makeFund("a", { "2025-01": 0.01 }),
      makeFund("b", { "2025-01": 0.02 }),
    ]);
    expect(monthlyCategoryAverage(data, "test-cat", "2025-01")).toBeNull();
  });

  it("skips funds that have no data for the requested month", () => {
    // Only 2 funds have "2025-01"; result should be null (< 3 valid)
    const data = makeFundsData([
      makeFund("a", { "2025-01": 0.01 }),
      makeFund("b", { "2025-01": 0.02 }),
      makeFund("c", { "2025-02": 0.05 }), // different month
    ]);
    expect(monthlyCategoryAverage(data, "test-cat", "2025-01")).toBeNull();
  });

  it("returns null for an unknown category", () => {
    const data = makeFundsData([
      makeFund("a", { "2025-01": 0.01 }),
    ]);
    expect(monthlyCategoryAverage(data, "other-cat", "2025-01")).toBeNull();
  });
});

/* ── 2. fewer than 3 → null (already covered above; explicit variant) ─────── */

describe("monthlyCategoryAverage — minimum threshold", () => {
  it("returns a number with exactly 3 funds", () => {
    const data = makeFundsData([
      makeFund("a", { "2025-03": 0.00 }),
      makeFund("b", { "2025-03": 0.06 }),
      makeFund("c", { "2025-03": 0.03 }),
    ]);
    const result = monthlyCategoryAverage(data, "test-cat", "2025-03");
    expect(result).not.toBeNull();
    expect(result).toBeCloseTo(0.03, 12);
  });
});

/* ── 3. ytdCategoryAverage — compound calculation ─────────────────────────── */

describe("ytdCategoryAverage", () => {
  it("compounds 3 months correctly and averages across 3 funds", () => {
    /**
     * Fund A: Jan=1%, Feb=2%, Mar=3%
     *   YTD_A = (1.01 × 1.02 × 1.03) − 1
     *
     * Fund B: Jan=2%, Feb=1%, Mar=−1%
     *   YTD_B = (1.02 × 1.01 × 0.99) − 1
     *
     * Fund C: Jan=0%, Feb=1%, Mar=2%
     *   YTD_C = (1.00 × 1.01 × 1.02) − 1
     *
     * Expected = (YTD_A + YTD_B + YTD_C) / 3
     */
    const ytdA = 1.01 * 1.02 * 1.03 - 1;
    const ytdB = 1.02 * 1.01 * 0.99 - 1;
    const ytdC = 1.0  * 1.01 * 1.02 - 1;
    const expected = (ytdA + ytdB + ytdC) / 3;

    const data = makeFundsData([
      makeFund("a", { "2025-01": 0.01, "2025-02": 0.02, "2025-03": 0.03 }),
      makeFund("b", { "2025-01": 0.02, "2025-02": 0.01, "2025-03": -0.01 }),
      makeFund("c", { "2025-01": 0.00, "2025-02": 0.01, "2025-03": 0.02 }),
    ]);

    const result = ytdCategoryAverage(data, "test-cat", 2025, 3);
    expect(result).toBeCloseTo(expected, 12);
  });

  it("excludes funds missing any month in the range", () => {
    // Fund C is missing Feb — only A and B qualify → result null (< 3)
    const data = makeFundsData([
      makeFund("a", { "2025-01": 0.01, "2025-02": 0.02, "2025-03": 0.03 }),
      makeFund("b", { "2025-01": 0.02, "2025-02": 0.01, "2025-03": -0.01 }),
      makeFund("c", { "2025-01": 0.00,                   "2025-03": 0.02 }),
    ]);
    expect(ytdCategoryAverage(data, "test-cat", 2025, 3)).toBeNull();
  });

  it("returns null when fewer than 3 qualifying funds", () => {
    const data = makeFundsData([
      makeFund("a", { "2025-01": 0.01, "2025-02": 0.02 }),
      makeFund("b", { "2025-01": 0.02, "2025-02": 0.01 }),
    ]);
    expect(ytdCategoryAverage(data, "test-cat", 2025, 2)).toBeNull();
  });
});

/* ── 4. rolling24mCategoryAverage ───────────────────────────────────────── */

describe("rolling24mCategoryAverage", () => {
  it("covers exactly 24 months when all funds are complete", () => {
    // Build 3 funds each with 0.01 return for every month in 2024 + 2025
    const months: Record<string, number> = {};
    for (let m = 1; m <= 12; m++) {
      months[`2024-${String(m).padStart(2, "0")}`] = 0.01;
      months[`2025-${String(m).padStart(2, "0")}`] = 0.01;
    }
    const data = makeFundsData([
      makeFund("a", { ...months }),
      makeFund("b", { ...months }),
      makeFund("c", { ...months }),
    ]);
    const result = rolling24mCategoryAverage(data, "test-cat", "2025-12");
    // Each fund: 1.01^24 − 1
    const expected = Math.pow(1.01, 24) - 1;
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(expected, 12);
  });

  it("returns null when a fund is missing even one of the 24 months", () => {
    const months: Record<string, number> = {};
    for (let m = 1; m <= 12; m++) {
      months[`2024-${String(m).padStart(2, "0")}`] = 0.01;
      months[`2025-${String(m).padStart(2, "0")}`] = 0.01;
    }
    // Remove one month from each fund so none qualifies
    const m1 = { ...months }; delete m1["2024-06"];
    const m2 = { ...months }; delete m2["2025-03"];
    const m3 = { ...months }; delete m3["2024-11"];
    const data = makeFundsData([
      makeFund("a", m1),
      makeFund("b", m2),
      makeFund("c", m3),
    ]);
    expect(rolling24mCategoryAverage(data, "test-cat", "2025-12")).toBeNull();
  });
});
