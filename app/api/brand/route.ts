import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { BrandConfig, DEFAULT_BRAND } from "@/config/brand";
import { getClientKeyFromRequest } from "@/lib/clientKey";
import { brandPath } from "@/lib/clientPaths";

const SUPER_ADMIN_PASSWORD = "super2026";

function readBrand(clientKey: string): BrandConfig {
  try {
    const raw = fs.readFileSync(brandPath(clientKey), "utf-8");
    return { ...DEFAULT_BRAND, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_BRAND };
  }
}

function isSuperAdmin(req: NextRequest): boolean {
  const password = req.headers.get("x-admin-password") || "";
  return password === SUPER_ADMIN_PASSWORD;
}

/** GET — public, returns brand config (no auth needed) */
export async function GET(req: NextRequest) {
  const clientKey = getClientKeyFromRequest(req.url);
  return NextResponse.json(readBrand(clientKey));
}

/** PUT — super admin only, saves brand config */
export async function PUT(req: NextRequest) {
  if (!isSuperAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientKey = getClientKeyFromRequest(req.url);
  const body = await req.json();
  const brand: BrandConfig = {
    ...DEFAULT_BRAND,
    ...body,
  };

  fs.writeFileSync(brandPath(clientKey), JSON.stringify(brand, null, 2), "utf-8");
  return NextResponse.json({ success: true });
}
