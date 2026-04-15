import { NextResponse } from "next/server";
import { storageRead, storageWrite } from "@/lib/storage";
import type { BrandConfig } from "@/config/brand";

/** One-time: merges favicon path into existing brand:nox KV entry */
export async function GET() {
  const existing = await storageRead<Partial<BrandConfig>>("brand:nox", {});
  const updated = { ...existing, favicon: "/branding/nox/favicon.svg" };
  await storageWrite("brand:nox", updated);
  return NextResponse.json({ ok: true, favicon: updated.favicon });
}
