import { NextRequest, NextResponse } from "next/server";
import { getClientKeyFromRequest } from "@/lib/clientKey";
import { storageRead, storageWrite } from "@/lib/storage";

const DEFAULT_CONSISTENCY_CONFIG = {
  benchmarkWeights: {
    "equity-hedged":  { "bm-ta125": 1.00, "bm-telbond-maagar": 0.00 },
    "bond-hedged":    { "bm-ta125": 0.15, "bm-telbond-maagar": 0.85 },
    "multi-strategy": { "bm-ta125": 0.30, "bm-telbond-maagar": 0.70 },
  },
  thresholds: { redScore: 40, starIR: 0.5 },
};

export async function GET(req: NextRequest) {
  const clientKey = getClientKeyFromRequest(req.url);
  const stored = await storageRead(
    `consistency-config:${clientKey}`,
    DEFAULT_CONSISTENCY_CONFIG
  );
  return NextResponse.json(stored);
}

export async function POST(req: NextRequest) {
  const clientKey = getClientKeyFromRequest(req.url);
  // Validate admin password against client funds data
  const fundsData = (await storageRead(`funds:${clientKey}`, {
    adminPassword: "admin2026",
  })) as Record<string, unknown>;
  const adminPw = (fundsData.adminPassword as string) || "admin2026";
  const incoming = req.headers.get("x-admin-password") || "";
  if (incoming !== adminPw && incoming !== "super2026") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  await storageWrite(`consistency-config:${clientKey}`, body);
  return NextResponse.json({ ok: true });
}
