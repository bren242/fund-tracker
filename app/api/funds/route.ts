import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getClientKeyFromRequest } from "@/lib/clientKey";
import { fundsPath, backupsDir } from "@/lib/clientPaths";

const DEFAULT_ADMIN_PASSWORD = "admin2026";
const SUPER_ADMIN_PASSWORD = "super2026";

function readData(clientKey: string) {
  try {
    const raw = fs.readFileSync(fundsPath(clientKey), "utf-8");
    return JSON.parse(raw);
  } catch {
    // Return minimal structure if file doesn't exist yet
    return { lastUpdated: "", categories: [], adminPassword: DEFAULT_ADMIN_PASSWORD };
  }
}

function writeData(clientKey: string, data: unknown) {
  fs.writeFileSync(fundsPath(clientKey), JSON.stringify(data, null, 2), "utf-8");
}

function getAdminPassword(data: Record<string, unknown>): string {
  return (data.adminPassword as string) || DEFAULT_ADMIN_PASSWORD;
}

function isAuthorized(req: NextRequest, data: Record<string, unknown>): "super" | "admin" | false {
  const password = req.headers.get("x-admin-password") || "";
  if (password === SUPER_ADMIN_PASSWORD) return "super";
  if (password === getAdminPassword(data)) return "admin";
  return false;
}

export async function GET(req: NextRequest) {
  const clientKey = getClientKeyFromRequest(req.url);
  const data = readData(clientKey);
  const url = new URL(req.url);

  // Export endpoint — returns raw data for backup
  if (url.searchParams.get("export") === "true") {
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename=${clientKey}-backup-${new Date().toISOString().split("T")[0]}.json`,
      },
    });
  }

  // For public consumers, filter out inactive/hidden funds and strip passwords
  const isAdmin = url.searchParams.get("admin") === "true";
  if (!isAdmin) {
    const publicData = {
      ...data,
      adminPassword: undefined,
      superAdminPassword: undefined,
      categories: (data.categories || []).map((cat: Record<string, unknown>) => ({
        ...cat,
        funds: (cat.funds as Record<string, unknown>[]).filter((f: Record<string, unknown>) => {
          const active = f.active !== undefined ? f.active : true;
          return active;
        }),
      })),
    };
    return NextResponse.json(publicData);
  }

  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const clientKey = getClientKeyFromRequest(req.url);
  const data = readData(clientKey);
  const auth = isAuthorized(req, data);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);

  // Password change endpoint
  if (url.searchParams.get("action") === "change-password") {
    const body = await req.json();
    const newPassword = body.newPassword;
    if (!newPassword || newPassword.length < 4) {
      return NextResponse.json({ error: "Password too short" }, { status: 400 });
    }
    data.adminPassword = newPassword;
    writeData(clientKey, data);
    return NextResponse.json({ success: true });
  }

  // Import/restore endpoint
  if (url.searchParams.get("action") === "import") {
    const body = await req.json();
    // Create backup before import
    const bDir = backupsDir(clientKey);
    const backupFile = path.join(bDir, `pre-import-${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(data, null, 2), "utf-8");
    // Preserve current passwords if not in import
    if (!body.adminPassword) body.adminPassword = data.adminPassword;
    writeData(clientKey, body);
    return NextResponse.json({ success: true });
  }

  // Regular save
  const body = await req.json();
  // Auto-backup before save
  const bDir = backupsDir(clientKey);
  // Keep only last 10 backups
  try {
    const backups = fs.readdirSync(bDir).sort();
    while (backups.length >= 10) {
      fs.unlinkSync(path.join(bDir, backups.shift()!));
    }
  } catch { /* ignore */ }
  const backupFile = path.join(bDir, `auto-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(data, null, 2), "utf-8");

  // Preserve passwords
  if (!body.adminPassword && data.adminPassword) {
    body.adminPassword = data.adminPassword;
  }
  writeData(clientKey, body);
  return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest) {
  const clientKey = getClientKeyFromRequest(req.url);
  const data = readData(clientKey);
  const auth = isAuthorized(req, data);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);

  // Verify password endpoint
  if (url.searchParams.get("action") === "verify") {
    return NextResponse.json({ role: auth });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
