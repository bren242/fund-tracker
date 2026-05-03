import { describe, it, expect } from "vitest";
import { computeMaxDrawdown } from "../lib/consistency";

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
