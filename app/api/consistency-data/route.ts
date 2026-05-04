/**
 * GET /api/consistency-data?fundId=<id>&endMonth=YYYY-MM&client=<key>
 *
 * Returns all consistency metrics for a single fund, computed over
 * the rolling 24-month window ending at endMonth.
 */
import { NextRequest, NextResponse } from "next/server";
import { getClientKeyFromRequest } from "@/lib/clientKey";
import { storageRead } from "@/lib/storage";
import { FundsData, Fund, Category, Benchmark } from "@/lib/types";
import {
  getBenchmarkForCategory,
  blendBenchmarkReturns,
  calcConsistencyVsBenchmark,
} from "@/lib/consistency";
import {
  getFundsInCategory,
  monthlyCategoryAverage,
  ytdCategoryAverage,
  rolling24mCategoryAverage,
} from "@/lib/category-average";

/* ── helpers ─────────────────────────────────────────────────────────────── */

function shiftYM(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + m - 1 + delta;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

function monthRange(start: string, end: string): string[] {
  const months: string[] = [];
  let cur = start;
  while (cur <= end) { months.push(cur); cur = shiftYM(cur, 1); }
  return months;
}

/** Compound return over a list of months. Returns null if any month is missing. */
function compound(mr: Record<string, number>, months: string[]): number | null {
  if (months.length === 0) return null;
  let c = 1;
  for (const m of months) {
    const r = mr[m];
    if (r == null || Number.isNaN(r)) return null;
    c *= 1 + r;
  }
  return c - 1;
}

/** Find a fund and its containing category across all categories. */
function findFund(
  fd: FundsData,
  fundId: string
): { fund: Fund; category: Category } | null {
  for (const cat of fd.categories) {
    const fund = cat.funds.find((f) => f.id === fundId);
    if (fund) return { fund, category: cat };
  }
  return null;
}

/* ── route handler ───────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const clientKey = getClientKeyFromRequest(req.url);
  const fundId   = url.searchParams.get("fundId");
  const endMonth = url.searchParams.get("endMonth");

  if (!fundId || !endMonth || !/^\d{4}-\d{2}$/.test(endMonth)) {
    return NextResponse.json(
      { error: "Missing or invalid fundId / endMonth (expected YYYY-MM)" },
      { status: 400 }
    );
  }

  const [fundsData, benchmarks] = await Promise.all([
    storageRead<FundsData>(`funds:${clientKey}`, { lastUpdated: "", categories: [] }),
    storageRead<Benchmark[]>(`benchmarks:${clientKey}`, []),
  ]);

  const found = findFund(fundsData, fundId);
  if (!found) {
    return NextResponse.json({ error: "Fund not found" }, { status: 404 });
  }
  const { fund, category } = found;
  const categoryId = category.id;
  const fundMR = fund.monthlyReturns ?? {};

  /* ── 24M rolling window ────────────────────────────────────────────────── */
  const rolling24Start  = shiftYM(endMonth, -23);
  const rolling24Months = monthRange(rolling24Start, endMonth);

  // Fund returns filtered to the 24M window
  const fund24MR: Record<string, number> = {};
  for (const m of rolling24Months) {
    if (fundMR[m] != null) fund24MR[m] = fundMR[m];
  }

  /* ── IR + vsBenchmark ──────────────────────────────────────────────────── */
  let ir: number | null = null;
  let vsBenchmark: {
    monthsAbove: number; monthsBelow: number; totalMonths: number;
    percentageAbove: number; benchmarkName: string; insufficientData: boolean;
  } = { monthsAbove: 0, monthsBelow: 0, totalMonths: 0, percentageAbove: 0, benchmarkName: "—", insufficientData: true };

  const blend = getBenchmarkForCategory(categoryId);
  if (blend && benchmarks.length > 0) {
    const blendedMR = blendBenchmarkReturns(blend, benchmarks);
    const blended24MR: Record<string, number> = {};
    for (const m of rolling24Months) {
      if (blendedMR[m] != null) blended24MR[m] = blendedMR[m];
    }
    const result = calcConsistencyVsBenchmark(fund24MR, blended24MR, 12);
    ir = result?.ir ?? null;

    const bmParts = Object.entries(blend).map(([id, w]) => {
      const bm = benchmarks.find((b) => b.id === id);
      return bm ? `${Math.round(w * 100)}% ${bm.name}` : id;
    });
    const benchmarkName = bmParts.join(" + ");

    vsBenchmark = result
      ? {
          monthsAbove: result.wins,
          monthsBelow: result.total - result.wins,
          totalMonths: result.total,
          percentageAbove: result.score,
          benchmarkName,
          insufficientData: result.total < 12,
        }
      : { monthsAbove: 0, monthsBelow: 0, totalMonths: 0, percentageAbove: 0, benchmarkName, insufficientData: true };
  }

  /* ── vsCategory (24M window) ───────────────────────────────────────────── */
  let above = 0, below = 0, totalCat = 0;
  for (const m of rolling24Months) {
    const fv = fundMR[m];
    if (fv == null) continue;
    const avg = monthlyCategoryAverage(fundsData, categoryId, m);
    if (avg == null) continue;
    totalCat++;
    if (fv > avg) above++; else below++;
  }
  const vsCategory = {
    monthsAbove: above,
    monthsBelow: below,
    totalMonths: totalCat,
    percentageAbove: totalCat > 0 ? Math.round((above / totalCat) * 10_000) / 100 : 0,
    insufficientData: totalCat < 12,
  };

  /* ── Category metadata ─────────────────────────────────────────────────── */
  const allCatFunds = getFundsInCategory(fundsData, categoryId);
  const fundsWithMonthlyData = allCatFunds.filter(
    (f) => Object.keys(f.monthlyReturns ?? {}).length > 0
  ).length;

  /* ── Monthly comparison ────────────────────────────────────────────────── */
  const monthlyFundReturn = fundMR[endMonth] ?? null;
  const monthlyCatAvg = monthlyCategoryAverage(fundsData, categoryId, endMonth);

  /* ── YTD comparison ────────────────────────────────────────────────────── */
  const [endYearStr, endMonthStr] = endMonth.split("-");
  const endYear = parseInt(endYearStr, 10);
  const endMonthNum = parseInt(endMonthStr, 10);
  const ytdMonths   = monthRange(`${endYear}-01`, endMonth);
  const fundYtd     = compound(fundMR, ytdMonths);
  const catYtd      = ytdCategoryAverage(fundsData, categoryId, endYear, endMonthNum);

  /* ── Rolling 24M comparison ────────────────────────────────────────────── */
  const fund24mReturn = compound(fundMR, rolling24Months);
  const cat24m        = rolling24mCategoryAverage(fundsData, categoryId, endMonth);

  /* ── Response ──────────────────────────────────────────────────────────── */
  return NextResponse.json({
    fund: {
      id:             fund.id,
      name:           fund.name,
      classification: fund.classification,
      lastUpdated: fund.lastUpdated ?? null,
    },
    category: {
      id:                  category.id,
      name:                category.name,
      fundsCount:          allCatFunds.length,
      fundsWithMonthlyData,
    },
    endMonth,
    ir,
    vsBenchmark,
    vsCategory,
    monthly: {
      fundReturn:  monthlyFundReturn,
      categoryAvg: monthlyCatAvg,
      diff: monthlyFundReturn != null && monthlyCatAvg != null
        ? monthlyFundReturn - monthlyCatAvg : null,
    },
    ytd: {
      fundReturn:  fundYtd,
      categoryAvg: catYtd,
      diff: fundYtd != null && catYtd != null ? fundYtd - catYtd : null,
      fromMonth: `${endYear}-01`,
    },
    rolling24m: {
      fundReturn:  fund24mReturn,
      categoryAvg: cat24m,
      diff: fund24mReturn != null && cat24m != null ? fund24mReturn - cat24m : null,
      fromMonth: rolling24Start,
    },
  });
}
