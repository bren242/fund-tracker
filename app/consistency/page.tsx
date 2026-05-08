import { redirect } from "next/navigation";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ fund?: string; client?: string }>;
}) {
  const { fund, client: clientParam } = await searchParams;
  const client = clientParam || "green";
  redirect(fund ? `/${client}/consistency/v2?fund=${fund}` : `/${client}/consistency/v2`);
}
