import { NextResponse } from "next/server";
import { storageRead } from "@/lib/storage";
import { FundsData, Benchmark } from "@/lib/types";
import {
  getBenchmarkForCategory,
  blendBenchmarkReturns,
  getWindowEndMonth,
} from "@/lib/consistency";

export const dynamic = "force-dynamic";

export async function GET() {
  const [fundsData, benchmarks] = await Promise.all([
    storageRead<FundsData>("funds:green", { lastUpdated: "", categories: [] }),
    storageRead<Benchmark[]>("benchmarks:green", []),
  ]);

  // Find fund-22
  let fund = null, category = null;
  for (const cat of fundsData.categories) {
    const f = cat.funds.find((f) => f.id === "fund-22");
    if (f) { fund = f; category = cat; break; }
  }

  if (!fund || !category) {
    return NextResponse.json({ error: "fund-22 not found" });
  }

  const blend = getBenchmarkForCategory(category.id);
  const bmAll = blend ? blendBenchmarkReturns(blend, benchmarks) : {};
  const bmMonths = Object.keys(bmAll).sort();
  const fundMr = fund.monthlyReturns ?? {};
  const fundMonths = Object.keys(fundMr).sort();

  // Compute intersection
  const intersection: string[] = [];
  for (const m of fundMonths) {
    if (bmAll[m] != null) intersection.push(m);
  }

  const { endMonth } = getWindowEndMonth(fundsData.categories.flatMap(c => c.funds), benchmarks);

  // Also check what bm-ta125 monthlyReturns looks like
  const ta125 = benchmarks.find(b => b.id === "bm-ta125");
  const ta125Months = Object.keys(ta125?.monthlyReturns ?? {}).sort();

  return NextResponse.json({
    category: { id: category.id, name: category.name },
    blend,
    fund: {
      monthlyReturnsCount: fundMonths.length,
      first: fundMonths[0],
      last: fundMonths[fundMonths.length - 1],
    },
    bmAll: {
      monthsCount: bmMonths.length,
      first: bmMonths[0],
      last: bmMonths[bmMonths.length - 1],
    },
    ta125Direct: {
      monthsCount: ta125Months.length,
      first: ta125Months[0],
      last: ta125Months[ta125Months.length - 1],
    },
    intersection: {
      count: intersection.length,
      first: intersection[0],
      last: intersection[intersection.length - 1],
    },
    endMonth,
  });
}
