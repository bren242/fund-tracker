import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export async function GET() {
  const data = await kv.get("funds:green");
  const cats = (data as any)?.categories ?? [];
  let sample: any = null;
  for (const cat of cats) {
    for (const f of cat.funds ?? []) {
      if (f.monthlyReturns && Object.keys(f.monthlyReturns).length > 0) {
        sample = { name: f.name, entries: Object.entries(f.monthlyReturns).slice(0, 3) };
        break;
      }
    }
    if (sample) break;
  }
  return NextResponse.json(sample);
}
