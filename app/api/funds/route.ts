import { NextRequest, NextResponse } from "next/server";
import { getClientKeyFromRequest } from "@/lib/clientKey";
import { storageRead, storageWrite } from "@/lib/storage";

const DEFAULT_ADMIN_PASSWORD = "admin2026";
const SUPER_ADMIN_PASSWORD = "super2026";

const DEFAULT_FUNDS = { lastUpdated: "", categories: [], adminPassword: DEFAULT_ADMIN_PASSWORD };

async function readData(clientKey: string) {
  return storageRead(`funds:${clientKey}`, DEFAULT_FUNDS);
}

async function writeData(clientKey: string, data: unknown) {
  await storageWrite(`funds:${clientKey}`, data);
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
  const data = await readData(clientKey);
  const url = new URL(req.url);

  // Export endpoint — returns raw data for backup (auth required)
  if (url.searchParams.get("export") === "true") {
    const auth = isAuthorized(req, data);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename=${clientKey}-backup-${new Date().toISOString().split("T")[0]}.json`,
      },
    });
  }

  /** Strip sensitive fields from data before sending to client */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { adminPassword: _ap, superAdminPassword: _sap, ...safeData } = data as Record<string, unknown>;

  // For public consumers, filter out inactive/hidden funds
  const isAdmin = url.searchParams.get("admin") === "true";
  if (!isAdmin) {
    const publicData = {
      ...safeData,
      categories: ((safeData.categories || []) as Record<string, unknown>[]).map((cat: Record<string, unknown>) => ({
        ...cat,
        funds: (cat.funds as Record<string, unknown>[]).filter((f: Record<string, unknown>) => {
          const active = f.active !== undefined ? f.active : true;
          return active;
        }),
      })),
    };
    return NextResponse.json(publicData);
  }

  // Admin view — still strip passwords (auth checked via headers on mutations)
  return NextResponse.json(safeData);
}

export async function PUT(req: NextRequest) {
  const clientKey = getClientKeyFromRequest(req.url);
  const data = await readData(clientKey);
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
    await writeData(clientKey, data);
    return NextResponse.json({ success: true });
  }

  // Import/restore endpoint
  if (url.searchParams.get("action") === "import") {
    const body = await req.json();
    if (!body.categories || !Array.isArray(body.categories)) {
      return NextResponse.json({ error: "Invalid import: missing categories array" }, { status: 400 });
    }
    // Preserve current passwords if not in import
    if (!body.adminPassword) body.adminPassword = data.adminPassword;
    await writeData(clientKey, body);
    return NextResponse.json({ success: true });
  }

  // Regular save — only accepts full datastore shape
  const body = await req.json();
  if (!body.categories || !Array.isArray(body.categories)) {
    return NextResponse.json({ error: "Invalid save: payload must contain categories array. Partial updates are not supported on this route." }, { status: 400 });
  }
  // Preserve passwords
  if (!body.adminPassword && data.adminPassword) {
    body.adminPassword = data.adminPassword;
  }
  await writeData(clientKey, body);
  return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest) {
  const clientKey = getClientKeyFromRequest(req.url);
  const data = await readData(clientKey);
  const auth = isAuthorized(req, data);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);

  // Verify password endpoint
  if (url.searchParams.get("action") === "verify") {
    return NextResponse.json({ role: auth });
  }

  // Move fund up/down within its category
  if (url.searchParams.get("action") === "move-fund") {
    const body = await req.json();
    const { categoryId, fundId, direction } = body;
    if (!categoryId || !fundId || (direction !== "up" && direction !== "down")) {
      return NextResponse.json({ error: "Missing categoryId, fundId, or direction (up/down)" }, { status: 400 });
    }
    const categories = (data.categories || []) as Record<string, unknown>[];
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }
    const funds = cat.funds as Record<string, unknown>[];
    const idx = funds.findIndex((f) => f.id === fundId);
    if (idx < 0) {
      return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    }
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= funds.length) {
      return NextResponse.json({ success: true }); // already at edge
    }
    // Swap
    [funds[idx], funds[newIdx]] = [funds[newIdx], funds[idx]];
    await writeData(clientKey, data);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const clientKey = getClientKeyFromRequest(req.url);
  const data = await readData(clientKey);
  const auth = isAuthorized(req, data);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);

  // Set currency on a single fund by ID
  if (url.searchParams.get("action") === "set-currency") {
    const body = await req.json();
    const { fundId, currency } = body as { fundId: string; currency: string };
    if (!fundId || (currency !== "ILS" && currency !== "USD")) {
      return NextResponse.json({ error: "Missing fundId or invalid currency (ILS/USD)" }, { status: 400 });
    }
    let found = false;
    const categories = (data.categories || []) as Record<string, unknown>[];
    for (const cat of categories) {
      const funds = cat.funds as Record<string, unknown>[];
      const idx = funds.findIndex((f) => f.id === fundId);
      if (idx >= 0) {
        funds[idx].currency = currency;
        funds[idx].returnBasis = currency;
        found = true;
        break;
      }
    }
    if (!found) return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    await writeData(clientKey, data);
    return NextResponse.json({ success: true });
  }

  // Set manager on a single fund by ID
  if (url.searchParams.get("action") === "set-manager") {
    const body = await req.json();
    const { fundId, manager } = body as { fundId: string; manager: string };
    if (!fundId) {
      return NextResponse.json({ error: "Missing fundId" }, { status: 400 });
    }
    let found = false;
    const categories = (data.categories || []) as Record<string, unknown>[];
    for (const cat of categories) {
      const funds = cat.funds as Record<string, unknown>[];
      const idx = funds.findIndex((f) => f.id === fundId);
      if (idx >= 0) {
        funds[idx].manager = manager ?? "";
        found = true;
        break;
      }
    }
    if (!found) return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    await writeData(clientKey, data);
    return NextResponse.json({ success: true });
  }

  // Set lastUpdated on a single fund by ID
  if (url.searchParams.get("action") === "set-last-updated") {
    const body = await req.json();
    const { fundId, lastUpdated } = body as { fundId: string; lastUpdated: string };
    if (!fundId || !lastUpdated || !/^\d{4}-\d{2}$/.test(lastUpdated)) {
      return NextResponse.json({ error: "Missing fundId or invalid lastUpdated (YYYY-MM)" }, { status: 400 });
    }
    let found = false;
    const categories = (data.categories || []) as Record<string, unknown>[];
    for (const cat of categories) {
      const funds = cat.funds as Record<string, unknown>[];
      const idx = funds.findIndex((f) => f.id === fundId);
      if (idx >= 0) {
        funds[idx].lastUpdated   = lastUpdated;
        funds[idx].lastUpdatedAt = new Date().toISOString();
        found = true;
        break;
      }
    }
    if (!found) return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    await writeData(clientKey, data);
    return NextResponse.json({ success: true });
  }

  // Set a single month's return, updating monthlyReturns history only
  if (url.searchParams.get("action") === "set-monthly-return") {
    const body = await req.json();
    const { fundId, month, value } = body as { fundId: string; month: string; value: number };
    if (!fundId || !month || !/^\d{4}-\d{2}$/.test(month) || typeof value !== "number") {
      return NextResponse.json({ error: "Missing fundId, invalid month (YYYY-MM), or non-numeric value" }, { status: 400 });
    }
    let found = false;
    const categories = (data.categories || []) as Record<string, unknown>[];
    for (const cat of categories) {
      const funds = cat.funds as Record<string, unknown>[];
      const idx = funds.findIndex((f) => f.id === fundId);
      if (idx >= 0) {
        const mr = (funds[idx].monthlyReturns as Record<string, number>) ?? {};
        funds[idx].monthlyReturns = { ...mr, [month]: value };
        funds[idx].lastUpdatedAt = new Date().toISOString();
        found = true;
        break;
      }
    }
    if (!found) return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    await writeData(clientKey, data);
    return NextResponse.json({ success: true });
  }

  // Delete a single month's return from monthlyReturns
  if (url.searchParams.get("action") === "delete-monthly-return") {
    const body = await req.json();
    const { fundId, month } = body as { fundId: string; month: string };
    if (!fundId || !month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "Missing fundId or invalid month (YYYY-MM)" }, { status: 400 });
    }
    let found = false;
    const categories = (data.categories || []) as Record<string, unknown>[];
    for (const cat of categories) {
      const funds = cat.funds as Record<string, unknown>[];
      const idx = funds.findIndex((f) => f.id === fundId);
      if (idx >= 0) {
        const mr = { ...((funds[idx].monthlyReturns as Record<string, number>) ?? {}) };
        delete mr[month];
        funds[idx].monthlyReturns = mr;
        funds[idx].lastUpdatedAt = new Date().toISOString();
        found = true;
        break;
      }
    }
    if (!found) return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    await writeData(clientKey, data);
    return NextResponse.json({ success: true });
  }

  // Save MTD for NOX: compound into ytd2026 and log to noxMtdLog (NOX only)
  if (url.searchParams.get("action") === "set-nox-mtd") {
    if (clientKey !== "nox") return NextResponse.json({ error: "Action only valid for NOX client" }, { status: 400 });
    const body = await req.json();
    const { fundId, month, mtd } = body as { fundId: string; month: string; mtd: number };
    if (!fundId || !month || !/^\d{4}-\d{2}$/.test(month) || typeof mtd !== "number") {
      return NextResponse.json({ error: "Missing fundId, invalid month (YYYY-MM), or non-numeric mtd" }, { status: 400 });
    }
    let found = false;
    const categories = (data.categories || []) as Record<string, unknown>[];
    for (const cat of categories) {
      const funds = cat.funds as Record<string, unknown>[];
      const idx = funds.findIndex((f) => f.id === fundId);
      if (idx >= 0) {
        const fund = funds[idx] as Record<string, unknown>;
        const returns = (fund.returns as Record<string, number | null>) ?? {};
        const ytdCurrent = (returns.ytd2026 as number) ?? 0;
        const ytdNew = (1 + ytdCurrent) * (1 + mtd) - 1;
        fund.returns = { ...returns, ytd2026: ytdNew };
        fund.lastMonth = month;
        fund.lastUpdatedAt = new Date().toISOString();
        const log = { ...((fund.noxMtdLog as Record<string, number>) ?? {}) };
        log[month] = mtd;
        fund.noxMtdLog = log;
        found = true;
        break;
      }
    }
    if (!found) return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    await writeData(clientKey, data);
    return NextResponse.json({ success: true });
  }

  // Undo last MTD entry for NOX: reverse compound and remove from log (NOX only)
  if (url.searchParams.get("action") === "undo-nox-mtd") {
    if (clientKey !== "nox") return NextResponse.json({ error: "Action only valid for NOX client" }, { status: 400 });
    const body = await req.json();
    const { fundId } = body as { fundId: string };
    if (!fundId) return NextResponse.json({ error: "Missing fundId" }, { status: 400 });
    let found = false;
    const categories = (data.categories || []) as Record<string, unknown>[];
    for (const cat of categories) {
      const funds = cat.funds as Record<string, unknown>[];
      const idx = funds.findIndex((f) => f.id === fundId);
      if (idx >= 0) {
        const fund = funds[idx] as Record<string, unknown>;
        const log = { ...((fund.noxMtdLog as Record<string, number>) ?? {}) };
        const sortedKeys = Object.keys(log).sort();
        if (sortedKeys.length === 0) {
          return NextResponse.json({ error: "No history to undo" }, { status: 400 });
        }
        const lastKey = sortedKeys[sortedKeys.length - 1];
        const lastMtd = log[lastKey];
        const returns = (fund.returns as Record<string, number | null>) ?? {};
        const ytdCurrent = (returns.ytd2026 as number) ?? 0;
        const ytdRestored = (1 + ytdCurrent) / (1 + lastMtd) - 1;
        fund.returns = { ...returns, ytd2026: ytdRestored };
        delete log[lastKey];
        fund.noxMtdLog = log;
        const remainingKeys = Object.keys(log).sort();
        fund.lastMonth = remainingKeys.length > 0 ? remainingKeys[remainingKeys.length - 1] : null;
        fund.lastUpdatedAt = new Date().toISOString();
        found = true;
        break;
      }
    }
    if (!found) return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    await writeData(clientKey, data);
    return NextResponse.json({ success: true });
  }

  // Set delayed flag on a single fund by ID
  if (url.searchParams.get("action") === "set-delayed-flag") {
    const body = await req.json();
    const { fundId, delayed } = body as { fundId: string; delayed: boolean };
    if (!fundId || typeof delayed !== "boolean") {
      return NextResponse.json({ error: "Missing fundId or invalid delayed (boolean)" }, { status: 400 });
    }
    let found = false;
    const categories = (data.categories || []) as Record<string, unknown>[];
    for (const cat of categories) {
      const funds = cat.funds as Record<string, unknown>[];
      const idx = funds.findIndex((f) => f.id === fundId);
      if (idx >= 0) {
        funds[idx].delayed = delayed;
        funds[idx].lastUpdatedAt = new Date().toISOString();
        found = true;
        break;
      }
    }
    if (!found) return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    await writeData(clientKey, data);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown PATCH action" }, { status: 400 });
}
