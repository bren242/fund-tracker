import { Category, Fund } from "./types";

export interface CategoryMetric {
  name: string;
  avgMonthly: number;
  avgYtd: number;
  totalAum: number;
  fundCount: number;
  color: string;
}

export interface FundMetric {
  name: string;
  category: string;
  value: number;
}

const CAT_COLORS: Record<string, string> = {
  "bond-hedged": "#1e3a5f",
  "multi-strategy": "#2d5016",
  "equity-hedged": "#7c2d12",
  "blended": "#4a1d6e",
  "real-estate": "#064e3b",
  "open-trust": "#1e5a8f",
  "closed-trust": "#2a6aaf",
  "private-debt": "#78350f",
  "clo": "#3f3f46",
};

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

export function aggregateByCategory(categories: Category[]): CategoryMetric[] {
  return categories.map((cat) => {
    const monthlyVals = cat.funds
      .map((f) => f.monthlyReturn)
      .filter((v): v is number => v !== null);
    const ytdVals = cat.funds
      .map((f) => f.returns.ytd2026)
      .filter((v): v is number => v !== null);
    const aumVals = cat.funds
      .map((f) => f.aumMillions)
      .filter((v): v is number => v !== null);

    return {
      name: cat.name,
      avgMonthly: avg(monthlyVals) * 100,
      avgYtd: avg(ytdVals) * 100,
      totalAum: aumVals.reduce((s, v) => s + v, 0),
      fundCount: cat.funds.length,
      color: CAT_COLORS[cat.id] || "#6b7280",
    };
  });
}

export function topFundsByField(
  categories: Category[],
  field: "monthlyReturn" | "ytd2026",
  count: number
): FundMetric[] {
  const all: FundMetric[] = [];
  for (const cat of categories) {
    for (const fund of cat.funds) {
      const val = field === "monthlyReturn" ? fund.monthlyReturn : fund.returns.ytd2026;
      if (val !== null) {
        all.push({ name: fund.name, category: cat.name, value: val * 100 });
      }
    }
  }
  return all.sort((a, b) => b.value - a.value).slice(0, count);
}
