import { NextRequest, NextResponse } from "next/server";
import { getClientKeyFromRequest } from "@/lib/clientKey";
import { storageRead, storageWrite } from "@/lib/storage";
import { Benchmark } from "@/lib/types";

const SUPER_ADMIN_PASSWORD = "super2026";
const DEFAULT_ADMIN_PASSWORD = "admin2026";

async function getAdminPassword(clientKey: string): Promise<string> {
  const data = await storageRead<Record<string, unknown>>(`funds:${clientKey}`, {});
  return (data.adminPassword as string) || DEFAULT_ADMIN_PASSWORD;
}

async function isAuthorized(req: NextRequest, clientKey: string): Promise<"super" | "admin" | false> {
  const password = req.headers.get("x-admin-password") || "";
  if (password === SUPER_ADMIN_PASSWORD) return "super";
  const adminPass = await getAdminPassword(clientKey);
  if (password === adminPass) return "admin";
  return false;
}

async function readBenchmarks(clientKey: string): Promise<Benchmark[]> {
  return storageRead<Benchmark[]>(`benchmarks:${clientKey}`, []);
}

// ─── Auto-compute returns from monthly data ───────────────────────────────────
// Historical years: only updates if all 12 months are present (safe for partial data)
// Current year: always computes YTD from whatever months exist
function recomputeReturns(bm: Benchmark): void {
  const mr = bm.monthlyReturns || {};
  const currentYear = new Date().getFullYear();

  const historicalYears = [2019, 2020, 2021, 2022, 2023, 2024, 2025] as const;
  for (const year of historicalYears) {
    let compound = 1;
    let count = 0;
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, "0")}`;
      if (typeof mr[key] === "number") {
        compound *= (1 + mr[key]);
        count++;
      }
    }
    if (count === 12) {
      const k = `y${year}` as keyof typeof bm.returns;
      bm.returns[k] = Math.round((compound - 1) * 10000) / 10000;
    }
    // count < 12 → leave existing value unchanged (safe for S&P 500 etc.)
  }

  // Current year YTD
  const ytdMonths = Object.entries(mr)
    .filter(([k]) => k.startsWith(`${currentYear}-`))
    .sort(([a], [b]) => a.localeCompare(b));
  if (ytdMonths.length > 0) {
    let cumulative = 1;
    for (const [, v] of ytdMonths) cumulative *= (1 + v);
    const ytdKey = `ytd${currentYear}` as keyof typeof bm.returns;
    bm.returns[ytdKey] = Math.round((cumulative - 1) * 10000) / 10000;
  }
}

// GET — list benchmarks
export async function GET(req: NextRequest) {
  const clientKey = getClientKeyFromRequest(req.url);
  const benchmarks = await readBenchmarks(clientKey);
  // Public: return only active benchmarks
  const url = new URL(req.url);
  const isAdmin = url.searchParams.get("admin") === "true";
  if (!isAdmin) {
    return NextResponse.json(benchmarks.filter((b) => b.active));
  }
  return NextResponse.json(benchmarks);
}

// POST — create / update / delete benchmarks
export async function POST(req: NextRequest) {
  const clientKey = getClientKeyFromRequest(req.url);
  const auth = await isAuthorized(req, clientKey);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  const benchmarks = await readBenchmarks(clientKey);

  // CREATE
  if (action === "create") {
    const body = await req.json();
    const { name, currency } = body;
    if (!name || !currency) {
      return NextResponse.json({ error: "Missing name or currency" }, { status: 400 });
    }

    const newBm: Benchmark = {
      id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      name,
      currency: currency === "USD" ? "USD" : "ILS",
      returns: {
        ytd2026: null, y2025: null, y2024: null, y2023: null,
        y2022: null, y2021: null, y2020: null, y2019: null,
      },
      monthlyReturns: {},
      active: true,
    };

    benchmarks.push(newBm);
    await storageWrite(`benchmarks:${clientKey}`, benchmarks);
    return NextResponse.json({ success: true, benchmark: newBm });
  }

  // UPDATE — update returns for a benchmark
  if (action === "update") {
    const body = await req.json();
    const { id, returns, monthlyReturns, name, currency, active } = body;
    if (!id) {
      return NextResponse.json({ error: "Missing benchmark id" }, { status: 400 });
    }

    const idx = benchmarks.findIndex((b) => b.id === id);
    if (idx < 0) {
      return NextResponse.json({ error: "Benchmark not found" }, { status: 404 });
    }

    if (name !== undefined) benchmarks[idx].name = name;
    if (currency === "ILS" || currency === "USD") benchmarks[idx].currency = currency;
    if (typeof active === "boolean") benchmarks[idx].active = active;

    if (returns && typeof returns === "object") {
      const yearKeys = ["ytd2026", "y2025", "y2024", "y2023", "y2022", "y2021", "y2020", "y2019"] as const;
      for (const k of yearKeys) {
        if (k in returns) {
          benchmarks[idx].returns[k] = typeof returns[k] === "number" ? returns[k] : null;
        }
      }
    }

    if (monthlyReturns && typeof monthlyReturns === "object") {
      benchmarks[idx].monthlyReturns = {
        ...(benchmarks[idx].monthlyReturns || {}),
        ...monthlyReturns,
      };
    }

    recomputeReturns(benchmarks[idx]);

    await storageWrite(`benchmarks:${clientKey}`, benchmarks);
    return NextResponse.json({ success: true, benchmark: benchmarks[idx] });
  }

  // RECALCULATE-ALL — recompute annual + YTD for every benchmark from its monthlyReturns
  if (action === "recalculate-all") {
    const auth2 = await isAuthorized(req, clientKey);
    if (!auth2) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let updated = 0;
    for (const bm of benchmarks) {
      if (Object.keys(bm.monthlyReturns || {}).length > 0) {
        recomputeReturns(bm);
        updated++;
      }
    }
    await storageWrite(`benchmarks:${clientKey}`, benchmarks);
    return NextResponse.json({ success: true, updated });
  }

  // DELETE
  if (action === "delete") {
    const body = await req.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: "Missing benchmark id" }, { status: 400 });
    }
    const filtered = benchmarks.filter((b) => b.id !== id);
    await storageWrite(`benchmarks:${clientKey}`, filtered);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
