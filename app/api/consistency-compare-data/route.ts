/**
 * GET /api/consistency-compare-data?funds=id1,id2,id3&endMonth=YYYY-MM&client=<key>
 *
 * Returns consistency metrics for 2-4 funds (must be from the same category).
 * If funds are from different categories, returns { sameCategory: false }.
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
import { getLastUpdated } from "@/lib/fundDerived";
import {
  getFundsInCategory,
  monthlyCategoryAverage,
  ytdCategoryAverage,
  rolling24mCategoryAverage,
} from "@/lib/category-average";

/* ── helpers (same as consistency-data) ──────────────────────────────────── */

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
  const url       = new URL(req.url);
  const clientKey = getClientKeyFromRequest(req.url);
  const fundsParam = url.searchParams.get("funds");
  const endMonth   = url.searchParams.get("endMonth");

  if (!fundsParam || !endMonth || !/^\d{4}-\d{2}$/.test(endMonth)) {
    return NextResponse.json(
      { error: "Missing or invalid params (expected funds=id1,id2&endMonth=YYYY-MM)" },
      { status: 400 }
    );
  }

  const fundIds = fundsParam.split(",").map((s) => s.trim()).filter(Boolean);
  if (fundIds.length < 2 || fundIds.length > 4) {
    return NextResponse.json(
      { error: "Must provide 2-4 fund IDs" },
      { status: 400 }
    );
  }

  const [fundsData, benchmarks] = await Promise.all([
    storageRead<FundsData>(`funds:${clientKey}`, { lastUpdated: "", categories: [] }),
    storageRead<Benchmark[]>(`benchmarks:${clientKey}`, []),
  ]);

  /* ── validate funds exist + same category ──────────────────────────────── */
  const foundFunds: { fund: Fund; category: Category }[] = [];
  let categoryId: string | null = null;
  let categoryObj: Category | null = null;

  for (const fundId of fundIds) {
    const found = findFund(fundsData, fundId);
    if (!found) {
      return NextResponse.json({ error: `Fund not found: ${fundId}` }, { status: 404 });
    }
    if (categoryId === null) {
      categoryId = found.category.id;
      categoryObj = found.category;
    } else if (found.category.id !== categoryId) {
      return NextResponse.json({
        sameCategory: false,
        error: "ניתן להשוות רק קרנות מאותה קטגוריה",
      }, { status: 200 });
    }
    foundFunds.push(found);
  }

  /* ── shared 24M window ─────────────────────────────────────────────────── */
  const rolling24Start  = shiftYM(endMonth, -23);
  const rolling24Months = monthRange(rolling24Start, endMonth);

  /* ── benchmark blend ───────────────────────────────────────────────────── */
  const blend = getBenchmarkForCategory(categoryId!);
  let blended24MR: Record<string, number> = {};
  let benchmarkName = "—";

  if (blend && benchmarks.length > 0) {
    const blendedAll = blendBenchmarkReturns(blend, benchmarks);
    for (const m of rolling24Months) {
      if (blendedAll[m] != null) blended24MR[m] = blendedAll[m];
    }
    const bmParts = Object.entries(blend).map(([id, w]) => {
      const bm = benchmarks.find((b) => b.id === id);
      return bm ? `${Math.round(w * 100)}% ${bm.name}` : id;
    });
    benchmarkName = bmParts.join(" + ");
  }

  /* ── category metadata ─────────────────────────────────────────────────── */
  const allCatFunds        = getFundsInCategory(fundsData, categoryId!);
  const fundsWithMonthlyData = allCatFunds.filter(
    (f) => Object.keys(f.monthlyReturns ?? {}).length > 0
  ).length;

  /* ── per-fund metrics ──────────────────────────────────────────────────── */
  const [endYearStr, endMonthStr] = endMonth.split("-");
  const endYear    = parseInt(endYearStr, 10);
  const endMonthNum = parseInt(endMonthStr, 10);
  const ytdMonths  = monthRange(`${endYear}-01`, endMonth);

  const fundsResult = foundFunds.map(({ fund }) => {
    const fundMR = fund.monthlyReturns ?? {};

    /* fund 24M window */
    const fund24MR: Record<string, number> = {};
    for (const m of rolling24Months) {
      if (fundMR[m] != null) fund24MR[m] = fundMR[m];
    }

    /* IR + vsBenchmark */
    let ir: number | null = null;
    let vsBenchmark = {
      monthsAbove: 0, monthsBelow: 0, totalMonths: 0,
      percentageAbove: 0, benchmarkName, insufficientData: true,
    };

    if (blend && benchmarks.length > 0) {
      const result = calcConsistencyVsBenchmark(fund24MR, blended24MR, 12);
      ir = result?.ir ?? null;
      if (result) {
        vsBenchmark = {
          monthsAbove: result.wins,
          monthsBelow: result.total - result.wins,
          totalMonths: result.total,
          percentageAbove: result.score,
          benchmarkName,
          insufficientData: result.total < 12,
        };
      }
    }

    /* vsCategory */
    let above = 0, below = 0, totalCat = 0;
    for (const m of rolling24Months) {
      const fv = fundMR[m];
      if (fv == null) continue;
      const avg = monthlyCategoryAverage(fundsData, categoryId!, m);
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

    /* returns */
    const monthlyFundReturn = fundMR[endMonth] ?? null;
    const monthlyCatAvg     = monthlyCategoryAverage(fundsData, categoryId!, endMonth);
    const fundYtd           = compound(fundMR, ytdMonths);
    const catYtd            = ytdCategoryAverage(fundsData, categoryId!, endYear, endMonthNum);
    const fund24mReturn     = compound(fundMR, rolling24Months);
    const cat24m            = rolling24mCategoryAverage(fundsData, categoryId!, endMonth);

    return {
      fund: {
        id:             fund.id,
        name:           fund.name,
        classification: fund.classification,
        lastUpdated: getLastUpdated(fund),
      },
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
    };
  });

  return NextResponse.json({
    sameCategory: true,
    categoryInfo: {
      id:                  categoryId!,
      name:                categoryObj!.name,
      fundsCount:          allCatFunds.length,
      fundsWithMonthlyData,
    },
    endMonth,
    funds: fundsResult,
  });
}
