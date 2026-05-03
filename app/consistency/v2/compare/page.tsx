import { redirect } from "next/navigation";
import { storageRead } from "@/lib/storage";
import { FundsData, Fund, Category, Benchmark } from "@/lib/types";
import {
  getWindowEndMonth,
  getBenchmarkForCategory,
  blendBenchmarkReturns,
  buildCategoryAvgReturns,
  computeWindowMetrics,
  computeAllWindows,
  type WindowLabel,
} from "@/lib/consistency";
import BackNav from "../components/BackNav";
import PageWrapper from "../components/PageWrapper";
import PageFooter from "../components/PageFooter";
import CompareView from "../components/compare/CompareView";
import type { CompareData, CmpFund, CmpWM } from "../components/compare/types";

export const dynamic = "force-dynamic";

const BENCH_SHORT: Record<string, string> = {
  "equity-hedged":  'ת"א 125',
  "bond-hedged":    'ת"א 125 + תל בונד-מאגר',
  "multi-strategy": 'ת"א 125 + תל בונד-מאגר',
};

const HEBREW_MONTHS = [
  "ינואר","פברואר","מרץ","אפריל","מאי","יוני",
  "יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר",
];
function hebrewYM(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return `${HEBREW_MONTHS[mo - 1]} ${y}`;
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; funds?: string }>;
}) {
  const { client = "green", funds: fundsParam } = await searchParams;

  const idlePath = "/consistency/v2";
  const rawIds = (fundsParam ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  if (rawIds.length < 2) redirect(`${idlePath}?client=${client}`);

  const fundIds = rawIds.slice(0, 4);

  const [fundsData, benchmarks] = await Promise.all([
    storageRead<FundsData>(`funds:${client}`, { lastUpdated: "", categories: [] }),
    storageRead<Benchmark[]>(`benchmarks:${client}`, []),
  ]);

  // Locate all funds
  const resolved: Array<{ fund: Fund; category: Category }> = [];
  for (const id of fundIds) {
    let found = false;
    for (const cat of fundsData.categories) {
      const f = cat.funds.find((f) => f.id === id);
      if (f) { resolved.push({ fund: f, category: cat }); found = true; break; }
    }
    if (!found) redirect(`${idlePath}?client=${client}`);
  }

  // Validate same category
  const categoryIds = new Set(resolved.map((r) => r.category.id));
  if (categoryIds.size > 1) redirect(`${idlePath}?client=${client}`);

  const category = resolved[0].category;
  const blend = getBenchmarkForCategory(category.id);
  if (!blend) redirect(`${idlePath}?client=${client}`);

  const allFunds    = fundsData.categories.flatMap((c) => c.funds);
  const { endMonth } = getWindowEndMonth(allFunds, benchmarks);
  const bmAll        = blendBenchmarkReturns(blend, benchmarks);
  const catAvgAll    = buildCategoryAvgReturns(category.funds);

  const WIN_LABELS: WindowLabel[] = ["YTD", "12M", "24M", "36M", "lifetime"];

  const funds: CmpFund[] = resolved.map(({ fund }) => {
    const fundMr = fund.monthlyReturns ?? {};
    const monthKeys: string[] = [], fundReturns: number[] = [];
    const benchmarkReturns: number[] = [], categoryAverageReturns: number[] = [];

    for (const m of Object.keys(fundMr).sort()) {
      const fr = fundMr[m], br = bmAll[m];
      if (fr == null || br == null) continue;
      monthKeys.push(m); fundReturns.push(fr);
      benchmarkReturns.push(br); categoryAverageReturns.push(catAvgAll[m] ?? 0);
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
        YTD:   allWindows.YTD   as CmpWM | null,
        "12M": allWindows["12M"] as CmpWM | null,
        "24M": allWindows["24M"] as CmpWM | null,
        "36M": allWindows["36M"] as CmpWM | null,
      },
      itd: allWindows.lifetime as CmpWM | null,
    };
  });

  const dateLabel = endMonth
    ? `${hebrewYM(endMonth)} · השוואת קרנות`
    : "השוואת קרנות";

  const compareData: CompareData = {
    category: {
      id: category.id,
      label: category.name,
      benchmarkLabel: BENCH_SHORT[category.id] ?? category.id,
    },
    asOfMonth:      endMonth ?? "",
    asOfMonthLabel: endMonth ? hebrewYM(endMonth) : "",
    funds,
  };

  return (
    <>
      <BackNav />
      <PageWrapper dateLabel={dateLabel} idlePath={idlePath}>
        <CompareView data={compareData} client={client} />
        <PageFooter disclaimer="המידע מובא לצורך ניתוח בלבד ואינו מהווה ייעוץ השקעות, המלצה או חוות דעת." />
      </PageWrapper>
    </>
  );
}
