import { redirect } from "next/navigation";
import { storageRead } from "@/lib/storage";
import { BrandConfig, DEFAULT_BRAND } from "@/config/brand";
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

  if (client !== "green") {
    const brand = await storageRead<BrandConfig>(`brand:${client}`, DEFAULT_BRAND);
    if (!brand.features?.consistencyAnalysis) {
      redirect(`/${client}`);
    }
  }

  const rawIds = (fundsParam ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  if (rawIds.length < 2) redirect(`${idlePath}?client=${client}`);

  const fundIds = rawIds.slice(0, 4);

  return (
    <>
      <Toolbar isCompare client={client} />
      <BackNav />
      <PageWrapper dateLabel="השוואת קרנות" idlePath={idlePath} client={client}>
        <CompareView fundIds={fundIds} client={client} />
        <PageFooter disclaimer="המידע מובא לצורך ניתוח בלבד ואינו מהווה ייעוץ השקעות, המלצה או חוות דעת." />
      </PageWrapper>
    </>
  );
}
