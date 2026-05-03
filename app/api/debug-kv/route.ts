import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.KV_REST_API_URL ?? null;
  const token = process.env.KV_REST_API_TOKEN ?? null;

  const envPresent = !!(url && token);
  const tokenPrefix = token ? token.slice(0, 20) : null;

  let kvWorks = false;
  let benchmarkMonths = 0;
  let benchmarkKeys: string[] = [];
  let error: string | null = null;

  if (envPresent) {
    try {
      const res = await fetch(`${url}/get/benchmarks:green`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        error = `HTTP ${res.status}: ${await res.text()}`;
      } else {
        const json = await res.json();
        if (json.result) {
          kvWorks = true;
          const parsed = JSON.parse(json.result);
          if (Array.isArray(parsed)) {
            benchmarkMonths = parsed.reduce((acc: number, bm: { returns?: Record<string, number> }) => {
              return acc + Object.keys(bm.returns ?? {}).length;
            }, 0);
            benchmarkKeys = parsed.map((bm: { id?: string }) => bm.id ?? "?");
          }
        } else {
          error = `result is null — key may not exist in KV`;
        }
      }
    } catch (e) {
      error = String(e);
    }
  }

  return NextResponse.json({
    envPresent,
    tokenPrefix,
    kvWorks,
    benchmarkKeys,
    benchmarkMonths,
    error,
    nodeEnv: process.env.NODE_ENV,
  });
}
