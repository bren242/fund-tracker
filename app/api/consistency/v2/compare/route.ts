/**
 * GET /api/consistency/v2/compare?funds=fund-19,fund-22&client=green
 *
 * Multi-window metrics for 2-4 funds from the same category.
 * No AI — fetched separately via /insight route.
 */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { storageRead } from "@/lib/storage";
import { FundsData, Fund, Category, Benchmark } from "@/lib/types";
import {
  getWindowEndMonth,
  getBenchmarkForCategory,
  blendBenchmarkReturns,
  buildCategoryAvgReturns,
  computeWindowMetrics,
  computeAllWindows,
  formatBenchmarkLabel,
  type WindowLabel,
} from "@/lib/consistency";

const HEBREW_MONTHS = [
  "ינואר","פברואר","מרץ","אפריל","מאי","יוני",
  "יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר",
];
function hebrewYM(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return `${HEBREW_MONTHS[mo - 1]} ${y}`;
}

async function readBenchmarksWithRetry(tenant: string): Promise<Benchmark[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const benchmarks = await storageRead<Benchmark[]>(`benchmarks:${tenant}`, []);
    const isValid =
      benchmarks.length > 0 &&
      benchmarks.some(
        (b) => b.monthlyReturns && Object.keys(b.monthlyReturns).length >= 12
      );
    if (isValid) {
      if (attempt > 0) console.warn(`[KV-RETRY] benchmarks valid on attempt ${attempt + 1}`);
      return benchmarks;
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
  }
  return storageRead<Benchmark[]>(`benchmarks:${tenant}`, []);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const client  = sp.get("client") ?? "green";
  const fundIds = (sp.get("funds") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  if (fundIds.length < 2 || fundIds.length > 4) {
    return NextResponse.json({ error: "Provide 2–4 fund IDs in ?funds=" }, { status: 400 });
  }

  const [fundsData, benchmarks] = await Promise.all([
    storageRead<FundsData>(`funds:${client}`, { lastUpdated: "", categories: [] }),
    readBenchmarksWithRetry(client),
  ]);

  const resolved: Array<{ fund: Fund; category: Category }> = [];
  for (const id of fundIds) {
    let found = false;
    for (const cat of fundsData.categories) {
      const f = cat.funds.find((f) => f.id === id);
      if (f) { resolved.push({ fund: f, category: cat }); found = true; break; }
    }
    if (!found) return NextResponse.json({ error: `Fund not found: ${id}` }, { status: 404 });
  }

  const categoryIds = new Set(resolved.map((r) => r.category.id));
  if (categoryIds.size > 1) {
    return NextResponse.json({ error: "All funds must belong to the same category" }, { status: 400 });
  }

  const category = resolved[0].category;
  const blend = getBenchmarkForCategory(category.id);
  if (!blend) {
    return NextResponse.json({ error: "No benchmark for category" }, { status: 400 });
  }

  const allFunds    = fundsData.categories.flatMap((c) => c.funds);
  const { endMonth } = getWindowEndMonth(allFunds, benchmarks);
  const bmAll        = blendBenchmarkReturns(blend, benchmarks);
  const catAvgAll    = buildCategoryAvgReturns(category.funds);

  const WIN_LABELS: WindowLabel[] = ["YTD", "12M", "24M", "36M", "lifetime"];

  const funds = resolved.map(({ fund }) => {
    const fundMr = fund.monthlyReturns ?? {};
    const monthKeys: string[] = [], fundReturns: number[] = [];
    const benchmarkReturns: number[] = [], categoryAverageReturns: number[] = [];

    for (const m of Object.keys(fundMr).sort()) {
      const fr = fundMr[m], br = bmAll[m];
      if (fr == null || br == null) continue;
      monthKeys.push(m);
      fundReturns.push(fr);
      benchmarkReturns.push(br);
      categoryAverageReturns.push(catAvgAll[m] ?? 0);
    }

    const categoryFundsIRsByWindow: Partial<Record<WindowLabel, number[]>> = {};
    for (const wl of WIN_LABELS) {
      const irs: number[] = [];
      for (const other of category.funds) {
        if (other.id === fund.id) continue;
        const omr = other.monthlyReturns ?? {};
        const oMk: string[] = [], oF: number[] = [], oB: number[] = [], oC: number[] = [];
        for (const m of Object.keys(omr).sort()) {
          const fr = omr[m], br = bmAll[m];
          if (fr == null || br == null) continue;
          oMk.push(m); oF.push(fr); oB.push(br); oC.push(catAvgAll[m] ?? 0);
        }
        const metrics = computeWindowMetrics(oF, oB, oC, oMk, wl, []);
        if (metrics?.informationRatio != null) irs.push(metrics.informationRatio);
      }
      if (irs.length > 0) categoryFundsIRsByWindow[wl] = irs;
    }

    const allWindows = computeAllWindows(
      fundReturns, benchmarkReturns, categoryAverageReturns,
      monthKeys, categoryFundsIRsByWindow
    );

    return {
      id: fund.id,
      name: fund.name,
      inceptionMonth: monthKeys[0] ?? "",
      monthsActive: monthKeys.length,
      windows: {
        YTD:   allWindows.YTD,
        "12M": allWindows["12M"],
        "24M": allWindows["24M"],
        "36M": allWindows["36M"],
      },
      itd: allWindows.lifetime,
    };
  });

  return NextResponse.json({
    category: {
      id: category.id,
      label: category.name,
      benchmarkLabel: formatBenchmarkLabel(category.id),
    },
    asOfMonth:      endMonth ?? "",
    asOfMonthLabel: endMonth ? hebrewYM(endMonth) : "",
    funds,
  });
}
