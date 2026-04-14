import { NextRequest, NextResponse } from "next/server";
import { storageRead } from "@/lib/storage";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const password = body.password || "";

  const data = await storageRead<Record<string, unknown>>("funds:nox", {});
  const adminPassword = (data.adminPassword as string) || "nox2020";
  const superAdmin   = (data.superAdminPassword as string) || "super2026";

  if (password !== adminPassword && password !== superAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("nox-auth", "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return res;
}
