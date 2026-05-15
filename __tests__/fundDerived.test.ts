import { describe, it, expect } from "vitest";
import { getLatestMonthAcrossFunds } from "../lib/fundDerived";
import type { Fund } from "../lib/types";

// Minimal Fund stub — only the fields getLatestMonthAcrossFunds touches
function makeFund(id: string, monthlyReturns?: Record<string, number>): Fund {
  return {
    id,
    name: id,
    classification: "",
    startDate: null,
    manager: "",
    lastUpdated: null,
    monthlyReturn: null,
    returns: { ytd2026: null, y2025: null, y2024: null, y2023: null, y2022: null, y2021: null, y2020: null, y2019: null },
    avgAnnualReturn: null,
    sharpe: null,
    stdDev: null,
    aumMillions: null,
    monthlyReturns,
  } as Fund;
}

describe("getLatestMonthAcrossFunds", () => {
  it("returns the latest month across funds with different data ranges", () => {
    const fundA = makeFund("a", { "2025-10": 0.01, "2025-11": 0.02 });
    const fundB = makeFund("b", { "2025-10": 0.01, "2025-12": 0.03, "2026-01": 0.01 });
    expect(getLatestMonthAcrossFunds([fundA, fundB])).toBe("2026-01");
  });

  it("returns null for an empty fund array", () => {
    expect(getLatestMonthAcrossFunds([])).toBeNull();
  });

  it("ignores funds with no monthlyReturns", () => {
    const noData = makeFund("x", undefined);
    const withData = makeFund("y", { "2025-08": 0.01, "2025-09": 0.02 });
    expect(getLatestMonthAcrossFunds([noData, withData])).toBe("2025-09");
  });

  it("returns null when all funds have no monthlyReturns", () => {
    expect(getLatestMonthAcrossFunds([makeFund("a"), makeFund("b")])).toBeNull();
  });
});
