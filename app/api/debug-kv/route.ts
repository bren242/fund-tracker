import { NextResponse } from "next/server";
import { storageRead } from "@/lib/storage";
import type { Benchmark } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.KV_REST_API_URL ?? null;
  const token = process.env.KV_REST_API_TOKEN ?? null;
  const envPresent = !!(url && token);
  const tokenPrefix = token ? token.slice(0, 20) : null;

  // --- Path 1: raw REST API ---
  type BmSummary = { id: string; annualKeys: number; monthlyKeys: number; firstMonthly: string; lastMonthly: string };
  let restResult: BmSummary[] | null = null;
  let restError: string | null = null;

  if (envPresent) {
    try {
      const res = await fetch(`${url}/get/benchmarks:green`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        restError = `HTTP ${res.status}: ${await res.text()}`;
      } else {
        const json = await res.json();
        if (json.result) {
          const parsed = JSON.parse(json.result) as Array<{ id?: string; returns?: Record<string, number>; monthlyReturns?: Record<string, number> }>;
          restResult = parsed.map((bm) => {
            const months = Object.keys(bm.monthlyReturns ?? {}).sort();
            return {
              id:           bm.id ?? "?",
              annualKeys:   Object.keys(bm.returns ?? {}).length,
              monthlyKeys:  months.length,
              firstMonthly: months[0] ?? "none",
              lastMonthly:  months[months.length - 1] ?? "none",
            };
          });
        } else {
          restError = "result is null";
        }
      }
    } catch (e) {
      restError = String(e);
    }
  }

  // --- Path 2: storageRead (same path as the fund route) ---
  let storageResult: BmSummary[] | null = null;
  let storageError: string | null = null;
  try {
    const bms = await storageRead<Benchmark[]>("benchmarks:green", []);
    storageResult = bms.map((bm) => {
      const months = Object.keys(bm.monthlyReturns ?? {}).sort();
      return {
        id:           bm.id,
        annualKeys:   Object.keys(bm.returns ?? {}).length,
        monthlyKeys:  months.length,
        firstMonthly: months[0] ?? "none",
        lastMonthly:  months[months.length - 1] ?? "none",
      };
    });
  } catch (e) {
    storageError = String(e);
  }

  return NextResponse.json({
    envPresent,
    tokenPrefix,
    nodeEnv: process.env.NODE_ENV,
    restAPI: { result: restResult, error: restError },
    storageRead: { result: storageResult, error: storageError },
  });
}
