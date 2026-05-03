import { describe, it, expect } from "vitest";
import { computeMaxDrawdown, computeWindowMetrics, computeAllWindows } from "../lib/consistency";

/* ─── helpers ─────────────────────────────────────────────────────────── */

/** Month keys spanning N months starting from 2020-01 */
function keys(n: number, start = "2020-01"): string[] {
  const [y, m] = start.split("-").map(Number);
  const result: string[] = [];
  for (let i = 0; i < n; i++) {
    const mo = ((m - 1 + i) % 12) + 1;
    const yr = y + Math.floor((m - 1 + i) / 12);
    result.push(`${yr}-${String(mo).padStart(2, "0")}`);
  }
  return result;
}

/* ─── tests ────────────────────────────────────────────────────────────── */

describe("computeMaxDrawdown", () => {
  // 1. Empty input → no drawdown
  it("returns zero drawdown for empty input", () => {
    const r = computeMaxDrawdown([], []);
    expect(r.drawdownPct).toBe(0);
    expect(r.peakMonthIndex).toBeNull();
    expect(r.troughMonthIndex).toBeNull();
    expect(r.durationMonths).toBe(0);
    expect(r.recoveryMonths).toBeNull();
    expect(r.monthsAvailable).toBe(0);
  });

  // 2. All positive returns → no drawdown
  it("returns zero drawdown for all-positive returns", () => {
    const r = computeMaxDrawdown([0.01, 0.02, 0.015], keys(3));
    expect(r.drawdownPct).toBe(0);
    expect(r.peakMonthIndex).toBeNull();
  });

  // 3. Single dip with recovery
  it("detects single dip [+5%, -10%, +15%] and recovery", () => {
    const r = computeMaxDrawdown([0.05, -0.10, 0.15], keys(3));
    // wealth: 1.05, 0.945, 1.08675 — peak=1.05, dd = 0.945/1.05 - 1 = -0.10
    expect(r.drawdownPct).toBeCloseTo(-10.0, 1);
    expect(r.peakMonthIndex).toBe(0);
    expect(r.troughMonthIndex).toBe(1);
    expect(r.durationMonths).toBe(1);
    // recovery at index 2: recoveryMonths = 2 - 1 = 1
    expect(r.recoveryMonths).toBe(1);
  });

  // 4. Multi-month drawdown — geometric compounding
  it("compounds drawdown geometrically over multiple months", () => {
    const r = computeMaxDrawdown([0.05, -0.05, -0.05, -0.05, 0.20], keys(5));
    // wealth: 1.05, 0.9975, 0.947625, 0.90024375, 1.08029…
    // runningMax always 1.05 until last month (1.08029)
    // maxDD at index 3: 0.90024/1.05 - 1 = -0.1426…
    expect(r.drawdownPct).toBeLessThan(-14);
    expect(r.drawdownPct).toBeGreaterThan(-15);
    expect(r.peakMonthIndex).toBe(0);
    expect(r.troughMonthIndex).toBe(3);
    expect(r.durationMonths).toBe(3);
    // recovery at index 4: wealth[4] = 1.08029 >= 1.05 → recoveryMonths = 1
    expect(r.recoveryMonths).toBe(1);
  });

  // 5. Not yet recovered
  it("returns recoveryMonths=null when still in drawdown", () => {
    const r = computeMaxDrawdown([0.10, -0.20, 0.05], keys(3));
    // wealth: 1.10, 0.88, 0.924 — peak=1.10, never recovers
    expect(r.drawdownPct).toBeLessThan(-19);
    expect(r.recoveryMonths).toBeNull();
  });

  // 6. Two separate drawdowns — picks the larger
  it("picks the larger of two drawdowns", () => {
    // Small dip at 1, recovery at 2, bigger dip at 4
    const r = computeMaxDrawdown([0.10, -0.05, 0.10, 0.10, -0.30, 0.50], keys(6));
    // Rough: first dip ~-5%, second dip after a higher peak ~much larger
    // The second drawdown should dominate
    expect(r.drawdownPct).toBeLessThan(-20);
    expect(r.troughMonthIndex).toBe(4);
  });

  // 7. Single month drawdown → durationMonths=1
  it("durationMonths=1 for single-month dip [+5%, -30%, +50%]", () => {
    const r = computeMaxDrawdown([0.05, -0.30, 0.50], keys(3));
    expect(r.durationMonths).toBe(1);
    expect(r.peakMonthIndex).toBe(0);
    expect(r.troughMonthIndex).toBe(1);
  });

  // 8. Peak detection: after gains, peak is NOT the first month
  it("correctly identifies rolling peak after two gains [+10%, +10%, -10%]", () => {
    const r = computeMaxDrawdown([0.10, 0.10, -0.10], keys(3));
    // wealth: 1.10, 1.21, 1.089 — peak at index 1 (not 0), dd = 1.089/1.21-1 = -10% exactly
    expect(r.drawdownPct).toBeCloseTo(-10.0, 1);
    expect(r.peakMonthIndex).toBe(1);
    expect(r.troughMonthIndex).toBe(2);
  });

  // 9. Peak not at start of array
  it("correctly identifies peak that is not the first month", () => {
    const r = computeMaxDrawdown([0.01, 0.05, 0.10, -0.25, 0.02], keys(5));
    // peak is at index 2 (highest wealth before trough at index 3)
    expect(r.peakMonthIndex).toBe(2);
    expect(r.troughMonthIndex).toBe(3);
  });

  // 10. Mismatched lengths → throw
  it("throws when returns and keys lengths differ", () => {
    expect(() => computeMaxDrawdown([0.01, 0.02], ["2020-01"])).toThrow();
  });
});

/* ─── computeWindowMetrics ─────────────────────────────────────────────── */

describe("computeWindowMetrics", () => {
  // Shared fixture: 4 months, excess = [0.01, 0, 0.01, 0] → IR ≈ 3.00
  // avg=0.005, sampleStd=0.005773..., IR = 0.005/0.005773*√12 ≈ 3.00
  const irFund = [0.02, 0.01, 0.02, 0.01];
  const irBm   = [0.01, 0.01, 0.01, 0.01];
  const irCat  = [0.01, 0.01, 0.01, 0.01];
  const irKeys = keys(4, "2023-01");

  // 1. Empty input
  it("returns null for empty arrays", () => {
    expect(computeWindowMetrics([], [], [], [], 'lifetime', [])).toBeNull();
  });

  // 2. 12M window with too few months → null
  it("returns null for 12M window when data has only 6 months", () => {
    const n = 6;
    const r = computeWindowMetrics(
      Array(n).fill(0.01), Array(n).fill(0.005),
      Array(n).fill(0.008), keys(n), '12M', []
    );
    expect(r).toBeNull();
  });

  // 3. 36M window with 24 months → null
  it("returns null for 36M window when data has only 24 months", () => {
    const n = 24;
    const r = computeWindowMetrics(
      Array(n).fill(0.01), Array(n).fill(0.005),
      Array(n).fill(0.008), keys(n), '36M', []
    );
    expect(r).toBeNull();
  });

  // 4. lifetime uses all months
  it("lifetime window uses all provided months", () => {
    const n = 7;
    const r = computeWindowMetrics(
      Array(n).fill(0.01), Array(n).fill(0.005),
      Array(n).fill(0.008), keys(n), 'lifetime', []
    );
    expect(r).not.toBeNull();
    expect(r!.monthsCount).toBe(7);
  });

  // 5. YTD slices to current year
  it("YTD: 15-month array (3 in 2022, 12 in 2023) → monthsCount=12", () => {
    // keys(15, "2022-10") = 2022-10 … 2023-12, last year = 2023
    const n = 15;
    const k = keys(n, "2022-10");
    const r = computeWindowMetrics(
      Array(n).fill(0.01), Array(n).fill(0.005),
      Array(n).fill(0.008), k, 'YTD', []
    );
    expect(r).not.toBeNull();
    expect(r!.monthsCount).toBe(12);
  });

  // 6. YTD with only 1 month in current year
  it("YTD with only 1 month in current year returns monthsCount=1", () => {
    // keys(13,"2022-01") = 2022-01 … 2023-01 (12 + 1)
    const n = 13;
    const k = keys(n, "2022-01");
    const r = computeWindowMetrics(
      Array(n).fill(0.01), Array(n).fill(0.005),
      Array(n).fill(0.008), k, 'YTD', []
    );
    expect(r).not.toBeNull();
    expect(r!.monthsCount).toBe(1);
  });

  // 7. IR formula verification
  it("IR ≈ 3.00 for avg(excess)=0.005, sampleStd≈0.005773, ×√12", () => {
    const r = computeWindowMetrics(irFund, irBm, irCat, irKeys, 'lifetime', []);
    expect(r).not.toBeNull();
    expect(r!.informationRatio).toBeCloseTo(3.0, 1);
  });

  // 8. IR null when sampleStd = 0 (constant excess)
  it("IR is null when all monthly excess returns are identical", () => {
    const n = 6;
    // excess = 0.01 - 0.005 = 0.005 every month → std = 0
    const r = computeWindowMetrics(
      Array(n).fill(0.01), Array(n).fill(0.005),
      Array(n).fill(0.007), keys(n), 'lifetime', []
    );
    expect(r!.informationRatio).toBeNull();
  });

  // 9. excessReturn = fundReturn − benchmarkReturn
  it("excessReturn equals fundReturn minus benchmarkReturn", () => {
    const r = computeWindowMetrics(irFund, irBm, irCat, irKeys, 'lifetime', []);
    expect(r).not.toBeNull();
    expect(r!.excessReturn).toBeCloseTo(r!.fundReturn - r!.benchmarkReturn, 1);
  });

  // 10. monthsAboveBenchmark
  it("monthsAboveBenchmark counts months where fund > benchmark", () => {
    // fund beats bm at indices 0 and 2 only: 0.02>0.01 ✓, 0.005<0.01 ✗
    const fund = [0.02, 0.005, 0.02, 0.005];
    const bm   = [0.01, 0.01,  0.01, 0.01 ];
    const cat  = Array(4).fill(0.01);
    const r = computeWindowMetrics(fund, bm, cat, keys(4), 'lifetime', []);
    expect(r!.monthsAboveBenchmark).toEqual({ count: 2, total: 4 });
  });

  // 11. upCapture with all-positive benchmark → downCapture null
  it("upCapture ≈ 200 when all benchmark months positive; downCapture null", () => {
    // avgFUp=0.02, avgBUp=0.01 → upCapture = 0.02/0.01*100 = 200
    const n = 6;
    const r = computeWindowMetrics(
      Array(n).fill(0.02), Array(n).fill(0.01),
      Array(n).fill(0.01), keys(n), 'lifetime', []
    );
    expect(r).not.toBeNull();
    expect(r!.upCapture).toBeCloseTo(200, 0);
    expect(r!.downCapture).toBeNull();
  });

  // 12. downCapture with all-negative benchmark → upCapture null
  it("downCapture ≈ 50 when all benchmark months negative; upCapture null", () => {
    // avgFDn=-0.005, avgBDn=-0.01 → downCapture = (-0.005)/(-0.01)*100 = 50
    const n = 6;
    const r = computeWindowMetrics(
      Array(n).fill(-0.005), Array(n).fill(-0.01),
      Array(n).fill(-0.01),  keys(n), 'lifetime', []
    );
    expect(r).not.toBeNull();
    expect(r!.upCapture).toBeNull();
    expect(r!.downCapture).toBeCloseTo(50, 0);
  });

  // 13. rankInCategory = 1 when fund has highest IR
  it("rankInCategory=1 when fund IR is the highest in category", () => {
    // fund IR ≈ 3.00; all others (0.5, 1.0, 2.0) are below
    const r = computeWindowMetrics(irFund, irBm, irCat, irKeys, 'lifetime', [0.5, 1.0, 2.0]);
    expect(r!.rankInCategory).toBe(1);
    expect(r!.totalInCategory).toBe(3);
  });

  // 14. rankInCategory = totalInCategory+1 when fund has lowest IR
  it("rankInCategory=4 when all 3 other funds have higher IR than fund", () => {
    // fund IR ≈ 3.00; all others (5.0, 4.0, 3.5) are above
    const r = computeWindowMetrics(irFund, irBm, irCat, irKeys, 'lifetime', [5.0, 4.0, 3.5]);
    expect(r!.rankInCategory).toBe(4);
    expect(r!.totalInCategory).toBe(3);
  });

  // 15. Tied IR: only strictly-above funds counted
  it("tied IR: fund with same IR as peer is NOT counted as above", () => {
    // fund IR ≈ 3.00; peers = [5.0, 3.0, 1.0] → only 5.0 strictly above → rank=2
    const r = computeWindowMetrics(irFund, irBm, irCat, irKeys, 'lifetime', [5.0, 3.0, 1.0]);
    expect(r!.rankInCategory).toBe(2);
  });
});

/* ─── computeAllWindows ────────────────────────────────────────────────── */

describe("computeAllWindows", () => {
  // 16. 6-month fund: only YTD and lifetime non-null
  it("6-month fund: YTD and lifetime non-null, 12M/24M/36M null", () => {
    const n = 6;
    const k = keys(n, "2023-07"); // 2023-07 … 2023-12, all in 2023
    const f = Array(n).fill(0.01);
    const b = Array(n).fill(0.005);
    const c = Array(n).fill(0.008);
    const result = computeAllWindows(f, b, c, k, {});
    expect(result['YTD']).not.toBeNull();
    expect(result['lifetime']).not.toBeNull();
    expect(result['12M']).toBeNull();
    expect(result['24M']).toBeNull();
    expect(result['36M']).toBeNull();
  });
});
