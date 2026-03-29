import { NextRequest, NextResponse } from "next/server";
import { BrandConfig, DEFAULT_BRAND } from "@/config/brand";
import { getClientKeyFromRequest } from "@/lib/clientKey";
import { storageRead, storageWrite } from "@/lib/storage";

const SUPER_ADMIN_PASSWORD = "super2026";

async function readBrand(clientKey: string): Promise<BrandConfig> {
  const data = await storageRead<Partial<BrandConfig>>(`brand:${clientKey}`, {});
  return { ...DEFAULT_BRAND, ...data };
}

function isSuperAdmin(req: NextRequest): boolean {
  const password = req.headers.get("x-admin-password") || "";
  return password === SUPER_ADMIN_PASSWORD;
}

/** GET — public, returns brand config (no auth needed) */
export async function GET(req: NextRequest) {
  const clientKey = getClientKeyFromRequest(req.url);
  return NextResponse.json(await readBrand(clientKey));
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

  await storageWrite(`brand:${clientKey}`, brand);
  return NextResponse.json({ success: true });
}
