import { NextRequest, NextResponse } from "next/server";
import { getClientKeyFromRequest } from "@/lib/clientKey";
import { storageRead, storageWrite } from "@/lib/storage";
import { Indication } from "@/lib/types";

const SUPER_ADMIN_PASSWORD = "super2026";
const DEFAULT_ADMIN_PASSWORD = "admin2026";

async function getAdminPassword(clientKey: string): Promise<string> {
  const fundsData = await storageRead<{ adminPassword?: string }>(`funds:${clientKey}`, {});
  return fundsData.adminPassword || DEFAULT_ADMIN_PASSWORD;
}

function isAuthorized(req: NextRequest, adminPassword: string): boolean {
  const pw = req.headers.get("x-admin-password") || "";
  return pw === SUPER_ADMIN_PASSWORD || pw === adminPassword;
}

export async function GET(req: NextRequest) {
  const clientKey = getClientKeyFromRequest(req.url);
  const indications = await storageRead<Indication[]>(`indications:${clientKey}`, []);
  return NextResponse.json(indications);
}

export async function POST(req: NextRequest) {
  const clientKey = getClientKeyFromRequest(req.url);
  const adminPassword = await getAdminPassword(clientKey);
  if (!isAuthorized(req, adminPassword)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { fundId, monthReturn, ytd, reportMonth } = body;

  if (!fundId || monthReturn === undefined || ytd === undefined || !reportMonth) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Resolve fundName + currency from funds (snapshot at POST time)
  const fundsData = await storageRead<{
    categories: Array<{ funds: Array<{ id: string; name: string; currency?: string }> }>;
  }>(`funds:${clientKey}`, { categories: [] });

  let fundName = "";
  let currency: "ILS" | "USD" = "ILS";

  outer: for (const cat of fundsData.categories) {
    for (const fund of cat.funds) {
      if (fund.id === fundId) {
        fundName = fund.name;
        currency = (fund.currency as "ILS" | "USD") || "ILS";
        break outer;
      }
    }
  }

  if (!fundName) {
    return NextResponse.json({ error: "Fund not found" }, { status: 404 });
  }

  const indication: Indication = {
    id: crypto.randomUUID(),
    fundId,
    fundName,
    currency,
    monthReturn,
    ytd,
    reportMonth,
    createdAt: Date.now(),
    tenant: clientKey,
  };

  const indications = await storageRead<Indication[]>(`indications:${clientKey}`, []);
  indications.push(indication);
  await storageWrite(`indications:${clientKey}`, indications);

  return NextResponse.json(indication, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const clientKey = getClientKeyFromRequest(req.url);
  const adminPassword = await getAdminPassword(clientKey);
  if (!isAuthorized(req, adminPassword)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, monthReturn, ytd, reportMonth } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const indications = await storageRead<Indication[]>(`indications:${clientKey}`, []);
  const idx = indications.findIndex((i) => i.id === id);

  if (idx < 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (monthReturn !== undefined) indications[idx].monthReturn = monthReturn;
  if (ytd !== undefined) indications[idx].ytd = ytd;
  if (reportMonth !== undefined) indications[idx].reportMonth = reportMonth;

  await storageWrite(`indications:${clientKey}`, indications);
  return NextResponse.json(indications[idx]);
}

export async function DELETE(req: NextRequest) {
  const clientKey = getClientKeyFromRequest(req.url);
  const adminPassword = await getAdminPassword(clientKey);
  if (!isAuthorized(req, adminPassword)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);

  // Delete all
  if (url.searchParams.get("all") === "true") {
    await storageWrite(`indications:${clientKey}`, []);
    return NextResponse.json({ success: true, deleted: "all" });
  }

  // Delete by month
  if (url.searchParams.get("month")) {
    const month = url.searchParams.get("month")!;
    const all = await storageRead<Indication[]>(`indications:${clientKey}`, []);
    const filtered = all.filter((i) => i.reportMonth !== month);
    await storageWrite(`indications:${clientKey}`, filtered);
    return NextResponse.json({ deleted: all.length - filtered.length });
  }

  // Delete by id
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const indications = await storageRead<Indication[]>(`indications:${clientKey}`, []);
  const filtered = indications.filter((i) => i.id !== id);

  if (filtered.length === indications.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await storageWrite(`indications:${clientKey}`, filtered);
  return NextResponse.json({ success: true });
}
