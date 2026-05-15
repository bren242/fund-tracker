import { describe, it, expect } from "vitest";
import {
  rangeToDateRange,
  formatMonthHe,
  compareYYYYMM,
  addMonths,
  MONTHS_HE,
  DEFAULT_RANGE,
} from "../lib/dateRange";

const LATEST = "2026-04";

// ── rangeToDateRange ──────────────────────────────────────────────────────────

describe("rangeToDateRange — presets", () => {
  it("ytd: from = first month of anchor year", () => {
    const r = rangeToDateRange("ytd", LATEST);
    expect(r).toEqual({ from: "2026-01", to: "2026-04" });
  });

  it("12m: 12 months ending at anchor (-11)", () => {
    const r = rangeToDateRange("12m", LATEST);
    expect(r).toEqual({ from: "2025-05", to: "2026-04" });
  });

  it("3y: 36 months ending at anchor (-36)", () => {
    const r = rangeToDateRange("3y", LATEST);
    expect(r).toEqual({ from: "2023-04", to: "2026-04" });
  });

  it("5y: 60 months ending at anchor (-60)", () => {
    const r = rangeToDateRange("5y", LATEST);
    expect(r).toEqual({ from: "2021-04", to: "2026-04" });
  });

  it("max: always from 2019-01", () => {
    const r = rangeToDateRange("max", LATEST);
    expect(r).toEqual({ from: "2019-01", to: "2026-04" });
  });

  it("ytd with January anchor: from === to anchor", () => {
    const r = rangeToDateRange("ytd", "2026-01");
    expect(r).toEqual({ from: "2026-01", to: "2026-01" });
  });
});

describe("rangeToDateRange — latestMonth null", () => {
  it("returns null for any preset when latestMonth is null", () => {
    expect(rangeToDateRange("ytd",  null)).toBeNull();
    expect(rangeToDateRange("12m",  null)).toBeNull();
    expect(rangeToDateRange("3y",   null)).toBeNull();
    expect(rangeToDateRange("5y",   null)).toBeNull();
    expect(rangeToDateRange("max",  null)).toBeNull();
  });
});

describe("rangeToDateRange — custom", () => {
  it("custom with from < to: returns as-is", () => {
    const r = rangeToDateRange("custom", null, "2024-01", "2025-12");
    expect(r).toEqual({ from: "2024-01", to: "2025-12" });
  });

  it("custom with from > to: auto-swaps", () => {
    const r = rangeToDateRange("custom", null, "2025-12", "2024-01");
    expect(r).toEqual({ from: "2024-01", to: "2025-12" });
  });

  it("custom with equal from and to: returns same month", () => {
    const r = rangeToDateRange("custom", null, "2025-06", "2025-06");
    expect(r).toEqual({ from: "2025-06", to: "2025-06" });
  });

  it("custom with missing from: returns null", () => {
    expect(rangeToDateRange("custom", null, undefined, "2025-12")).toBeNull();
  });

  it("custom with missing to: returns null", () => {
    expect(rangeToDateRange("custom", null, "2024-01", undefined)).toBeNull();
  });

  it("custom ignores latestMonth (anchor irrelevant)", () => {
    const r = rangeToDateRange("custom", "2025-01", "2020-03", "2021-03");
    expect(r).toEqual({ from: "2020-03", to: "2021-03" });
  });
});

// ── addMonths ─────────────────────────────────────────────────────────────────

describe("addMonths", () => {
  it("adds positive months correctly", () => {
    expect(addMonths("2025-11", 2)).toBe("2026-01");
  });

  it("subtracts months crossing year boundary", () => {
    expect(addMonths("2026-02", -3)).toBe("2025-11");
  });

  it("subtracts 11 months for 12m range from common anchor", () => {
    expect(addMonths("2026-04", -11)).toBe("2025-05");
  });
});

// ── formatMonthHe ─────────────────────────────────────────────────────────────

describe("formatMonthHe", () => {
  it("formats January correctly", () => {
    expect(formatMonthHe("2026-01")).toBe("ינואר 2026");
  });

  it("formats April correctly", () => {
    expect(formatMonthHe("2026-04")).toBe("אפריל 2026");
  });

  it("formats December correctly", () => {
    expect(formatMonthHe("2025-12")).toBe("דצמבר 2025");
  });

  it("uses all 12 month names without duplicates", () => {
    expect(new Set(MONTHS_HE).size).toBe(12);
  });
});

// ── compareYYYYMM ─────────────────────────────────────────────────────────────

describe("compareYYYYMM", () => {
  it("a < b returns -1", () => {
    expect(compareYYYYMM("2024-01", "2025-01")).toBe(-1);
  });

  it("a > b returns 1", () => {
    expect(compareYYYYMM("2026-03", "2026-01")).toBe(1);
  });

  it("a === b returns 0", () => {
    expect(compareYYYYMM("2025-06", "2025-06")).toBe(0);
  });

  it("cross-year comparison", () => {
    expect(compareYYYYMM("2025-12", "2026-01")).toBe(-1);
  });
});

// ── DEFAULT_RANGE ─────────────────────────────────────────────────────────────

describe("constants", () => {
  it("DEFAULT_RANGE is 12m", () => {
    expect(DEFAULT_RANGE).toBe("12m");
  });
});
