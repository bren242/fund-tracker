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

/** After any monthly return change, recompute the stored ytd/annual key so legacy fields stay fresh */
function recomputeYearReturn(fund: Record<string, unknown>, affectedYear: string): void {
  const mr = (fund.monthlyReturns as Record<string, number>) ?? {};
  const returns = (fund.returns as Record<string, number | null>) ?? {};
  const currentYear = new Date().getFullYear().toString();

  const ytdMonths = Object.entries(mr)
    .filter(([k]) => k.startsWith(`${affectedYear}-`))
    .sort(([a], [b]) => a.localeCompare(b));

  if (affectedYear === currentYear) {
    // Always recompute YTD for current year
    if (ytdMonths.length > 0) {
      let cumulative = 1;
      for (const [, v] of ytdMonths) cumulative *= (1 + v);
      returns[`ytd${affectedYear}`] = Math.round((cumulative - 1) * 10000) / 10000;
    } else {
      returns[`ytd${affectedYear}`] = null;
    }
  } else if (ytdMonths.length === 12) {
    // Historical year: only update when all 12 months present
    let cumulative = 1;
    for (const [, v] of ytdMonths) cumulative *= (1 + v);
    returns[`y${affectedYear}`] = Math.round((cumulative - 1) * 10000) / 10000;
  }
  fund.returns = returns;
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
        recomputeYearReturn(funds[idx], month.slice(0, 4));
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
        recomputeYearReturn(funds[idx], month.slice(0, 4));
        found = true;
        break;
      }
    }
    if (!found) return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    await writeData(clientKey, data);
    return NextResponse.json({ success: true });
  }

  // Save MTD for NOX: update log and recompute ytd from scratch (NOX only)
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
        const log = { ...((fund.noxMtdLog as Record<string, number>) ?? {}), [month]: mtd };
        fund.noxMtdLog = log;
        // Recompute ytd purely from log entries for the affected year — no dirty-base bug
        const affectedYear = month.slice(0, 4);
        const currentYear = new Date().getFullYear().toString();
        const yearEntries = Object.entries(log)
          .filter(([k]) => k.startsWith(affectedYear))
          .sort(([a], [b]) => a.localeCompare(b));
        let ytd = 1;
        for (const [, v] of yearEntries) ytd *= (1 + v);
        ytd -= 1;
        const ytdKey = affectedYear === currentYear ? `ytd${affectedYear}` : `y${affectedYear}`;
        fund.returns = { ...returns, [ytdKey]: Math.round(ytd * 10000) / 10000 };
        fund.monthlyReturn = mtd;
        fund.lastMonth = month;
        fund.lastUpdatedAt = new Date().toISOString();
        found = true;
        break;
      }
    }
    if (!found) return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    await writeData(clientKey, data);
    return NextResponse.json({ success: true });
  }

  // Undo last MTD entry for NOX: remove from log and recompute ytd from remaining entries (NOX only)
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
        const affectedYear = lastKey.slice(0, 4);
        delete log[lastKey];
        fund.noxMtdLog = log;
        // Recompute ytd from remaining entries for that year
        const returns = (fund.returns as Record<string, number | null>) ?? {};
        const currentYear = new Date().getFullYear().toString();
        const ytdKey = affectedYear === currentYear ? `ytd${affectedYear}` : `y${affectedYear}`;
        const yearEntries = Object.entries(log)
          .filter(([k]) => k.startsWith(affectedYear))
          .sort(([a], [b]) => a.localeCompare(b));
        if (yearEntries.length === 0) {
          fund.returns = { ...returns, [ytdKey]: null };
        } else {
          let ytd = 1;
          for (const [, v] of yearEntries) ytd *= (1 + v);
          ytd -= 1;
          fund.returns = { ...returns, [ytdKey]: Math.round(ytd * 10000) / 10000 };
        }
        const remainingKeys = Object.keys(log).sort();
        const prevKey = remainingKeys.length > 0 ? remainingKeys[remainingKeys.length - 1] : null;
        fund.monthlyReturn = prevKey !== null ? log[prevKey] : null;
        fund.lastMonth = prevKey;
        fund.lastUpdatedAt = new Date().toISOString();
        found = true;
        break;
      }
    }
    if (!found) return NextResponse.json({ error: "Fund not found" }, { status: 404 });
    await writeData(clientKey, data);
    return NextResponse.json({ success: true });
  }

  // One-time migration: recompute ytd for all NOX funds from noxMtdLog (super admin only)
  if (url.searchParams.get("action") === "fix-nox-ytd") {
    if (clientKey !== "nox") return NextResponse.json({ error: "NOX only" }, { status: 400 });
    const auth = isAuthorized(req, data);
    if (auth !== "super") return NextResponse.json({ error: "Super admin only" }, { status: 403 });
    const currentYear = new Date().getFullYear().toString();
    const categories = (data.categories || []) as Record<string, unknown>[];
    const fixed: string[] = [];
    for (const cat of categories) {
      const funds = cat.funds as Record<string, unknown>[];
      for (const fund of funds) {
        const log = (fund.noxMtdLog as Record<string, number> | undefined) ?? {};
        if (Object.keys(log).length === 0) continue;
        const returns = { ...((fund.returns as Record<string, number | null>) ?? {}) };
        // Group log entries by year and recompute each year's return
        const byYear: Record<string, [string, number][]> = {};
        for (const [k, v] of Object.entries(log)) {
          const yr = k.slice(0, 4);
          if (!byYear[yr]) byYear[yr] = [];
          byYear[yr].push([k, v]);
        }
        let changed = false;
        for (const [yr, entries] of Object.entries(byYear)) {
          entries.sort(([a], [b]) => a.localeCompare(b));
          let ytd = 1;
          for (const [, v] of entries) ytd *= (1 + v);
          ytd -= 1;
          const ytdKey = yr === currentYear ? `ytd${yr}` : `y${yr}`;
          const rounded = Math.round(ytd * 10000) / 10000;
          if (returns[ytdKey] !== rounded) {
            returns[ytdKey] = rounded;
            changed = true;
          }
        }
        if (changed) {
          fund.returns = returns;
          fixed.push((fund.name as string) || (fund.id as string));
        }
      }
    }
    await writeData(clientKey, data);
    return NextResponse.json({ success: true, fixed, count: fixed.length });
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
