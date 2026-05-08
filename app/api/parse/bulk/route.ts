/**
 * POST /api/parse/bulk?client=green
 *
 * Parses free-form Hebrew text containing multiple fund monthly returns.
 * Sends fund list to Claude for matching, then enriches each result with
 * category/manager/YTD data from KV.
 *
 * Body:   { text: string, reportMonth: "YYYY-MM" }
 * Result: { reportMonth, funds: BulkFundResult[] }
 */
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getClientKeyFromRequest } from "@/lib/clientKey";
import { storageRead } from "@/lib/storage";
import { computeYTDFromMonthlyReturns } from "@/lib/metrics";
import type { FundsData, Fund, Category } from "@/lib/types";

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

interface ClaudeEntry {
  rawLine: string;
  fundId: string | null;
  fundName: string;
  similarity: number;
  monthlyReturn: number | null;
}

export interface BulkFundResult {
  rawLine: string;
  fundId: string | null;
  fundName: string;
  categoryName: string | null;
  manager: string | null;
  similarity: number;
  monthlyReturn: number | null;
  ytdComputed: number | null;
  ytdStored: number | null;
  monthExists: boolean;
  existingValue: number | null;
  status: "green" | "yellow" | "red";
  warnings: string[];
}

type FundWithMeta = Fund & { categoryName: string };

// ── Helpers ──────────────────────────────────────────────────────────────────

function deriveStatus(entry: Omit<BulkFundResult, "status">): "green" | "yellow" | "red" {
  if (
    entry.fundId === null ||
    entry.similarity < 0.7 ||
    entry.monthlyReturn === null ||
    Math.abs(entry.monthlyReturn) > 0.5
  ) return "red";
  if (entry.similarity < 0.9 || entry.monthExists) return "yellow";
  return "green";
}

// ── Claude call ──────────────────────────────────────────────────────────────

async function callClaude(
  apiKey: string,
  fundList: { id: string; name: string }[],
  text: string
): Promise<ClaudeEntry[]> {
  const fundLines = fundList.map((f) => `${f.id}: ${f.name}`).join("\n");

  const systemPrompt = `You are a Hebrew fund performance data extraction assistant for an Israeli fund tracking platform.

Given text containing multiple fund monthly return entries, extract each entry and match it to the closest fund in the provided list.

EXTRACTION RULES:
- Each entry is typically one line: "FUND_NAME RETURN%" or "FUND_NAME: RETURN%"
- Convert return to decimal: 7.7% → 0.077, -0.15% → -0.0015
- Skip lines that are dates, titles, or headers (e.g. "תשואות אפריל 2026")
- SKIP any line containing YTD / מצטבר / שנתי / מצטברת / מה"ש — these are not monthly returns
- Extract ONLY monthly (one-month) returns

MATCHING RULES:
- Match each fund name against the provided list using fuzzy Hebrew matching
- Partial names like "רידינג" should match "רידינג קפיטל"; "ספרה" should match "ספרה בונד"
- similarity: 0.0–1.0 (1.0 = exact match)
- If best similarity < 0.7 — set fundId=null. NEVER guess.
- If similarity >= 0.7 — set fundId to the matched fund's id

EXISTING FUNDS (format: id: name):
${fundLines}

Return ONLY a valid JSON array with no explanation and no markdown:
[{"rawLine":"...","fundId":"...or null","fundName":"...","similarity":0.97,"monthlyReturn":0.077}]`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      temperature: 0,
      system: systemPrompt,
      messages: [{ role: "user", content: text }],
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "");
    throw new Error(`Claude API ${response.status}: ${err}`);
  }

  const result = await response.json() as { content: { type: string; text: string }[] };
  const raw = result.content?.[0]?.text?.trim() ?? "";

  // Strip accidental markdown fences
  const cleaned = raw
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  const parsed: unknown = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) return [];

  return (parsed as Record<string, unknown>[]).map((entry) => ({
    rawLine: String(entry.rawLine ?? ""),
    fundId: entry.fundId != null ? String(entry.fundId) : null,
    fundName: String(entry.fundName ?? ""),
    similarity: typeof entry.similarity === "number" ? entry.similarity : 0,
    monthlyReturn:
      typeof entry.monthlyReturn === "number" ? entry.monthlyReturn : null,
  }));
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const clientKey = getClientKeyFromRequest(req.url);

    if (!(await isAuthorized(req, clientKey))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as { text?: string; reportMonth?: string };
    const text = (body.text ?? "").trim();
    const reportMonth = (body.reportMonth ?? "").trim();

    if (!text || text.length < 5) {
      return NextResponse.json({ error: "טקסט קצר מדי" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}$/.test(reportMonth)) {
      return NextResponse.json(
        { error: "reportMonth חייב להיות YYYY-MM" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY לא מוגדר" },
        { status: 500 }
      );
    }

    // Load all active funds
    const fundsData = await storageRead<FundsData>(`funds:${clientKey}`, {
      lastUpdated: "",
      categories: [],
    });

    const allFunds: FundWithMeta[] = [];
    for (const cat of fundsData.categories as Category[]) {
      for (const fund of cat.funds) {
        if (fund.active === false) continue;
        allFunds.push({ ...fund, categoryName: cat.name });
      }
    }

    const fundList = allFunds.map((f) => ({ id: f.id, name: f.name }));

    // Parse with Claude
    let claudeEntries: ClaudeEntry[] = [];
    try {
      claudeEntries = await callClaude(apiKey, fundList, text);
    } catch (err) {
      console.error("[bulk/parse] Claude error:", err);
      return NextResponse.json(
        { error: "שגיאה בפענוח — בדוק את הטקסט ונסה שוב" },
        { status: 500 }
      );
    }

    // Log matching decisions
    for (const e of claudeEntries) {
      console.log(
        `[bulk/parse] "${e.rawLine}" → fundId=${e.fundId ?? "null"} sim=${e.similarity} ret=${e.monthlyReturn}`
      );
    }

    const year = reportMonth.slice(0, 4);

    // Enrich each entry with KV data
    const results: BulkFundResult[] = claudeEntries.map((entry) => {
      const fund = entry.fundId
        ? allFunds.find((f) => f.id === entry.fundId)
        : undefined;

      const monthlyReturns = (fund?.monthlyReturns ?? {}) as Record<
        string,
        number | null | undefined
      >;

      const ytdComputed =
        fund && entry.monthlyReturn !== null
          ? computeYTDFromMonthlyReturns(
              monthlyReturns,
              year,
              reportMonth,
              entry.monthlyReturn
            )
          : null;

      // YTD stored: ytd<YEAR> (current year) or y<YEAR> (past years)
      const returnsMap = fund?.returns as Record<string, number | null> | undefined;
      const ytdStored =
        returnsMap?.[`ytd${year}`] ?? returnsMap?.[`y${year}`] ?? null;

      const existingRaw = monthlyReturns[reportMonth];
      const existingValue =
        typeof existingRaw === "number" ? existingRaw : null;
      const monthExists = existingValue !== null;

      const warnings: string[] = [];
      if (!fund && entry.fundId) warnings.push("קרן לא נמצאה ב-KV");
      if (entry.similarity < 0.7) warnings.push("התאמה נמוכה מדי לאישור");
      if (entry.monthlyReturn !== null && Math.abs(entry.monthlyReturn) > 0.5)
        warnings.push("תשואה חריגה (>50%)");
      if (monthExists)
        warnings.push(
          `חודש כבר קיים: ${(existingValue * 100).toFixed(2)}%`
        );

      const partial: Omit<BulkFundResult, "status"> = {
        rawLine: entry.rawLine,
        fundId: entry.fundId,
        fundName: fund?.name ?? entry.fundName,
        categoryName: fund?.categoryName ?? null,
        manager: fund?.manager ?? null,
        similarity: entry.similarity,
        monthlyReturn: entry.monthlyReturn,
        ytdComputed,
        ytdStored,
        monthExists,
        existingValue,
        warnings,
      };

      return { ...partial, status: deriveStatus(partial) };
    });

    return NextResponse.json({ reportMonth, funds: results });
  } catch (err) {
    console.error("[bulk/parse] unhandled error:", err);
    return NextResponse.json({ error: "שגיאה פנימית" }, { status: 500 });
  }
}
