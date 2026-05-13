import { redirect } from "next/navigation";
import { storageRead } from "@/lib/storage";
import { BrandConfig, DEFAULT_BRAND } from "@/config/brand";
import SubTabsBar from "@/components/SubTabsBar";
import Toolbar from "../components/Toolbar";
import BackNav from "../components/BackNav";
import PageWrapper from "../components/PageWrapper";
import PageFooter from "../components/PageFooter";
import CompareView from "../components/compare/CompareView";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; funds?: string }>;
}) {
  const { client = "green", funds: fundsParam } = await searchParams;
  const idlePath = "/consistency/v2";

  // Always load brand (needed for sub-tabs feature locking + guard)
  const brand = await storageRead<BrandConfig>(`brand:${client}`, DEFAULT_BRAND);

  if (client !== "green" && !brand.features?.consistencyAnalysis) {
    redirect(`/${client}`);
  }

  const rawIds = (fundsParam ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  if (rawIds.length < 2) redirect(`${idlePath}?client=${client}`);

  const fundIds = rawIds.slice(0, 4);

  return (
    <>
      <SubTabsBar client={client} active="עקביות" features={brand.features} topOffset={0} />
      <Toolbar isCompare client={client} />
      <BackNav client={client} />
      <PageWrapper dateLabel="השוואת קרנות" idlePath={idlePath} client={client}>
        <CompareView fundIds={fundIds} client={client} />
        <PageFooter disclaimer="המידע מובא לצורך ניתוח בלבד ואינו מהווה ייעוץ השקעות, המלצה או חוות דעת." />
      </PageWrapper>
    </>
  );
}
