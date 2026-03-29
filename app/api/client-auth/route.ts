import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getClientKeyFromRequest } from "@/lib/clientKey";
import { fundsPath } from "@/lib/clientPaths";

const DEFAULT_ADMIN_PASSWORD = "admin2026";

/**
 * Client password verification endpoint.
 * Accepts the admin password for the specific client (from ?client=xxx).
 * Also accepts the super-admin password.
 */
export async function POST(req: NextRequest) {
  const clientKey = getClientKeyFromRequest(req.url);
  const body = await req.json();
  const password = body.password || "";

  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(fs.readFileSync(fundsPath(clientKey), "utf-8"));
  } catch {
    // If file doesn't exist, use defaults
  }

  const adminPassword = (data.adminPassword as string) || DEFAULT_ADMIN_PASSWORD;
  const superAdminPassword = (data.superAdminPassword as string) || "super2026";

  if (password === adminPassword || password === superAdminPassword) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
