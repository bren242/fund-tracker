/**
 * POST /api/parse/bulk-apply?client=green
 *
 * Applies approved bulk fund updates to KV.
 * Writes exactly 4 fields per fund: monthlyReturn, monthlyReturns[reportMonth],
 * lastUpdated (YYYY-MM), lastUpdatedAt (ISO). Never touches returns.ytdYYYY.
 *
 * Body:   { reportMonth: "YYYY-MM", funds: [{ fundId, monthlyReturn }] }
 * Result: { successes: string[], failures: [...], snapshot: {...} }
 */
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getClientKeyFromRequest } from "@/lib/clientKey";
import { storageRead, storageWrite } from "@/lib/storage";
import type { FundsData } from "@/lib/types";

const SUPER_ADMIN_PASSWORD = "super2026";
const DEFAULT_ADMIN_PASSWORD = "admin2026";

async function isAuthorized(req: NextRequest, clientKey: string): Promise<boolean> {
  const password = req.headers.get("x-admin-password") || "";
  if (password === SUPER_ADMIN_PASSWORD) return true;
  const fd = await storageRead<Record<string, unknown>>(`funds:${clientKey}`, {});
  const adminPw = (fd.adminPassword as string) || DEFAULT_ADMIN_PASSWORD;
  return password === adminPw;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ApplyEntry {
  fundId: string;
  monthlyReturn: number;
}

interface FailureEntry {
  fundId: string;
  fundName?: string;
  error: string;
}

interface SnapshotEntry {
  monthlyReturn: number | null;
  monthlyReturnsValue: number | null;
  lastUpdated: string | null;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const clientKey = getClientKeyFromRequest(req.url);

    if (!(await isAuthorized(req, clientKey))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as {
      reportMonth?: string;
      funds?: ApplyEntry[];
    };

    const reportMonth = (body.reportMonth ?? "").trim();
    const funds = body.funds;

    if (!/^\d{4}-\d{2}$/.test(reportMonth)) {
      return NextResponse.json(
        { error: "reportMonth חייב להיות YYYY-MM" },
        { status: 400 }
      );
    }
    if (!Array.isArray(funds) || funds.length === 0) {
      return NextResponse.json({ error: "funds array ריק" }, { status: 400 });
    }

    // Validate all entries before touching KV
    for (const entry of funds) {
      if (!entry.fundId || typeof entry.fundId !== "string") {
        return NextResponse.json(
          { error: "fundId חסר או לא תקין" },
          { status: 400 }
        );
      }
      if (typeof entry.monthlyReturn !== "number" || isNaN(entry.monthlyReturn)) {
        return NextResponse.json(
          { error: `monthlyReturn לא תקין עבור ${entry.fundId}` },
          { status: 400 }
        );
      }
      if (Math.abs(entry.monthlyReturn) > 0.5) {
        return NextResponse.json(
          {
            error: `תשואה חריגה עבור ${entry.fundId}: ${(entry.monthlyReturn * 100).toFixed(2)}%`,
          },
          { status: 400 }
        );
      }
    }

    // Load current data once
    const fd = await storageRead<FundsData>(`funds:${clientKey}`, {
      lastUpdated: "",
      categories: [],
    });

    // Build O(1) lookup: fundId → { catIdx, fundIdx }
    type Pos = { catIdx: number; fundIdx: number };
    const index = new Map<string, Pos>();
    for (let ci = 0; ci < fd.categories.length; ci++) {
      const cat = fd.categories[ci];
      for (let fi = 0; fi < cat.funds.length; fi++) {
        index.set(cat.funds[fi].id, { catIdx: ci, fundIdx: fi });
      }
    }

    const successes: string[] = [];
    const failures: FailureEntry[] = [];
    const snapshot: Record<string, SnapshotEntry> = {};
    const now = new Date().toISOString();

    for (const entry of funds) {
      const pos = index.get(entry.fundId);
      if (!pos) {
        failures.push({ fundId: entry.fundId, error: "קרן לא נמצאה ב-KV" });
        console.error(`[bulk/apply] FAIL ${entry.fundId}: not found`);
        continue;
      }

      const fund = fd.categories[pos.catIdx].funds[pos.fundIdx];
      const monthlyReturns = fund.monthlyReturns ?? {};
      const before = (monthlyReturns as Record<string, number | undefined>)[reportMonth] ?? null;

      // Snapshot before state for potential rollback
      snapshot[entry.fundId] = {
        monthlyReturn: fund.monthlyReturn,
        monthlyReturnsValue: typeof before === "number" ? before : null,
        lastUpdated: fund.lastUpdated ?? null,
      };

      // Patch exactly 4 fields — never touch returns.*
      fd.categories[pos.catIdx].funds[pos.fundIdx] = {
        ...fund,
        monthlyReturn: entry.monthlyReturn,
        monthlyReturns: {
          ...monthlyReturns,
          [reportMonth]: entry.monthlyReturn,
        } as Record<string, number>,
        lastUpdated: reportMonth,
        lastUpdatedAt: now,
      };

      successes.push(entry.fundId);
      console.log(
        `[bulk/apply] OK ${entry.fundId} ${reportMonth} ` +
          `before=${before !== null ? (before * 100).toFixed(2) + "%" : "null"} ` +
          `after=${(entry.monthlyReturn * 100).toFixed(2)}%`
      );
    }

    if (successes.length > 0) {
      // Advance global lastUpdated if reportMonth is newer
      const current = fd.lastUpdated ?? "";
      if (reportMonth > current) {
        fd.lastUpdated = reportMonth;
      }
      await storageWrite(`funds:${clientKey}`, fd);
    }

    return NextResponse.json({ successes, failures, snapshot });
  } catch (err) {
    console.error("[bulk/apply] unhandled error:", err);
    return NextResponse.json({ error: "שגיאה פנימית" }, { status: 500 });
  }
}
