export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { getClientKeyFromRequest } from "@/lib/clientKey";
import { storageRead, storageWrite, storageAppend } from "@/lib/storage";
import { ParseDraft, ParseLogEntry, ParsedField, CollisionInfo } from "@/lib/parseTypes";
import { createHash } from "crypto";

const SUPER_ADMIN_PASSWORD = "super2026";
const DEFAULT_ADMIN_PASSWORD = "admin2026";

/* ================================================================== */
/*  Token Usage Tracking                                               */
/* ================================================================== */

interface TokenUsageData {
  month: string; // YYYY-MM
  inputTokens: number;
  outputTokens: number;
  callCount: number;
  calls: {
    timestamp: string;
    action: string;
    inputTokens: number;
    outputTokens: number;
    fileName?: string;
    cached?: boolean;
  }[];
}

interface ApiUsage {
  input_tokens: number;
  output_tokens: number;
}

const DEFAULT_MONTHLY_TOKEN_LIMIT = 500_000; // input tokens
const DEFAULT_MONTHLY_CALL_LIMIT = 100;
const WARN_THRESHOLD_PERCENT = 80;

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7); // "YYYY-MM"
}

async function getTokenUsage(clientKey: string): Promise<TokenUsageData> {
  const currentMonth = getCurrentMonth();
  const usage = await storageRead<TokenUsageData>(`token-usage:${clientKey}`, {
    month: currentMonth,
    inputTokens: 0,
    outputTokens: 0,
    callCount: 0,
    calls: [],
  });

  // Auto-reset if month changed
  if (usage.month !== currentMonth) {
    return {
      month: currentMonth,
      inputTokens: 0,
      outputTokens: 0,
      callCount: 0,
      calls: [],
    };
  }

  return usage;
}

async function recordTokenUsage(
  clientKey: string,
  action: string,
  apiUsage: ApiUsage,
  fileName?: string,
  cached?: boolean
): Promise<TokenUsageData> {
  const usage = await getTokenUsage(clientKey);

  usage.inputTokens += apiUsage.input_tokens;
  usage.outputTokens += apiUsage.output_tokens;
  usage.callCount += 1;

  // Keep last 200 call entries
  usage.calls.push({
    timestamp: new Date().toISOString(),
    action,
    inputTokens: apiUsage.input_tokens,
    outputTokens: apiUsage.output_tokens,
    fileName,
    cached,
  });
  if (usage.calls.length > 200) {
    usage.calls = usage.calls.slice(-200);
  }

  await storageWrite(`token-usage:${clientKey}`, usage);
  return usage;
}

async function getClientTokenLimit(clientKey: string): Promise<{ monthlyInputTokens: number; monthlyCallCount: number }> {
  const brand = await storageRead<Record<string, unknown>>(`brand:${clientKey}`, {});
  const limits = brand.tokenLimits as Record<string, number> | undefined;
  return {
    monthlyInputTokens: limits?.monthlyInputTokens || DEFAULT_MONTHLY_TOKEN_LIMIT,
    monthlyCallCount: limits?.monthlyCallCount || DEFAULT_MONTHLY_CALL_LIMIT,
  };
}

async function checkTokenLimit(clientKey: string): Promise<{
  allowed: boolean;
  usage: TokenUsageData;
  limit: number;
  percent: number;
  warning: boolean;
}> {
  const usage = await getTokenUsage(clientKey);
  const limits = await getClientTokenLimit(clientKey);
  const percent = limits.monthlyInputTokens > 0
    ? Math.round((usage.inputTokens / limits.monthlyInputTokens) * 100)
    : 0;

  return {
    allowed: usage.inputTokens < limits.monthlyInputTokens && usage.callCount < limits.monthlyCallCount,
    usage,
    limit: limits.monthlyInputTokens,
    percent,
    warning: percent >= WARN_THRESHOLD_PERCENT && percent < 100,
  };
}

/* ================================================================== */
/*  File Cache (hash-based duplicate detection)                        */
/* ================================================================== */

async function getCachedResult(clientKey: string, fileHash: string): Promise<Record<string, unknown> | null> {
  const cached = await storageRead<{ result: Record<string, unknown>; cachedAt: string } | null>(
    `parse-cache:${clientKey}:${fileHash}`, null
  );
  if (!cached) return null;

  // Expire after 30 days
  const cachedDate = new Date(cached.cachedAt);
  const now = new Date();
  const daysDiff = (now.getTime() - cachedDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff > 30) return null;

  // Invalidate old format caches (missing returnBasisOptions)
  if (!cached.result.returnBasisOptions) return null;

  // v2: invalidate caches created with max_tokens=1024 (truncated results)
  // v3: dual currency entries now include allMonthlyReturns + full field sets
  // v4: entries now include returns.y* fields + fixed currency label ordering
  // v5: fixed currency inversion (propagation restricted to same-currency) + field dedup
  // v6: fixed currency prompt (label-only, no position assumptions) + ytd→y auto-promotion for Dec reports
  // v7: matching now includes returnBasis to distinguish ILS/USD fund variants
  // v8: fixed dual-currency prompt bias that caused ILS/USD inversion
  // v9: header-driven table parsing (not position-driven) + annual/monthly validation
  // v10: strengthened RTL table parsing + server-side column swap auto-correction
    // v14: dual-currency split into 2 API calls
  // v15: strengthened single-currency prompt
  // v16: YTD=annual return, ITD ignored, full monthly example, ytd→y promotion for all years
  // v17: structured template extraction for dual-currency documents
  // v18: anchor values + pre-filled 2022/2026 rows + reading accuracy instructions
  // v19: all historical data pre-filled, AI only extracts X cells (mar+ytd 2026)
  // v20: fix ytd vs y — incomplete years use returns.ytd, complete years use returns.y
  // v21: dynamic structured prompt for all documents (single + dual currency)
  // v22: fix floating point precision in structured response parsing
  // v23: reverse month order in template to match visual LTR reading of RTL table
  // v24: remove pre-fill, fixed year range 2019-2026, all X cells
  // v27: single-pass only (removed buildDynamicStructuredPrompt second API call)
  // v47: validation fix — effectiveReportMonth prevents valid months from being excluded
  if (!cached.result._cacheVersion || (cached.result._cacheVersion as number) < 47) return null;

  return cached.result;
}

async function setCachedResult(clientKey: string, fileHash: string, result: Record<string, unknown>): Promise<void> {
  await storageWrite(`parse-cache:${clientKey}:${fileHash}`, {
    result,
    cachedAt: new Date().toISOString(),
  });
}

// Allowed field key patterns (whitelist validation)
const ALLOWED_FIELD_KEYS = new Set([
  "monthlyReturn",
  "manager",
  "classification",
  "sharpe",
  "stdDev",
]);

/** Check if a field key is allowed (static set + dynamic patterns) */
function isAllowedKey(key: string): boolean {
  if (ALLOWED_FIELD_KEYS.has(key)) return true;
  // Allow returns.yYYYY (e.g. returns.y2025) and returns.ytdYYYY (e.g. returns.ytd2026)
  if (/^returns\.(y\d{4}|ytd\d{4})$/.test(key)) return true;
  // Allow monthlyReturns.YYYY-MM pattern
  if (/^monthlyReturns\.\d{4}-(0[1-9]|1[0-2])$/.test(key)) return true;
  return false;
}

async function isAuthorized(req: NextRequest, clientKey: string): Promise<"super" | "admin" | false> {
  const password = req.headers.get("x-admin-password") || "";
  if (password === SUPER_ADMIN_PASSWORD) return "super";
  const fundsData = await storageRead<Record<string, unknown>>(`funds:${clientKey}`, {});
  const adminPw = (fundsData.adminPassword as string) || DEFAULT_ADMIN_PASSWORD;
  if (password === adminPw) return "admin";
  return false;
}

async function isAiParserEnabled(clientKey: string): Promise<boolean> {
  const brand = await storageRead<Record<string, unknown>>(`brand:${clientKey}`, {});
  const features = brand.features as Record<string, unknown> | undefined;
  return features?.aiParser === true;
}

function generateId(): string {
  return `parse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Clamp a number between min and max */
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/* ================================================================== */
/*  Sharpe & StdDev Auto-Calculation                                    */
/* ================================================================== */

const RISK_FREE_MONTHLY = 0.003; // ~3.6% annual risk-free rate (approx Israel)
const MIN_OBSERVATIONS = 12;

/**
 * Calculate stdDev and Sharpe from monthly returns.
 * Returns null if fewer than MIN_OBSERVATIONS observations.
 * Does NOT overwrite values extracted from the document (AI-extracted values take priority).
 */
function calculateRiskMetrics(monthlyReturns: Record<string, number>): {
  sharpe: number | null;
  stdDev: number;
} | null {
  const values = Object.values(monthlyReturns).filter((v) => typeof v === "number" && !isNaN(v));
  if (values.length < MIN_OBSERVATIONS) return null;

  // Mean monthly return
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;

  // Standard deviation (sample, ÷N-1)
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  const stdDev = Math.sqrt(variance);

  // Sharpe ratio (annualized): (mean - riskFree) / stdDev * sqrt(12)
  // Cap: stdDev < 0.001 or |sharpe| > 5 → null (unreliable for stable-income funds)
  let sharpe: number | null = null;
  if (stdDev >= 0.001) {
    const raw = ((mean - RISK_FREE_MONTHLY) / stdDev) * Math.sqrt(12);
    if (Math.abs(raw) <= 5) {
      sharpe = Math.round(raw * 100) / 100;
    }
  }

  return {
    sharpe,
    stdDev: Math.round(stdDev * 10000) / 10000, // 4 decimals (percentage precision)
  };
}

/**
 * Apply auto-calculated sharpe/stdDev to a fund object, respecting document-extracted values.
 * @param fund - The fund record to update
 * @param hasExtractedSharpe - Whether the AI extracted a sharpe value from the document
 * @param hasExtractedStdDev - Whether the AI extracted a stdDev value from the document
 */
function applyRiskMetrics(
  fund: Record<string, unknown>,
  hasExtractedSharpe: boolean,
  hasExtractedStdDev: boolean
): void {
  const monthlyReturns = fund.monthlyReturns as Record<string, number> | undefined;
  if (monthlyReturns) {
    const metrics = calculateRiskMetrics(monthlyReturns);
    if (metrics) {
      // Document-extracted values take priority
      if (!hasExtractedSharpe) {
        fund.sharpe = metrics.sharpe;
      }
      if (!hasExtractedStdDev) {
        fund.stdDev = metrics.stdDev;
      }
    }
  }

  // Always recalculate avgAnnualReturn after every apply (not only when missing)
  const returns = (fund.returns || {}) as Record<string, unknown>;
  const yearlyVals: number[] = [];
  for (const [k, v] of Object.entries(returns)) {
    if (/^y\d{4}$/.test(k) && typeof v === "number" && !isNaN(v)) {
      yearlyVals.push(v);
    }
  }
  if (yearlyVals.length >= 2) {
    const avg = yearlyVals.reduce((s, v) => s + v, 0) / yearlyVals.length;
    fund.avgAnnualReturn = Math.round(avg * 10000) / 10000;
  }
}

/** Normalize confidence: ensure number 0-1, default 0.5 if missing/invalid */
function normalizeConfidence(val: unknown): number {
  if (typeof val !== "number" || isNaN(val)) return 0.5;
  return clamp(val, 0, 1);
}

/** Filter and normalize fields from Claude response — whitelist only */
function sanitizeFields(rawFields: unknown[]): ParsedField[] {
  if (!Array.isArray(rawFields)) return [];
  const result: ParsedField[] = [];
  for (const f of rawFields) {
    if (!f || typeof f !== "object") continue;
    const field = f as Record<string, unknown>;
    let key = String(field.key || "");

    // Normalize bare year keys: "y2025" → "returns.y2025", "ytd2026" → "returns.ytd2026"
    if (/^(y\d{4}|ytd\d{4})$/.test(key)) {
      key = `returns.${key}`;
    }

    // Whitelist check
    if (!isAllowedKey(key)) continue;

    // Normalize value
    let value: string | number | null = null;
    if (field.value === null || field.value === undefined) {
      value = null;
    } else if (key === "manager" || key === "classification") {
      // String fields
      value = String(field.value);
    } else {
      // Numeric fields (returns, monthlyReturn)
      const num = Number(field.value);
      value = isNaN(num) ? null : num;
    }

    result.push({
      key,
      value,
      confidence: normalizeConfidence(field.confidence),
    });
  }
  // Dedup: for duplicate keys, prefer non-null numeric values over null
  const deduped = new Map<string, ParsedField>();
  for (const f of result) {
    const existing = deduped.get(f.key);
    if (!existing || (existing.value === null && f.value !== null)) {
      deduped.set(f.key, f);
    }
  }
  return Array.from(deduped.values());
}

/** Validate a draft before saving */
function validateDraft(draft: Partial<ParseDraft>): string | null {
  if (!draft.extracted?.fundName && !draft.match?.fundId) {
    return "Draft must include a fund name or a matched fund";
  }
  if (!draft.extracted?.fields || draft.extracted.fields.length === 0) {
    return "Draft must include at least 1 valid field";
  }
  return null; // valid
}

/** Call Claude API with 1 retry on failure */
async function callClaude(apiKey: string, systemPrompt: string, userText: string): Promise<{ success: true; content: string; usage: ApiUsage } | { success: false; error: string }> {
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 4096,
          temperature: 0,
          system: systemPrompt,
          messages: [{ role: "user", content: userText }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text().catch(() => "Unknown error");
        console.error(`Claude API error (attempt ${attempt}):`, errText);
        if (attempt < maxAttempts) continue;
        return { success: false, error: `AI service error (${response.status})` };
      }

      const result = await response.json();
      const content = result.content?.[0]?.text || "";
      const usage: ApiUsage = result.usage || { input_tokens: 0, output_tokens: 0 };
      if (!content) {
        if (attempt < maxAttempts) continue;
        return { success: false, error: "Empty response from AI" };
      }

      return { success: true, content, usage };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`Claude API call failed (attempt ${attempt}):`, message);
      if (attempt < maxAttempts) continue;
      if (message.includes("abort")) {
        return { success: false, error: "AI service timeout (30s)" };
      }
      return { success: false, error: "Failed to connect to AI service" };
    }
  }
  return { success: false, error: "AI service unavailable" };
}

/** Call Claude Vision API for image/PDF parsing with 1 retry */
async function callClaudeVision(
  apiKey: string,
  systemPrompt: string,
  base64Data: string,
  mediaType: string,
  userMessage?: string
): Promise<{ success: true; content: string; usage: ApiUsage } | { success: false; error: string }> {
  const maxAttempts = 2;

  // PDFs use "document" content block, images use "image"
  const isPdf = mediaType === "application/pdf";
  const contentBlockType = isPdf ? "document" : "image";

  console.log(`[parse-file] type=${contentBlockType}, media_type=${mediaType}, base64_length=${base64Data.length}`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000); // 45s for files

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 8192,
          temperature: 0,
          system: systemPrompt,
          messages: [{
            role: "user",
            content: [
              {
                type: contentBlockType,
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64Data,
                },
              },
              {
                type: "text",
                text: userMessage || "Extract fund performance data from this document. Return valid JSON only.",
              },
            ],
          }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text().catch(() => "Unknown error");
        console.error(`Claude Vision API error (attempt ${attempt}):`, errText);
        if (attempt < maxAttempts) continue;
        return { success: false, error: `AI service error (${response.status})` };
      }

      const result = await response.json();
      const content = result.content?.[0]?.text || "";
      const usage: ApiUsage = result.usage || { input_tokens: 0, output_tokens: 0 };
      if (!content) {
        if (attempt < maxAttempts) continue;
        return { success: false, error: "Empty response from AI" };
      }

      return { success: true, content, usage };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error(`Claude Vision call failed (attempt ${attempt}):`, message);
      if (attempt < maxAttempts) continue;
      if (message.includes("abort")) {
        return { success: false, error: "AI service timeout (45s)" };
      }
      return { success: false, error: "Failed to connect to AI service" };
    }
  }
  return { success: false, error: "AI service unavailable" };
}

/** Supported file MIME types for parse-file */
const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "application/pdf",
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/webp": "image/webp",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/** Build the extraction system prompt (shared between text and file parsing) */
function buildSystemPrompt(existingFunds: { id: string; name: string; returnBasis?: string }[]): string {
  return `You are a financial data extraction assistant for an Israeli fund tracking system.
Extract fund performance data from the provided Hebrew or English text or document.

ALWAYS extract fundName from the document title, header, or logo text.
ALWAYS extract reportMonth from the document date (title, header, footer).
These fields are mandatory — search the entire document if needed.

RULES:
- Extract ONLY factual data explicitly stated in the text/document
- Do NOT infer, calculate, or estimate any values
- All return values should be decimal numbers (e.g., 5.2% → 0.052)
- Fund name must be extracted in its original language
- If a field is not clearly present, omit it

CRITICAL — PERFORMANCE TABLE PARSING (header-driven, NOT position-driven):
When the document contains a performance/returns table, you MUST follow this process:

STEP 1 — DETECT HEADERS: Find the header row of the table. Read every column header label.
STEP 2 — MAP COLUMNS BY HEADER TEXT: Build a column→meaning mapping using these rules:
  ANNUAL RETURN COLUMNS (extract as returns.yYYYY):
  - "שנתי" or "שנתית" or "Annual" → annual return
  - "YTD" or "מצטבר" or "מתחילת השנה" or "מה״ש" or "תשואה מתחילת" → THIS IS ALSO the annual return. Extract as returns.yYYYY.
  IGNORE COMPLETELY:
  - "ITD" or "מהקמה" or "מאז הקמה" or "Inception" or "Since Inception" → cumulative since fund creation. NEVER extract. NEVER use as annual return.
  MONTH COLUMNS:
  - "ינו" or "ינואר" or "Jan" → month 01
  - "פבר" or "פברואר" or "Feb" → month 02
  - "מרץ" or "Mar" → month 03
  - "אפר" or "אפריל" or "Apr" → month 04
  - "מאי" or "May" → month 05
  - "יוני" or "Jun" → month 06
  - "יולי" or "Jul" → month 07
  - "אוג" or "אוגוסט" or "Aug" → month 08
  - "ספט" or "ספטמבר" or "Sep" → month 09
  - "אוק" or "אוקטובר" or "Oct" → month 10
  - "נוב" or "נובמבר" or "Nov" → month 11
  - "דצמ" or "דצמבר" or "Dec" → month 12
  OTHER:
  - A 4-digit year like "2020", "2025" → row year identifier column
STEP 3 — READ ROWS BY MAPPING: For each data row:
  - Identify the row's year from the year-identifier column
  - Read the annual return from the column mapped to "שנתי"/"Annual" OR "YTD"/"מצטבר"/"מתחילת השנה" — these are the same thing. Extract as returns.yYYYY.
  - Read monthly returns from columns mapped to month headers
  - IGNORE columns labeled "ITD", "מהקמה", "מאז הקמה", "Inception" — NEVER extract these values
STEP 4 — VALIDATE:
  - The annual value must come from "שנתי", "YTD", or "מצטבר" columns.
  - NEVER use ITD as annual return. ITD is cumulative since inception and is always wrong for annual.
  - Any column labeled "ITD" / "מהקמה" / "מאז הקמה" / "Since Inception" / "Inception" → ignore completely, never extract
  - Any column labeled "YTD" / "מצטבר" / "מתחילת השנה" / "מה״ש" / "שנתי" / "Annual" → this is the annual return, extract as returns.yYYYY
  - NEVER identify columns by their position. ONLY by their header text.
  - NEVER confuse a January value with an annual value or vice versa.
  - SANITY CHECK: For a completed year, the annual return should roughly equal the compound of all 12 monthly returns. If annual=4.61% but the sum of monthly returns ≈ 23%, you have likely swapped annual↔January. Fix it.
  - SANITY CHECK: Monthly returns are typically between -10% and +10%. Annual returns can be much larger (20%+). If a "monthly" value is 20%+ and the "annual" value is 2-5%, the columns are likely swapped.

HEBREW RTL TABLE WARNING:
Many Israeli fund documents use RTL (right-to-left) layout. Column order varies — do NOT assume any fixed position.
A typical Hebrew performance table may have columns in any order. The header label above each column is the ONLY reliable way to determine what it contains.
DO NOT assume any fixed column order. READ THE ACTUAL HEADER TEXT of each column.
The header text is the ONLY reliable way to determine what each column contains.

FIELDS TO EXTRACT (only these):
- fundName: string | null — the fund's name as written in the document. If not explicitly written in the document, return null — do not guess or invent.
- monthlyReturn: number | null (the MOST RECENT monthly return in the table — this is the last non-empty month value chronologically, matching the reportMonth)
- allMonthlyReturns: object | null — extract ALL individual monthly returns found in the document.
  Keys must be "YYYY-MM" format (e.g., "2025-01", "2025-06", "2025-12").
  Values are decimal numbers (e.g., 3.5% → 0.035).
  CRITICAL: Extract EVERY month from EVERY year that appears in the performance table.
  If the table shows data for 2022, 2023, 2024, 2025, 2026 — extract all months from all years.
  Do NOT limit to the last 12 months. Do NOT skip older years. Extract the COMPLETE monthly history.
  A table with 5 years of monthly data should produce ~60 monthly entries.
  Empty cells (—, -, blank) should be skipped, not set to 0.
CRITICAL — NO HALLUCINATION:
Extract ONLY months that explicitly appear in the document with actual values.
The current date is ${new Date().toISOString().split('T')[0]}.
Never extract or infer values for future months.
If a cell is empty, blank, or the month has not yet occurred — set to null, never invent a value.
- reportMonth: string | null — the month this report covers.
  Priority 1: Look for an explicit date in the document HEADER, TITLE, FOOTER, or any date stamp.
  Examples: "מרץ 2026" → "2026-03", "March 2026" → "2026-03", "03/2026" → "2026-03", "Feb 2026" → "2026-02"
  Priority 2: If no explicit date, use the LATEST month that has actual data in the MOST RECENT year row.
  For example, if 2026 has data only in Jan, Feb, Mar — reportMonth = "2026-03" (March, the latest).
  DO NOT use "last month across most rows" — historical rows always have December, that would be wrong.
  If the month cannot be clearly determined, set reportMonth to null.
  NEVER guess or default to the current month.
- reportMonthConfidence: "high" | "low" (how certain you are about the report month)
- returnBasis: "ILS" | "USD" | null (the currency basis of the returns)
  Detect from document context: ₪, שקלי, שקלית, ILS → "ILS"; $, דולרי, דולרית, USD → "USD"
  If both currencies appear, set returnBasis to the PRIMARY one used for the main return figures.
  If unclear, set to null.
- returnBasisOptions: ["ILS"] or ["USD"] or ["ILS","USD"] (all currency bases found in the document)
- manager: string | null (fund manager name)
- classification: string | null (fund type/classification)
- sharpe: number | null (Sharpe ratio, if explicitly stated in the document)
- stdDev: number | null (standard deviation, סטיית תקן, if explicitly stated in the document)
- returns: object with dynamic year keys like "yYYYY" (e.g. "y2025", "y2024", "y2023", "y2022", "y2021", "y2020", "y2019").
  Extract ALL annual returns that appear in the document, for ANY year. Do not limit to a fixed set.
  IMPORTANT: YTD / מצטבר / מתחילת השנה IS the annual return — extract it as returns.yYYYY (not as ytd).
- ytdYYYY: number | null — ONLY use this if you need to distinguish a partial-year return from a full-year return. In most cases, use returns.yYYYY instead.

EXISTING FUNDS IN SYSTEM (for matching):
${existingFunds.map((f) => `- "${f.name}" (id: ${f.id}, currency: ${f.returnBasis || "unknown"})`).join("\n")}
When suggesting a match, consider the currency basis: if the document is ILS-based, prefer matching an ILS fund. If USD-based, prefer a USD fund. Never match a שקלי document to a USD fund or vice versa.

DUAL CURRENCY DOCUMENTS:
If the document contains return data for BOTH ILS and USD (e.g., two separate performance tables),
you MUST return a "dualCurrencyData" array with separate field sets for each currency.

CRITICAL — NEVER merge two currency tables into one allMonthlyReturns object.
If you find TWO performance tables (one $ and one ₪):
- You MUST use dualCurrencyData array with two separate entries
- Each entry has its own allMonthlyReturns
- The top-level allMonthlyReturns should be null
- Merging two tables into one object causes data corruption

MANDATORY 3-STEP PROCESS for dual currency:
STEP 1 — IDENTIFY LABELS: Before extracting any numbers, first locate EACH performance table and read the currency label next to it (e.g., "קלאס דולרי", "קלאס שקלי", "מסלול שקלי", "מסלול דולרי"). Write down which table has which label.
STEP 2 — EXTRACT NUMBERS: For each table, extract all performance numbers (monthly returns, YTD, annual).
STEP 3 — ASSIGN CORRECTLY: Put each table's numbers into the dualCurrencyData entry matching its label from step 1. A table labeled "קלאס דולרי" → returnBasis: "USD". A table labeled "קלאס שקלי" → returnBasis: "ILS".

CURRENCY SYMBOL DETECTION — MANDATORY PROCESS:
Before extracting ANY numbers, you must complete these steps:

STEP 1: Scan the ENTIRE document for performance tables.
STEP 2: For each table, find its currency label. Look for:
  - ($) or $ or "דולר" or "דולרי" or "USD" → this table is USD
  - (₪) or ₪ or "שקל" or "שקלי" or "ILS" → this table is ILS
  The label may appear: in the table header, above the table, to the right of the table, or as a superscript symbol.
STEP 3: Write down internally: "Table 1 = [USD/ILS], Table 2 = [USD/ILS]"
STEP 4: Extract each table's numbers SEPARATELY into its own dualCurrencyData entry.
STEP 5: Verify — the two entries must have DIFFERENT returnBasis values. If both say USD or both say ILS, you made an error — go back to STEP 2.

CRITICAL: A document with ($) on the top table and (₪) on the bottom table means:
- dualCurrencyData[0].returnBasis = "USD" — values from TOP table only
- dualCurrencyData[1].returnBasis = "ILS" — values from BOTTOM table only
NEVER copy values between entries. NEVER mix rows from different tables.

COMMON ERROR TO AVOID: Many Israeli fund documents show the USD ($) table FIRST (on top) and the ILS (₪) table SECOND (below). Do NOT assume the first table is ILS. Read the currency symbol/label next to EACH table. If the top table has ($) and the bottom has (₪), then top=USD and bottom=ILS. Getting this backwards is the #1 parsing error.

Each entry must include ALL currency-dependent fields (monthlyReturn, returns.y*, sharpe, stdDev, allMonthlyReturns) with values specific to THAT currency only. Do NOT copy values between entries.
The top-level fields/returnBasis/allMonthlyReturns should use the FIRST currency that appears in the document (read from top). The dualCurrencyData array order does not matter — what matters is that each entry's returnBasis matches its actual label.

Respond in valid JSON with this exact structure:
{
  "fundName": "...",
  "fundNameConfidence": 0.0-1.0,
  "reportMonth": "YYYY-MM" or null,
  "reportMonthConfidence": "high" or "low",
  "returnBasis": "ILS" or "USD" or null,
  "returnBasisOptions": ["ILS"] or ["USD"] or ["ILS","USD"],
  "allMonthlyReturns": { "2025-01": 0.032, "2025-02": -0.01, ... } or null,
  "fields": [
    { "key": "monthlyReturn", "value": ..., "confidence": 0.0-1.0 },
    { "key": "sharpe", "value": ..., "confidence": 0.0-1.0 },
    { "key": "stdDev", "value": ..., "confidence": 0.0-1.0 },
    { "key": "returns.y2025", "value": ..., "confidence": 0.0-1.0 },
    { "key": "returns.y2024", "value": ..., "confidence": 0.0-1.0 },
    { "key": "returns.y2026", "value": ..., "confidence": 0.0-1.0 },
    ...
  ],
  "suggestedMatch": {
    "fundId": "..." or null,
    "fundName": "..." or null,
    "similarity": 0.0-1.0
  },
  "dualCurrencyData": [
    {
      "returnBasis": "USD",
      "allMonthlyReturns": { "2025-01": 0.001, "2025-02": 0.0047, ... },
      "fields": [
        { "key": "monthlyReturn", "value": 0.0074, "confidence": 0.95 },
        { "key": "returns.y2025", "value": 0.1991, "confidence": 0.95 },
        ...
      ]
    },
    {
      "returnBasis": "ILS",
      "allMonthlyReturns": { "2025-01": -0.0001, "2025-02": 0.0042, ... },
      "fields": [
        { "key": "monthlyReturn", "value": 0.0062, "confidence": 0.95 },
        { "key": "returns.y2025", "value": 0.1863, "confidence": 0.95 },
        ...
      ]
    }
  ]
}`;
}

/** Build a dynamic structured prompt for any fund document.
 *  Uses a fixed year range (2019-2026) and all X cells — no pre-filling
 *  from existing data. The AI reads everything fresh from the table. */
function buildDynamicStructuredPrompt(options: {
  currencies: ("dollar" | "shekel")[];
  reportMonth: string | null;
}): string {
  const { currencies, reportMonth } = options;
  // Fixed year range — covers all possible years in fund reports
  const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
  // Month names in canonical order (jan→dec) — AI maps by column name, not position
  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const monthNums =  [1,     2,     3,     4,     5,     6,     7,     8,     9,     10,    11,    12];

  // Use actual current date for future-month detection (not reportMonth, which may be wrong).
  // This is more conservative: marks a month as null only if it's truly in the future.
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth() + 1; // 1-based

  const isDual = currencies.length > 1;

  // Build template for one currency — all cells are X (AI fills everything)
  const buildCurrencyTemplate = (): string => {
    const yearLines: string[] = [];
    for (const year of years) {
      const isCurrentYear = year === currentYear;
      const entries: string[] = [];

      // YTD first, then months in canonical jan→dec order — AI maps by column name
      entries.push(`"ytd": X`);

      for (let i = 0; i < 12; i++) {
        const mNum = monthNums[i];
        const mName = monthNames[i];

        if (isCurrentYear && mNum > currentMonthNum) {
          entries.push(`"${mName}": null`);
        } else {
          entries.push(`"${mName}": X`);
        }
      }

      yearLines.push(`    "${year}": {${entries.join(", ")}}`);
    }
    return yearLines.join(",\n");
  };

  let templateJson: string;
  if (isDual) {
    templateJson = `{
  "dollar": {
${buildCurrencyTemplate()}
  },
  "shekel": {
${buildCurrencyTemplate()}
  }
}`;
  } else {
    const label = currencies[0] === "dollar" ? "dollar" : "shekel";
    templateJson = `{
  "${label}": {
${buildCurrencyTemplate()}
  }
}`;
  }

  // Build instructions
  const dualInstructions = isDual
    ? `- Top table = Dollar ($), Bottom table = Shekel (₪) — never mix values between them`
    : "";

  return `You are a precise data extraction engine. Extract performance data from this Hebrew investment fund table.

LAYOUT DETECTION — do this first before extracting any values:
1. Look at the column headers in the table.
2. If ינואר appears on the RIGHT side → table is RTL, read right to left.
3. If ינואר appears on the LEFT side → table is LTR, read left to right.
4. Always match values to column names by the Hebrew header above them — never by position.

COLUMN NAMES (Hebrew → English):
ינו׳ / ינואר = jan
פבר׳ / פברואר = feb
מרץ = mar
אפר׳ / אפריל = apr
מאי = may
יוני = jun
יולי = jul
אוג׳ / אוגוסט = aug
ספט׳ / ספטמבר = sep
אוק׳ / אוקטובר = oct
נוב׳ / נובמבר = nov
דצמ׳ / דצמבר = dec
YTD = ytd
ITD → ignore completely

CRITICAL RULE: Always fill by column name, never by position in the row.

IMPORTANT:
- ITD is the leftmost column — ignore it completely, never use its values
- YTD is second from left — this is the annual return, always extract it
${dualInstructions}
- A dash (-) or empty cell = null
- אוג׳=august, ספט׳=september, אוק׳=october, דצמ׳=december, אפר׳=april

READING ACCURACY:
- Read every digit carefully. 5.35 and 3.35 are different numbers.
- Negative sign (-) must be preserved exactly as shown.
- Do not round or approximate any value.

INSTRUCTIONS:
- Fill in every cell marked X by reading the value from the table.
- If a year row does not exist in the table, set ALL its cells to null (including ytd).
- Cells already set to null stay null — do not change them.
- If a cell in the table shows a dash (-) or is empty, set it to null.

Return only valid JSON, no explanation:

${templateJson}

Numbers as floats without % sign. Example: 1.92% → 1.92`;
}

/* ================================================================== */
/*  Two-Pass Raw Extraction — helpers                                  */
/* ================================================================== */

const MONTH_ALIASES: Record<string, number> = {
  'ינואר': 1, 'ינו': 1, "ינו'": 1, 'ינו׳': 1,
  'פברואר': 2, 'פבר': 2, "פבר'": 2, 'פבר׳': 2,
  'מרץ': 3, 'מרס': 3,
  'אפריל': 4, 'אפר': 4, "אפר'": 4, 'אפר׳': 4,
  'מאי': 5,
  'יוני': 6, 'יונ': 6,
  'יולי': 7, 'יול': 7,
  'אוגוסט': 8, 'אוג': 8, "אוג'": 8, 'אוג׳': 8,
  'ספטמבר': 9, 'ספט': 9, "ספט'": 9, 'ספט׳': 9,
  'אוקטובר': 10, 'אוק': 10, "אוק'": 10, 'אוק׳': 10,
  'נובמבר': 11, 'נוב': 11, "נוב'": 11, 'נוב׳': 11,
  'דצמבר': 12, 'דצמ': 12, "דצמ'": 12, 'דצמ׳': 12,
  'january': 1, 'jan': 1,
  'february': 2, 'feb': 2,
  'march': 3, 'mar': 3,
  'april': 4, 'apr': 4,
  'may': 5,
  'june': 6, 'jun': 6,
  'july': 7, 'jul': 7,
  'august': 8, 'aug': 8,
  'september': 9, 'sep': 9,
  'october': 10, 'oct': 10,
  'november': 11, 'nov': 11,
  'december': 12, 'dec': 12,
  '1': 1, '2': 2, '3': 3, '4': 4,
  '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9,
  '01': 1, '02': 2, '03': 3, '04': 4,
  '05': 5, '06': 6, '07': 7, '08': 8,
  '09': 9, '10': 10, '11': 11, '12': 12,
};

const YTD_ALIASES = ['ytd','שנתי','שנתית','מצטבר','מתחילת השנה','מה״ש','annual','סה"כ שנתי','סהכ שנתי','סה"כ','total annual'];
// Note: 'dec','december','דצמבר',"דצמ'" removed — December is a month, not YTD
const ITD_ALIASES = ['itd','מהקמה','מאז הקמה','since inception','inception','מהקמה:'];
const USD_ALIASES = ['$','($)','דולר','דולרי','דולרית','usd','dollar'];
const ILS_ALIASES = ['₪','(₪)','שקל','שקלי','שקלית','ils'];

interface RawTable {
  currency_label: string | null;
  table_label: string | null;
  headers: string[];
  rows: { year: string; cells: (string | null)[] }[];
}

interface MappedEntry {
  returnBasis: 'ILS' | 'USD' | null;
  fields: ParsedField[];
  allMonthlyReturns: Record<string, number>;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[״׳'"]/g, '').replace(/\s+/g, ' ');
}

function detectCurrency(label: string | null): 'ILS' | 'USD' | null {
  if (!label) return null;
  const l = label.toLowerCase();
  if (USD_ALIASES.some(a => l.includes(a.toLowerCase()))) return 'USD';
  if (ILS_ALIASES.some(a => l.includes(a.toLowerCase()))) return 'ILS';
  return null;
}

const BENCHMARK_LABEL_KEYWORDS = ['מדד', 'benchmark', 'index', 'כללי'];

function isBenchmarkTable(table: RawTable): boolean {
  const label = (table.table_label ?? '').toLowerCase();
  return BENCHMARK_LABEL_KEYWORDS.some(kw => label.includes(kw.toLowerCase()));
}

function mapRawTablesToFields(tables: RawTable[]): MappedEntry[] {
  return tables.filter(table => !isBenchmarkTable(table)).map(table => {
    const currency = detectCurrency(table.currency_label);
    const allMonthlyReturns: Record<string, number> = {};
    const fields: ParsedField[] = [];

    console.log('RAW HEADERS:', JSON.stringify(table.headers));
    const headerMap: ('ytd' | 'itd' | number | 'year' | null)[] = table.headers.map(h => {
      const norm = normalizeHeader(h);
      if (YTD_ALIASES.some(a => norm === a.toLowerCase())) return 'ytd';
      if (ITD_ALIASES.some(a => norm === a.toLowerCase())) return 'itd';
      if (/^\d{4}$/.test(norm)) return 'year';
      const monthNum = MONTH_ALIASES[norm] ?? MONTH_ALIASES[h.trim()] ?? MONTH_ALIASES[h.trim().toLowerCase()];
      if (monthNum) return monthNum;
      return null;
    });

    for (const row of table.rows) {
      const year = row.year?.trim();
      if (!year || !/^\d{4}$/.test(year)) continue;

      let ytdValue: number | null = null;
      let hasDecember = false;

      row.cells.forEach((cell, idx) => {
        if (cell === null || cell === undefined) return;
        const meaning = headerMap[idx];
        if (meaning === null || meaning === undefined || meaning === 'itd' || meaning === 'year') return;

        const raw = String(cell).replace('%', '').trim();
        const num = parseFloat(raw);
        if (isNaN(num)) return;
        const decimal = Math.round((num / 100) * 1e8) / 1e8;

        if (meaning === 'ytd') {
          ytdValue = decimal;
        } else if (typeof meaning === 'number') {
          const monthStr = String(meaning).padStart(2, '0');
          const key = `${year}-${monthStr}`;
          allMonthlyReturns[key] = decimal;
          fields.push({ key: `monthlyReturns.${key}`, value: decimal, confidence: 0.95 });
          if (meaning === 12) hasDecember = true;
        }
      });

      if (ytdValue !== null) {
        const returnKey = hasDecember ? `returns.y${year}` : `returns.ytd${year}`;
        fields.push({ key: returnKey, value: ytdValue, confidence: 0.95 });
      }
    }

    const latestMonth = Object.keys(allMonthlyReturns).sort().pop() ?? null;
    if (latestMonth) {
      fields.push({ key: 'monthlyReturn', value: allMonthlyReturns[latestMonth], confidence: 0.95 });
    }

    return { returnBasis: currency, fields, allMonthlyReturns };
  }).filter(entry => entry.fields.length > 0);
}

// disabled — causes false positives on full years
function fixDecemberYtdSwap(fields: ParsedField[], year: string): ParsedField[] {
  const decKey = `monthlyReturns.${year}-12`;
  const annualKey = `returns.y${year}`;
  const ytdKey = `returns.ytd${year}`;

  const hasDec = fields.some(f => f.key === decKey);
  const hasAnnual = fields.some(f => f.key === annualKey || f.key === ytdKey);

  if (!hasDec || hasAnnual) return fields;

  // בדוק שזו שנה חלקית — ינואר לא קיים
  const hasJan = fields.some(f => f.key === `monthlyReturns.${year}-01`);
  if (hasJan) return fields;

  // חשב compound של כל החודשים חוץ מדצמבר
  const nonDecMonths = fields
    .filter(f => f.key.startsWith(`monthlyReturns.${year}-`) && f.key !== decKey)
    .map(f => f.value as number);

  if (nonDecMonths.length === 0 || nonDecMonths.length >= 6) return fields;

  const compound = nonDecMonths.reduce((acc, m) => acc * (1 + m), 1) - 1;
  const decVal = fields.find(f => f.key === decKey)!.value as number;

  // אם הפער קטן מ-0.5% — זה YTD שנפל לדצמבר
  if (Math.abs(compound - decVal) > 0.005) return fields;

  console.log(`[parse] ${year}: dec_ytd_swap detected — moving 2019-12 (${(decVal*100).toFixed(2)}%) → ${ytdKey}`);

  // תיקון: העבר דצמבר ל-ytd
  const corrected = fields.filter(f => f.key !== decKey);
  corrected.push({ key: ytdKey, value: decVal, confidence: 0.95 });
  corrected.push({ key: 'corrections', value: `${year}:dec_ytd_swap`, confidence: 1 });

  return corrected;
}

function buildRawExtractionPrompt(): string {
  return `You are a table reader. Your only job is to describe what you see in the document.

Find ALL performance tables in this document.

For each table return:
{
  "currency_label": "the exact currency text near this table — e.g. ($), (₪), דולרי, שקלי, $ or null",
  "table_label": "the name/label of the fund this table belongs to, or null",
  "headers": ["every column header exactly as written, from RIGHT to LEFT"],
  "rows": [
    {
      "year": "the 4-digit year for this row",
      "cells": ["cell values from RIGHT to LEFT, matching headers order"]
    }
  ]
}

Return JSON: { "tables": [...] }

STEP 1 — IDENTIFY THE YEAR COLUMN:
Before reading headers, scan ALL columns and find the one where every non-empty cell contains a 4-digit number between 1990 and 2040. That is the year column.
- This column may be labeled "**", "*", empty, "שנה", "year", or anything else.
- Use its values as the "year" field for each row.
- Do NOT include this column in headers[] or cells[].
- If no such column exists, infer year from row context.

STEP 2 — DETERMINE TABLE DIRECTION:
- If the year column is on the RIGHT side → table is RTL. Read headers and cells right to left.
- If the year column is on the LEFT side → table is LTR. Read headers and cells left to right.
- Apply this direction consistently for ALL rows in this table.

STEP 3 — READ HEADERS:
- Copy every column header exactly as written (excluding year column).
- Preserve Hebrew, English, symbols exactly.
- Common header types: month names (ינו׳/jan), שנתי/annual/yearly, ITD/מהקמה, **.

STEP 4 — READ CELLS:
CRITICAL — partial rows (ANY year, including historical years when fund started mid-year):
- A partial row has values only in some month columns.
- Each cell position MUST match its header position EXACTLY.
- Missing months → null. NEVER shift values to fill gaps.
- Example: if headers are [שנתי, דצמ, נוב, אוק, ספט, אוג, יול, יון, מאי, אפר, מרץ, פבר, ינו]
  and only ינו/פבר/מרץ have values:
  cells = [ytd_value, null, null, null, null, null, null, null, null, null, mar, feb, jan]
  NEVER: cells = [ytd_value, mar, feb, jan, null, null, ...]
- This applies to ALL years, not just the current year.
  Example: a fund starting in February 2017 will have January 2017 = null.
  Do NOT shift February's value into January's position.
- Example of fund starting mid-year (partial from the START):
  if headers are [YTD, דצמ, נוב, אוק, ספט, אוג, יול, יוני, מאי, אפר, מרץ, פבר, ינו]
  and fund started in February (January is empty):
  cells = [ytd_value, dec, nov, oct, sep, aug, jul, jun, may, apr, mar, feb, null]
  NEVER: cells = [ytd_value, dec, nov, oct, sep, aug, jul, jun, may, apr, mar, feb_shifted_to_jan]
  The empty January cell must remain null — do not shift February into January's position.

WHAT TO DO — three-dimensional cross-reference:
For every cell in the table:
1. Identify the COLUMN header → this gives you the MONTH
2. Identify the ROW year value → this gives you the YEAR
3. Read the cell value → this gives you the RETURN
4. Only if the cell is non-empty → record as monthlyReturns.YYYY-MM = value
5. If the cell is empty → record null for that YYYY-MM position

This means every value is anchored to an exact year + month coordinate.
Never move a value from its coordinate. Never infer a coordinate from neighbors.

WHAT NOT TO DO:
- Do NOT shift values left or right to fill empty positions
- Do NOT assume a value belongs to a different month than its column header
- Do NOT assume a value belongs to a different year than its row

EXAMPLES of correct three-dimensional reading:
Row=2017, Col=January → empty → monthlyReturns.2017-01 = null
Row=2017, Col=February → 1.49% → monthlyReturns.2017-02 = 1.49%
Row=2017, Col=March → 0.69% → monthlyReturns.2017-03 = 0.69%

Row=2026, Col=January → 0.66% → monthlyReturns.2026-01 = 0.66%
Row=2026, Col=February → 0.60% → monthlyReturns.2026-02 = 0.60%
Row=2026, Col=March → empty → monthlyReturns.2026-03 = null

WRONG (never do this):
Row=2017, Col=January → 1.49% ← shifted from February
Row=2026, Col=January → 0.60% ← shifted from February

STEP 5 — IDENTIFY COLUMN TYPES:
- Month columns: named after months (ינו׳, פבר׳, jan, feb, etc.) → monthly return values
- Annual column: named שנתי, סה"כ, annual, yearly, total → yearly return (NOT a month)
- ITD column: named ITD, מהקמה, מצטבר → IGNORE completely. Do not extract, do not map to any field. Skip entirely.
- Benchmark rows: rows labeled מדד, ת"א 125, אג"ח, benchmark, index → IGNORE entirely

STEP 6 — NEGATIVE NUMBERS:
- "-5.3%" → "-5.3"
- "(5.3%)" → "-5.3" (parentheses = negative)
- Empty cell or dash → null

STEP 7 — COLUMN INDEX ROWS:
Some tables have a numeric row above the headers (e.g. "1 2 3 4 5 6 7 8 9 10 11 12").
This is a column index row, NOT a data row and NOT a header row.
IGNORE it completely. Read headers from the actual text row (Jan, Feb, Mar... or ינו׳, פבר׳...).

RULES:
- Extract ONLY the fund's own rows. IGNORE benchmark/index rows completely.
- Copy values EXACTLY. No translation. No interpretation.
- Numbers without % sign: write as-is (e.g. "3.28" not "3.28%")
- Return ONLY valid JSON. No explanation.

EXAMPLE — RTL table with ** year column:
Headers row visible: | ** | ינו׳ | פבר׳ | מרץ | ... | דצמ׳ | שנתי |
Year column = ** (rightmost, contains 2019/2020/2021...)
Direction = RTL
headers: ["ינו׳", "פבר׳", "מרץ", ..., "דצמ׳", "שנתי"]
Row 2021 (full): cells: ["11.48", "-5.42", "4.19", ..., "0.98", "28.88"]
Row 2026 (partial, only jan/feb/mar): cells: ["2.03", "2.30", "4.91", null, null, null, null, null, null, null, null, null, "9.51"]`;
}

interface MonthlyValidation {
  year: string;
  reportedAnnual: number | null;
  computedAnnual: number | null;
  gap: number | null;
  months: (number | null)[];
  status: 'valid' | 'warning' | 'error' | 'no-annual';
}

interface ValidationSummary {
  overallStatus: 'valid' | 'warning' | 'error';
  rows: MonthlyValidation[];
  suspiciousMonths?: string[]; // months later than reportMonth — excluded from count
}

function validateParsedEntry(entry: MappedEntry, reportMonth: string | null): ValidationSummary {
  const rows: MonthlyValidation[] = [];
  const suspiciousMonths: string[] = [];

  // Compute effective report month = max(detected reportMonth, latest month actually in the data).
  // This prevents valid months from being excluded when Pass-1 reportMonth detection is off
  // (e.g., AI returns "2026-01" for a March 2026 report — Feb/Mar would be wrongly excluded).
  let effectiveReportMonth = reportMonth;
  for (const field of entry.fields) {
    const m = field.key.match(/^monthlyReturns\.(\d{4}-(0[1-9]|1[0-2]))$/);
    if (m && typeof field.value === 'number') {
      if (!effectiveReportMonth || m[1] > effectiveReportMonth) {
        effectiveReportMonth = m[1];
      }
    }
  }

  // קבץ חודשים לפי שנה
  const byYear: Record<string, (number | null)[]> = {};
  const annualByYear: Record<string, number> = {};

  for (const field of entry.fields) {
    // Count ONLY monthlyReturns.YYYY-MM (valid months 01-12) — never returns.ytdYYYY or returns.yYYYY
    const monthMatch = field.key.match(/^monthlyReturns\.(\d{4})-(0[1-9]|1[0-2])$/);
    if (monthMatch) {
      const monthKey = `${monthMatch[1]}-${monthMatch[2]}`; // YYYY-MM
      // Skip months later than effective report month — suspicious (likely hallucinated future months)
      if (effectiveReportMonth && monthKey > effectiveReportMonth) {
        suspiciousMonths.push(monthKey);
        continue;
      }
      const year = monthMatch[1];
      const month = parseInt(monthMatch[2]) - 1; // 0-based index (0=Jan, 11=Dec)
      if (!byYear[year]) byYear[year] = Array(12).fill(null);
      byYear[year][month] = field.value as number;
    }

    const annualMatch = field.key.match(/^returns\.(ytd|y)(\d{4})$/);
    if (annualMatch) {
      annualByYear[annualMatch[2]] = field.value as number;
    }
  }

  // בדוק כל שנה
  for (const year of Object.keys(byYear).sort()) {
    const months = byYear[year];
    const reportedAnnual = annualByYear[year] ?? null;

    // חשב שנתי גיאומטרי מהחודשים הקיימים
    const nonNullMonths = months.filter((m): m is number => m !== null);
    let computedAnnual: number | null = null;

    if (nonNullMonths.length > 0) {
      computedAnnual = nonNullMonths.reduce((acc, m) => acc * (1 + m), 1) - 1;
      computedAnnual = Math.round(computedAnnual * 1e6) / 1e6;
    }

    // חשב פער
    let gap: number | null = null;
    let status: MonthlyValidation['status'] = 'no-annual';

    if (reportedAnnual !== null && computedAnnual !== null) {
      gap = Math.abs(computedAnnual - reportedAnnual);
      if (gap < 0.005) status = 'valid';        // פחות מ-0.5%
      else if (gap < 0.02) status = 'warning';  // 0.5%-2%
      else status = 'error';                     // מעל 2%
    }

    rows.push({ year, reportedAnnual, computedAnnual, gap, months, status });
  }

  const overallStatus = rows.some(r => r.status === 'error') ? 'error'
    : rows.some(r => r.status === 'warning') ? 'warning'
    : 'valid';

  return { overallStatus, rows, ...(suspiciousMonths.length > 0 ? { suspiciousMonths } : {}) };
}

/** Month name → "MM" mapping for structured dual-currency response */
const MONTH_NAME_TO_NUM: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Parse a structured JSON response (single or dual currency) into fields */
function parseStructuredResponse(content: string): {
  entries: DualCurrencyEntry[];
  reportMonth: string | null;
} | { error: string } {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { error: "No JSON found in structured response" };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return { error: "Invalid JSON in structured response" };
  }

  // Detect which currencies are present
  const currencyMap: [string, "USD" | "ILS"][] = [];
  if (parsed.dollar) currencyMap.push(["dollar", "USD"]);
  if (parsed.shekel) currencyMap.push(["shekel", "ILS"]);
  if (currencyMap.length === 0) {
    return { error: "No dollar or shekel data in structured response" };
  }

  const entries: DualCurrencyEntry[] = [];
  let overallLatestMonth: string | null = null;

  for (const [currencyKey, basis] of currencyMap) {
    const currencyData = parsed[currencyKey] as Record<string, Record<string, number | null>>;
    if (!currencyData) continue;
    const fields: ParsedField[] = [];
    let currencyLatestMonth: string | null = null; // per-currency tracking

    for (const [year, months] of Object.entries(currencyData)) {
      if (!/^\d{4}$/.test(year)) continue;

      for (const [monthName, value] of Object.entries(months)) {
        if (value === null || value === undefined) continue;
        const decimalValue = Math.round((value / 100) * 1e8) / 1e8; // 1.92 → 0.0192, avoids floating point artifacts

        if (monthName === "ytd") {
          const hasDec = months.dec !== null && months.dec !== undefined;
          const key = hasDec ? `returns.y${year}` : `returns.ytd${year}`;
          fields.push({ key, value: decimalValue, confidence: 0.95 });
        } else {
          const monthNum = MONTH_NAME_TO_NUM[monthName];
          if (!monthNum) continue;
          const monthKey = `${year}-${monthNum}`;
          fields.push({ key: `monthlyReturns.${monthKey}`, value: decimalValue, confidence: 0.95 });

          if (!currencyLatestMonth || monthKey > currencyLatestMonth) {
            currencyLatestMonth = monthKey;
          }
        }
      }
    }

    // Add monthlyReturn (most recent month FOR THIS CURRENCY)
    if (currencyLatestMonth) {
      const latestField = fields.find((f) => f.key === `monthlyReturns.${currencyLatestMonth}`);
      if (latestField) {
        fields.push({ key: "monthlyReturn", value: latestField.value, confidence: 0.95 });
      }
      // Track overall latest across all currencies for reportMonth
      if (!overallLatestMonth || currencyLatestMonth > overallLatestMonth) {
        overallLatestMonth = currencyLatestMonth;
      }
    }

    entries.push({ returnBasis: basis, fields });
  }

  return { entries, reportMonth: overallLatestMonth };
}

/** Validate reportMonth format YYYY-MM */
function isValidReportMonth(val: unknown): val is string {
  if (typeof val !== "string") return false;
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(val);
}

/** Dual currency data entry from Claude */
interface DualCurrencyEntry {
  returnBasis: "ILS" | "USD";
  fields: ParsedField[];
}

/**
 * Detect and fix annual↔January column swap per year (module-level, callable after Pass-2).
 * Mutates fields in place. Pushes correction flags to the provided corrections array.
 */
function fixAnnualJanSwapPerYear(fields: ParsedField[], corrections: string[], label = ""): void {
  const years: string[] = [];
  for (const f of fields) {
    const m = f.key.match(/^returns\.y(\d{4})$/);
    if (m && typeof f.value === "number") years.push(m[1]);
  }

  for (const year of years) {
    const yField = fields.find((f) => f.key === `returns.y${year}` && typeof f.value === "number");
    const janField = fields.find((f) => f.key === `monthlyReturns.${year}-01` && typeof f.value === "number");
    if (!yField || !janField) continue;

    const yVal = Math.abs(yField.value as number);
    const janVal = Math.abs(janField.value as number);

    const isSwapped = (janVal > yVal * 2 && janVal > 0.08) || (yVal < 0.03 && janVal > 0.10);
    const isDuplicate = Math.abs((yField.value as number) - (janField.value as number)) < 0.0001
      && yVal > 0.08;
    if (!isSwapped && !isDuplicate) continue;

    const rule = isDuplicate && !isSwapped ? "duplicate" : "swap";
    const prefix = label ? `${label}:` : "";

    const monthFields: (ParsedField | undefined)[] = [];
    for (let m = 1; m <= 12; m++) {
      monthFields.push(fields.find((f) => f.key === `monthlyReturns.${year}-${String(m).padStart(2, "0")}` && typeof f.value === "number"));
    }

    const origYearly = yField.value as number;
    const origMonths = monthFields.map((mf) => mf ? mf.value as number : null);

    if (isDuplicate && !isSwapped) {
      const realMonth: (number | null)[] = new Array(12).fill(null);
      realMonth[0] = null;
      realMonth[1] = origMonths[11];
      for (let m = 2; m < 12; m++) {
        realMonth[m] = origMonths[m - 1];
      }
      const janIdx = fields.findIndex((f) => f.key === `monthlyReturns.${year}-01`);
      if (janIdx >= 0) fields.splice(janIdx, 1);
      for (let m = 1; m < 12; m++) {
        if (monthFields[m] && realMonth[m] !== null) {
          monthFields[m]!.value = realMonth[m]!;
        }
      }
    } else {
      yField.value = origMonths[0] !== null ? origMonths[0] : yField.value;
      const realMonth: (number | null)[] = new Array(12).fill(null);
      realMonth[0] = origYearly;
      realMonth[1] = origMonths[11];
      for (let m = 2; m < 12; m++) {
        realMonth[m] = origMonths[m - 1];
      }
      for (let m = 0; m < 12; m++) {
        if (monthFields[m] && realMonth[m] !== null) {
          monthFields[m]!.value = realMonth[m]!;
        }
      }
    }

    corrections.push(`${prefix}${year}:yearly_${rule}`);
    corrections.push(`${prefix}${year}:monthly_uncertain`);
    console.log(`[parse] ${prefix}${year}: ${rule} corrected (yearly fixed, monthly order uncertain)`);
  }
}

function fixMonthShiftError(fields: ParsedField[], year: string): ParsedField[] {
  const monthKeys = Array.from({length: 12}, (_, i) =>
    `monthlyReturns.${year}-${String(i+1).padStart(2,'0')}`);

  const monthValues = monthKeys.map(k =>
    fields.find(f => f.key === k)?.value as number ?? null);

  const ytdKey = `returns.ytd${year}`;
  const yKey = `returns.y${year}`;
  const ytd = (fields.find(f => f.key === ytdKey || f.key === yKey)?.value as number) ?? null;

  if (ytd === null) return fields;

  const nonNull = monthValues.filter((v): v is number => v !== null);
  if (nonNull.length < 6) return fields; // שנה קצרה מדי לבדיקה

  // חשב כפל נוכחי
  const currentCompound = nonNull.reduce((acc, v) => acc * (1 + v), 1) - 1;
  const currentGap = Math.abs(currentCompound - ytd);

  if (currentGap < 0.005) return fields; // כבר תקין

  // נסה להזיז ימינה (הסר ינואר, הוסף null בסוף = דצמבר null)
  const shifted: (number | null)[] = [null, ...monthValues.slice(0, 11)];
  const shiftedNonNull = shifted.filter((v): v is number => v !== null);
  const shiftedCompound = shiftedNonNull.reduce((acc, v) => acc * (1 + v), 1) - 1;
  const shiftedGap = Math.abs(shiftedCompound - ytd);

  // אם ההזזה משפרת משמעותית
  if (shiftedGap < currentGap * 0.5 && shiftedGap < 0.02) {
    const corrected = fields.filter(f => !monthKeys.includes(f.key));
    shifted.forEach((val, i) => {
      if (val !== null) {
        corrected.push({
          key: monthKeys[i],
          value: val,
          confidence: 0.9
        });
      }
    });
    corrected.push({
      key: 'corrections',
      value: `${year}:month_shift_right`,
      confidence: 1
    });
    return corrected;
  }

  return fields;
}

/** Parse Claude response JSON → structured result */
function parseCloudeResponse(
  content: string,
  existingFunds: { id: string; name: string; categoryId: string; returnBasis?: string }[]
): {
  fundName: string;
  fundNameConfidence: number;
  reportMonth: string | null;
  reportMonthConfidence: "high" | "low";
  returnBasis: "ILS" | "USD" | null;
  returnBasisOptions: ("ILS" | "USD")[];
  fields: ParsedField[];
  match: { fundId: string; fundName: string; similarity: number; categoryId: string | null } | null;
  dualCurrencyData?: DualCurrencyEntry[];
  corrections?: string[];
  validation?: ValidationSummary[];
  validationStatus?: 'valid' | 'warning' | 'error';
} | { error: string } {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[parseCloudeResponse] No JSON found in response. Content preview:", content.slice(0, 500));
    return { error: "Could not parse AI response — invalid JSON" };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    // Attempt truncated JSON recovery: close open braces/brackets
    let recovered = jsonMatch[0];
    // Remove trailing partial key/value (everything after last complete value)
    recovered = recovered.replace(/,\s*"[^"]*"?\s*:?\s*[^,}\]]*$/, "");
    // Count unclosed braces and brackets
    let openBraces = 0, openBrackets = 0;
    for (const ch of recovered) {
      if (ch === "{") openBraces++;
      else if (ch === "}") openBraces--;
      else if (ch === "[") openBrackets++;
      else if (ch === "]") openBrackets--;
    }
    recovered += "]".repeat(Math.max(0, openBrackets)) + "}".repeat(Math.max(0, openBraces));
    try {
      parsed = JSON.parse(recovered);
    } catch {
      console.error("[parseCloudeResponse] JSON recovery failed. Content preview:", jsonMatch[0].slice(0, 500));
      return { error: "Could not parse AI response — malformed JSON" };
    }
  }

  // Convert allMonthlyReturns object into individual field entries before sanitization
  const rawFields = [...(Array.isArray(parsed.fields) ? parsed.fields : [])] as unknown[];
  if (parsed.allMonthlyReturns && typeof parsed.allMonthlyReturns === "object") {
    const amr = parsed.allMonthlyReturns as Record<string, unknown>;
    for (const [month, val] of Object.entries(amr)) {
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month) && typeof val === "number") {
        rawFields.push({ key: `monthlyReturns.${month}`, value: val, confidence: 0.95 });
      }
    }
  }
  // Convert top-level returns object into individual field entries (AI may return
  // annual returns as a top-level "returns" object instead of inside "fields" array)
  if (parsed.returns && typeof parsed.returns === "object" && !Array.isArray(parsed.returns)) {
    const ret = parsed.returns as Record<string, unknown>;
    for (const [yearKey, val] of Object.entries(ret)) {
      if (/^(y\d{4}|ytd\d{4})$/.test(yearKey) && typeof val === "number") {
        rawFields.push({ key: `returns.${yearKey}`, value: val, confidence: 0.85 });
      }
    }
  }
  const sanitizedFields = sanitizeFields(rawFields);

  // Extract reportMonth
  const reportMonth = isValidReportMonth(parsed.reportMonth) ? parsed.reportMonth : null;
  const reportMonthConfidence: "high" | "low" =
    reportMonth && parsed.reportMonthConfidence === "high" ? "high" : "low";

  // Extract returnBasis
  const rawBasis = parsed.returnBasis;
  const returnBasis: "ILS" | "USD" | null =
    rawBasis === "ILS" ? "ILS" : rawBasis === "USD" ? "USD" : null;

  // Extract returnBasisOptions (all currencies found in document)
  const rawOptions = Array.isArray(parsed.returnBasisOptions) ? parsed.returnBasisOptions : [];
  const returnBasisOptions: ("ILS" | "USD")[] = rawOptions.filter(
    (o: unknown) => o === "ILS" || o === "USD"
  ) as ("ILS" | "USD")[];
  // Ensure at least the detected basis is in options
  if (returnBasis && !returnBasisOptions.includes(returnBasis)) {
    returnBasisOptions.push(returnBasis);
  }

  let match = null;
  if (parsed.suggestedMatch && typeof parsed.suggestedMatch === "object") {
    const sm = parsed.suggestedMatch as Record<string, unknown>;
    if (sm.fundId) {
      const matchedFund = existingFunds.find((f) => f.id === sm.fundId);
      match = {
        fundId: String(sm.fundId),
        fundName: matchedFund?.name || String(sm.fundName || ""),
        similarity: normalizeConfidence(sm.similarity),
        categoryId: matchedFund?.categoryId || null,
      };
    }
  }

  // Extract dualCurrencyData if present (dual ILS+USD reports)
  let dualCurrencyData: DualCurrencyEntry[] | undefined;
  if (Array.isArray(parsed.dualCurrencyData) && parsed.dualCurrencyData.length >= 2) {
    dualCurrencyData = [];
    for (const entry of parsed.dualCurrencyData as Record<string, unknown>[]) {
      const basis = entry.returnBasis;
      if (basis !== "ILS" && basis !== "USD") continue;
      const entryRawFields = [...(Array.isArray(entry.fields) ? entry.fields : [])] as unknown[];
      // Convert allMonthlyReturns in dual currency entries too
      if (entry.allMonthlyReturns && typeof entry.allMonthlyReturns === "object") {
        const amr = entry.allMonthlyReturns as Record<string, unknown>;
        for (const [month, val] of Object.entries(amr)) {
          if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month) && typeof val === "number") {
            entryRawFields.push({ key: `monthlyReturns.${month}`, value: val, confidence: 0.95 });
          }
        }
      }
      // Convert top-level returns in dual currency entries too
      if (entry.returns && typeof entry.returns === "object" && !Array.isArray(entry.returns)) {
        const ret = entry.returns as Record<string, unknown>;
        for (const [yearKey, val] of Object.entries(ret)) {
          if (/^(y\d{4}|ytd\d{4})$/.test(yearKey) && typeof val === "number") {
            entryRawFields.push({ key: `returns.${yearKey}`, value: val, confidence: 0.85 });
          }
        }
      }
      const entryFields = sanitizeFields(entryRawFields);
      if (entryFields.length > 0) {
        dualCurrencyData.push({ returnBasis: basis, fields: entryFields });
      }
    }
    // Propagate top-level returns.y*/returns.ytd* fields ONLY to the entry that
    // matches the top-level returnBasis (ILS). Never propagate ILS values to the
    // USD entry — that would cause currency inversion.
    if (dualCurrencyData.length >= 2) {
      const topLevelReturns = sanitizedFields.filter(
        (f) => /^returns\.(y\d{4}|ytd\d{4})$/.test(f.key)
      );
      for (const entry of dualCurrencyData) {
        if (entry.returnBasis !== returnBasis) continue; // only same-currency propagation
        const entryKeys = new Set(entry.fields.map((f) => f.key));
        for (const topField of topLevelReturns) {
          if (!entryKeys.has(topField.key)) {
            entry.fields.push({ ...topField });
          }
        }
      }
    }
    if (dualCurrencyData.length < 2) dualCurrencyData = undefined;
  }

  // Auto-convert ALL returns.ytdYYYY → returns.yYYYY.
  // YTD/מצטברת מתחילת השנה IS the annual return — the prompt now instructs the AI
  // to extract it as returns.yYYYY directly, but as a safety net we also promote
  // any remaining ytd keys here.
  const promoteAllYtdToAnnual = (fields: ParsedField[]) => {
    for (const f of fields) {
      const ytdMatch = f.key.match(/^returns\.ytd(\d{4})$/);
      if (!ytdMatch) continue;
      const year = ytdMatch[1];
      const yKey = `returns.y${year}`;
      const hasExplicitY = fields.some((ff) => ff.key === yKey && ff.value !== null);
      if (!hasExplicitY) {
        f.key = yKey; // Promote ytd to annual
      }
    }
  };

  promoteAllYtdToAnnual(sanitizedFields);
  if (dualCurrencyData) {
    for (const entry of dualCurrencyData) {
      promoteAllYtdToAnnual(entry.fields);
    }
  }

  // Apply Jan↔Annual swap fix on Pass-1 fields
  const corrections: string[] = [];
  fixAnnualJanSwapPerYear(sanitizedFields, corrections);
  if (dualCurrencyData) {
    for (const entry of dualCurrencyData) {
      fixAnnualJanSwapPerYear(entry.fields, corrections, entry.returnBasis || "");
    }
  }

  return {
    fundName: String(parsed.fundName || ""),
    fundNameConfidence: normalizeConfidence(parsed.fundNameConfidence),
    reportMonth,
    reportMonthConfidence,
    returnBasis,
    returnBasisOptions,
    fields: sanitizedFields,
    match,
    dualCurrencyData,
    corrections: corrections.length > 0 ? corrections : undefined,
  };
}

/**
 * POST /api/parse?action=parse — Parse text via Claude API
 * POST /api/parse?action=save-draft — Save parsed result as draft
 * POST /api/parse?action=apply — Apply draft to fund
 * POST /api/parse?action=reject — Reject a draft
 * POST /api/parse?action=parse-file — (Phase 2 stub) Parse file metadata
 * GET  /api/parse?action=drafts — List all drafts
 * GET  /api/parse?action=log — Get audit log
 */
export async function GET(req: NextRequest) {
  try {
    const clientKey = getClientKeyFromRequest(req.url);
    const auth = await isAuthorized(req, clientKey);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await isAiParserEnabled(clientKey))) {
      return NextResponse.json({ error: "AI Parser is not enabled for this client" }, { status: 403 });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "drafts") {
      const drafts = await storageRead<ParseDraft[]>(`parse-drafts:${clientKey}`, []);

      // Auto-cleanup: remove non-pending drafts older than 90 days
      const CLEANUP_DAYS = 90;
      const cutoff = Date.now() - CLEANUP_DAYS * 24 * 60 * 60 * 1000;
      const before = drafts.length;
      const cleaned = drafts.filter((d) => {
        if (d.status === "pending") return true; // never auto-delete pending
        const ts = d.appliedAt || d.rejectedAt || d.createdAt;
        return new Date(ts).getTime() > cutoff;
      });
      if (cleaned.length < before) {
        await storageWrite(`parse-drafts:${clientKey}`, cleaned);
      }

      return NextResponse.json(cleaned);
    }

    if (action === "log") {
      const log = await storageRead<ParseLogEntry[]>(`parse-log:${clientKey}`, []);
      return NextResponse.json(log);
    }

    if (action === "token-usage") {
      const usage = await getTokenUsage(clientKey);
      const limits = await getClientTokenLimit(clientKey);
      const percent = limits.monthlyInputTokens > 0
        ? Math.round((usage.inputTokens / limits.monthlyInputTokens) * 100)
        : 0;
      return NextResponse.json({
        ...usage,
        limit: limits.monthlyInputTokens,
        callLimit: limits.monthlyCallCount,
        percent,
        warning: percent >= WARN_THRESHOLD_PERCENT && percent < 100,
        blocked: percent >= 100 || usage.callCount >= limits.monthlyCallCount,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("GET /api/parse error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const clientKey = getClientKeyFromRequest(req.url);
    const auth = await isAuthorized(req, clientKey);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await isAiParserEnabled(clientKey))) {
      return NextResponse.json({ error: "AI Parser is not enabled for this client" }, { status: 403 });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ============================================================
    // ACTION: parse — Send text to Claude API, extract fund data
    // ============================================================
    if (action === "parse") {
      const body = await req.json();
      const text = body.text?.trim();
      if (!text || text.length < 10) {
        return NextResponse.json({ error: "Text too short" }, { status: 400 });
      }
      if (text.length > 10000) {
        return NextResponse.json({ error: "Text too long (max 10,000 chars)" }, { status: 400 });
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return NextResponse.json({
          error: "ANTHROPIC_API_KEY not configured. Add it in Vercel Dashboard → Settings → Environment Variables.",
        }, { status: 500 });
      }

      // Load existing fund names for matching context (active only)
      const fundsData = await storageRead<{ categories: { id: string; funds: { id: string; name: string; active?: boolean; returnBasis?: string }[] }[] }>(`funds:${clientKey}`, { categories: [] });
      const existingFunds: { id: string; name: string; categoryId: string; returnBasis?: string }[] = [];
      for (const cat of fundsData.categories || []) {
        for (const fund of cat.funds || []) {
          if (fund.active === false) continue;
          existingFunds.push({ id: fund.id, name: fund.name, categoryId: cat.id, returnBasis: fund.returnBasis });
        }
      }

      // Check token limit before calling API
      const tokenCheck = await checkTokenLimit(clientKey);
      if (!tokenCheck.allowed) {
        return NextResponse.json({
          error: "חריגת מכסת טוקנים חודשית. פנה למנהל להגדלת המכסה.",
          tokenUsage: { percent: tokenCheck.percent, used: tokenCheck.usage.inputTokens, limit: tokenCheck.limit },
        }, { status: 429 });
      }

      const systemPrompt = buildSystemPrompt(existingFunds);

      const claudeResult = await callClaude(apiKey, systemPrompt, text);
      if (!claudeResult.success) {
        return NextResponse.json({ error: claudeResult.error }, { status: 502 });
      }

      // Record token usage
      const updatedUsage = await recordTokenUsage(clientKey, "parse", claudeResult.usage);
      const limits = await getClientTokenLimit(clientKey);
      const usagePercent = Math.round((updatedUsage.inputTokens / limits.monthlyInputTokens) * 100);

      const result = parseCloudeResponse(claudeResult.content, existingFunds);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }

      return NextResponse.json({
        ...result,
        tokenUsage: {
          thisCall: claudeResult.usage.input_tokens,
          monthlyUsed: updatedUsage.inputTokens,
          monthlyLimit: limits.monthlyInputTokens,
          percent: usagePercent,
          warning: usagePercent >= WARN_THRESHOLD_PERCENT,
        },
      });
    }

    // ============================================================
    // ACTION: save-draft — Save parsed result as pending draft
    // ============================================================
    if (action === "save-draft") {
      const body = await req.json();

      // Sanitize fields before saving
      const sanitizedFields = sanitizeFields(body.fields || []);

      // Validate reportMonth format if provided
      const reportMonth = isValidReportMonth(body.reportMonth) ? body.reportMonth : null;

      const draft: ParseDraft = {
        id: generateId(),
        createdAt: new Date().toISOString(),
        source: {
          type: (body.sourceType === "file" ? "pdf" : "text") as "text" | "pdf" | "image",
          preview: String(body.sourceText || "").slice(0, 200),
        },
        extracted: {
          fundName: String(body.fundName || ""),
          fundNameConfidence: normalizeConfidence(body.fundNameConfidence),
          fields: sanitizedFields,
        },
        reportMonth,
        reportMonthConfidence: reportMonth && body.reportMonthConfidence === "high" ? "high" : "low",
        returnBasis: body.returnBasis === "ILS" ? "ILS" : body.returnBasis === "USD" ? "USD" : null,
        match: body.match || null,
        status: "pending",
        corrections: Array.isArray(body.corrections) ? body.corrections : undefined,
      };

      // Validate draft
      const validationError = validateDraft(draft);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      const drafts = await storageRead<ParseDraft[]>(`parse-drafts:${clientKey}`, []);
      drafts.push(draft);
      await storageWrite(`parse-drafts:${clientKey}`, drafts);

      await storageAppend<ParseLogEntry>(`parse-log:${clientKey}`, {
        id: generateId(),
        timestamp: new Date().toISOString(),
        action: "parse",
        draftId: draft.id,
        fundName: draft.extracted.fundName,
        fundId: draft.match?.fundId || null,
        details: `Parsed ${draft.source.type} (${draft.source.preview.length} chars preview). ${draft.extracted.fields.length} fields extracted: ${draft.extracted.fields.map((f) => f.key).join(", ")}`,
      });

      return NextResponse.json({ success: true, draft });
    }

    // ============================================================
    // Monthly direction normalization
    // ============================================================
    function normalizeMonthlyDirection(
      fields: { key: string; value: string | number | null }[],
      direction: "LTR" | "RTL" | null | undefined,
    ): { key: string; value: string | number | null }[] {
      if (direction !== "RTL") return fields;
      // Collect monthly fields per year, reverse their values
      const monthlyByYear: Record<string, { key: string; value: string | number | null; month: number }[]> = {};
      const nonMonthly: { key: string; value: string | number | null }[] = [];
      for (const f of fields) {
        let ym: string | null = null;
        let month = 0;
        if (f.key === "monthlyReturn") {
          // monthlyReturn is current month — not part of yearly reversal, pass through
          nonMonthly.push(f);
          continue;
        }
        if (f.key.startsWith("monthlyReturns.")) {
          const parts = f.key.split(".")[1]; // "2025-03"
          if (parts) {
            const [y, m] = parts.split("-");
            ym = y;
            month = parseInt(m);
          }
        }
        if (ym && !isNaN(month)) {
          if (!monthlyByYear[ym]) monthlyByYear[ym] = [];
          monthlyByYear[ym].push({ key: f.key, value: f.value, month });
        } else {
          nonMonthly.push(f);
        }
      }
      // For each year group, reverse the value assignments
      const normalized = [...nonMonthly];
      for (const entries of Object.values(monthlyByYear)) {
        if (entries.length < 2) {
          normalized.push(...entries.map((e) => ({ key: e.key, value: e.value })));
          continue;
        }
        // Sort by month ascending, collect values, reverse values, re-assign
        entries.sort((a, b) => a.month - b.month);
        const values = entries.map((e) => e.value);
        values.reverse();
        for (let i = 0; i < entries.length; i++) {
          normalized.push({ key: entries[i].key, value: values[i] });
        }
      }
      return normalized;
    }

    // ============================================================
    // Monthly vs Yearly compound validation
    // ============================================================
    function validateMonthlyVsYearly(
      monthlyReturns: Record<string, number>,
      yearlyReturns: Record<string, number | null>,
    ): { year: number; compounded: number; yearly: number; diff: number; status: "pass" | "fail" }[] {
      const results: { year: number; compounded: number; yearly: number; diff: number; status: "pass" | "fail" }[] = [];
      // Group monthly by year
      const byYear: Record<number, number[]> = {};
      for (const [key, val] of Object.entries(monthlyReturns)) {
        const y = parseInt(key.split("-")[0]);
        if (!isNaN(y) && typeof val === "number") {
          if (!byYear[y]) byYear[y] = [];
          byYear[y].push(val);
        }
      }
      for (const [yearStr, months] of Object.entries(byYear)) {
        const year = parseInt(yearStr);
        if (months.length !== 12) continue; // only validate complete years
        const yearlyKey = `y${year}`;
        const yearly = yearlyReturns[yearlyKey];
        if (yearly === null || yearly === undefined) continue;
        const compounded = months.reduce((acc, r) => acc * (1 + r), 1) - 1;
        const diff = Math.abs(compounded - yearly);
        results.push({ year, compounded, yearly, diff, status: diff <= 0.01 ? "pass" : "fail" });
      }
      return results;
    }

    // ============================================================
    // ACTION: check-collision — Compute full diff for approved fields
    // ============================================================
    if (action === "check-collision") {
      const body = await req.json();
      const { fundId, categoryId, reportMonth, approvedFields, draftId: checkDraftId } = body;

      const diffComputedAt = new Date().toISOString();

      // Look up draft corrections if draftId provided
      let hasMonthlyUncertain = false;
      let draftCorrections: string[] = [];
      if (checkDraftId) {
        const allDrafts = await storageRead<ParseDraft[]>(`parse-drafts:${clientKey}`, []);
        const found = allDrafts.find((d) => d.id === checkDraftId);
        if (found?.corrections) {
          draftCorrections = found.corrections;
          hasMonthlyUncertain = draftCorrections.some((c) => c.includes("monthly_uncertain"));
        }
      }

      if (!fundId || !categoryId) {
        return NextResponse.json({ diff: [], diffComputedAt, fundLastUpdated: null, hasMonthlyUncertain, draftCorrections });
      }

      const rawFields = sanitizeFields(approvedFields || []);
      const fundsData = await storageRead<Record<string, unknown>>(`funds:${clientKey}`, { categories: [] });

      const diff: { field: string; existingValue: string | number | null; newValue: string | number | null; status: "new" | "changed" | "same" | "missing_in_pdf" }[] = [];
      let fundLastUpdated: string | null = null;
      let fundMonthlyReturns: Record<string, number> = {};
      let fundYearlyReturns: Record<string, number> = {};
      let fundMonthlyDirection: "LTR" | "RTL" | null = null;

      for (const cat of (fundsData.categories as Record<string, unknown>[]) || []) {
        if (cat.id !== categoryId) continue;
        const funds = cat.funds as Record<string, unknown>[];
        for (const fund of funds) {
          if (fund.id !== fundId) continue;

          fundLastUpdated = (fund.lastUpdated as string) || null;
          fundMonthlyDirection = (fund.monthlyDirection as "LTR" | "RTL" | null) || null;
          const monthlyReturns = (fund.monthlyReturns || {}) as Record<string, number>;
          const fundReturns = (fund.returns || {}) as Record<string, unknown>;
          fundMonthlyReturns = { ...monthlyReturns };
          for (const [k, v] of Object.entries(fundReturns)) {
            if (/^y\d{4}$/.test(k) && typeof v === "number") fundYearlyReturns[k] = v;
          }

          // Direction normalization disabled — new prompt (v26+) maps by column name, not position
          const validFields = rawFields;

          for (const field of validFields) {
            let existingValue: string | number | null = null;

            if (field.key === "monthlyReturn") {
              existingValue = reportMonth && reportMonth in monthlyReturns ? monthlyReturns[reportMonth] : null;
            } else if (field.key.startsWith("monthlyReturns.")) {
              const month = field.key.split(".")[1];
              existingValue = month && month in monthlyReturns ? monthlyReturns[month] : null;
            } else if (field.key.startsWith("returns.")) {
              const yearKey = field.key.split(".")[1];
              existingValue = yearKey && yearKey in fundReturns ? (fundReturns[yearKey] as number) : null;
            } else if (field.key === "manager" || field.key === "classification") {
              const val = fund[field.key];
              existingValue = typeof val === "string" && val ? val : null;
            } else if (field.key === "sharpe" || field.key === "stdDev") {
              const val = fund[field.key];
              existingValue = typeof val === "number" ? val : null;
            }

            // Determine status
            let status: "new" | "changed" | "same";
            if (existingValue === null || existingValue === undefined) {
              status = "new";
            } else if (existingValue === field.value) {
              status = "same";
            } else if (typeof existingValue === "number" && typeof field.value === "number" && Math.abs(existingValue - field.value) < 1e-10) {
              status = "same";
            } else {
              status = "changed";
            }

            diff.push({
              field: field.key,
              existingValue: existingValue ?? null,
              newValue: field.value,
              status,
            });
          }

          // Detect missing_in_pdf: financial fields that exist in fund but NOT in draft
          const draftKeys = new Set(validFields.map((f) => f.key));
          // Check sharpe, stdDev
          for (const key of ["sharpe", "stdDev"] as const) {
            if (!draftKeys.has(key)) {
              const val = fund[key];
              if (typeof val === "number") {
                diff.push({ field: key, existingValue: val, newValue: null, status: "missing_in_pdf" });
              }
            }
          }
          // Check monthlyReturn for the specific reportMonth
          if (!draftKeys.has("monthlyReturn") && reportMonth && reportMonth in monthlyReturns) {
            diff.push({ field: "monthlyReturn", existingValue: monthlyReturns[reportMonth], newValue: null, status: "missing_in_pdf" });
          }
          // Check returns.y* and returns.ytd*
          for (const [yearKey, val] of Object.entries(fundReturns)) {
            if (/^(y\d{4}|ytd\d{4})$/.test(yearKey) && typeof val === "number") {
              const fullKey = `returns.${yearKey}`;
              if (!draftKeys.has(fullKey)) {
                diff.push({ field: fullKey, existingValue: val as number, newValue: null, status: "missing_in_pdf" });
              }
            }
          }

          break;
        }
        break;
      }

      // Phase 2: Mark changed monthly fields as protected when draft has monthly_uncertain
      if (hasMonthlyUncertain) {
        for (const d of diff) {
          if (d.status === "changed" && (d.field === "monthlyReturn" || d.field.startsWith("monthlyReturns."))) {
            (d as Record<string, unknown>).monthlyProtected = true;
          }
        }
      }

      // History cross-check: flag monthly fields where incoming ≠ existing by >0.5%
      for (const d of diff) {
        if (d.status !== "changed") continue;
        if (d.field !== "monthlyReturn" && !d.field.startsWith("monthlyReturns.")) continue;
        if (typeof d.existingValue === "number" && typeof d.newValue === "number") {
          const absDiff = Math.abs(d.existingValue - d.newValue);
          if (absDiff > 0.005) {
            (d as Record<string, unknown>).historyMismatch = true;
            (d as Record<string, unknown>).historyDiff = absDiff;
          }
        }
      }

      // Compound validation: merge fund's full history + draft monthly, compare vs yearly
      let monthlyValidation: { year: number; compounded: number; yearly: number; diff: number; status: "pass" | "fail" }[] = [];
      {
        // Start with fund's existing data as base
        const mergedMonthly: Record<string, number> = { ...fundMonthlyReturns };
        const mergedYearly: Record<string, number | null> = { ...fundYearlyReturns };
        // Overlay draft values (new/changed from diff take priority)
        for (const d of diff) {
          if (d.field === "monthlyReturn" && reportMonth && typeof d.newValue === "number") {
            mergedMonthly[reportMonth] = d.newValue;
          } else if (d.field.startsWith("monthlyReturns.")) {
            const m = d.field.split(".")[1];
            if (m && typeof d.newValue === "number") mergedMonthly[m] = d.newValue;
          } else if (d.field.startsWith("returns.y") && !d.field.includes("ytd")) {
            const yearKey = d.field.split(".")[1];
            if (yearKey && typeof d.newValue === "number") mergedYearly[yearKey] = d.newValue;
          }
        }
        monthlyValidation = validateMonthlyVsYearly(mergedMonthly, mergedYearly);
      }

      // Auto-apply eligible: at least 1 new field, 0 changed, 0 missing_in_pdf, NO monthly_uncertain
      const hasNew = diff.some((d) => d.status === "new");
      const hasChanged = diff.some((d) => d.status === "changed");
      const hasMissing = diff.some((d) => d.status === "missing_in_pdf");
      const autoApplyEligible = hasNew && !hasChanged && !hasMissing && !hasMonthlyUncertain;

      return NextResponse.json({ diff, diffComputedAt, fundLastUpdated, autoApplyEligible, hasMonthlyUncertain, draftCorrections, monthlyValidation, fundMonthlyDirection });
    }

    // ============================================================
    // ACTION: set-direction — Save monthlyDirection on a fund
    // ============================================================
    if (action === "set-direction") {
      const body = await req.json();
      const { fundId, categoryId, direction } = body;
      if (!fundId || !categoryId || !["LTR", "RTL", null].includes(direction)) {
        return NextResponse.json({ error: "Missing fundId/categoryId or invalid direction" }, { status: 400 });
      }
      const fundsData = await storageRead<Record<string, unknown>>(`funds:${clientKey}`, { categories: [] });
      let saved = false;
      for (const cat of (fundsData.categories as Record<string, unknown>[]) || []) {
        if (cat.id !== categoryId) continue;
        const funds = cat.funds as Record<string, unknown>[];
        for (const fund of funds) {
          if (fund.id !== fundId) continue;
          fund.monthlyDirection = direction;
          saved = true;
          break;
        }
        break;
      }
      if (!saved) {
        return NextResponse.json({ error: "Fund not found" }, { status: 404 });
      }
      await storageWrite(`funds:${clientKey}`, fundsData);
      return NextResponse.json({ success: true, direction });
    }

    // ============================================================
    // ACTION: apply — Apply draft fields to fund in funds.json
    // ============================================================
    if (action === "apply") {
      const body = await req.json();
      const { draftId, fundId, categoryId, approvedFields, reportMonth, fieldDecisions, diffComputedAt, clearFields, returnBasis: applyReturnBasis, autoApply, batchId } = body;

      if (!draftId || !fundId || !categoryId || !approvedFields) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }

      // Server-side guard: block autoApply when draft has monthly_uncertain
      if (autoApply) {
        const allDrafts = await storageRead<ParseDraft[]>(`parse-drafts:${clientKey}`, []);
        const thisDraft = allDrafts.find((d) => d.id === draftId);
        if (thisDraft?.corrections?.some((c) => c.includes("monthly_uncertain"))) {
          return NextResponse.json({
            error: "טיוטה עם נתונים חודשיים לא אמינים — נדרש אישור ידני",
            monthlyUncertain: true,
          }, { status: 409 });
        }
      }

      // reportMonth is REQUIRED for monthlyReturn — block apply without it
      const hasMonthlyReturn = (approvedFields as unknown[]).some(
        (f: unknown) => (f as Record<string, unknown>).key === "monthlyReturn"
      );
      if (hasMonthlyReturn && !isValidReportMonth(reportMonth)) {
        return NextResponse.json({
          error: "חודש דיווח (reportMonth) חובה לעדכון תשואה חודשית",
        }, { status: 400 });
      }

      // Re-sanitize approved fields against whitelist
      const rawApplyFields = sanitizeFields(approvedFields);

      if (rawApplyFields.length === 0) {
        return NextResponse.json({ error: "No valid fields to apply" }, { status: 400 });
      }

      // Parse field decisions: { "monthlyReturn": "replace" | "keep", "returns.y2025": "replace", ... }
      const decisions = (fieldDecisions || {}) as Record<string, "replace" | "keep">;

      // Load funds data
      const fundsData = await storageRead<Record<string, unknown>>(`funds:${clientKey}`, { categories: [] });

      // Read fund's monthlyDirection for normalization
      let applyDirection: "LTR" | "RTL" | null = null;
      for (const cat of (fundsData.categories as Record<string, unknown>[]) || []) {
        if (cat.id !== categoryId) continue;
        for (const fund of (cat.funds as Record<string, unknown>[]) || []) {
          if (fund.id !== fundId) { continue; }
          applyDirection = (fund.monthlyDirection as "LTR" | "RTL" | null) || null;
          break;
        }
        break;
      }
      // Direction normalization disabled — new prompt (v26+) maps by column name, not position
      const validFields = rawApplyFields;

      // Find the fund
      let fundFound = false;
      const appliedFieldNames: string[] = [];
      const skippedFields: string[] = [];
      const changedFieldsLog: { field: string; oldValue: unknown; newValue: unknown; decision: string }[] = [];

      for (const cat of (fundsData.categories as Record<string, unknown>[]) || []) {
        if (cat.id !== categoryId) continue;
        const funds = cat.funds as Record<string, unknown>[];
        for (let i = 0; i < funds.length; i++) {
          if (funds[i].id !== fundId) continue;
          fundFound = true;

          // Staleness check: if fund was updated after diff was computed, block apply
          const fundLastUpdated = (funds[i].lastUpdated as string) || null;
          if (fundLastUpdated && diffComputedAt && fundLastUpdated > diffComputedAt) {
            return NextResponse.json({
              error: "הנתונים בקרן השתנו מאז בדיקת ההשוואה — נא לרענן ולנסות שוב",
            }, { status: 409 });
          }

          // Auto-apply safety: server-side re-validation
          if (autoApply) {
            const fundReturnsCheck = (funds[i].returns || {}) as Record<string, unknown>;
            const monthlyReturnsCheck = (funds[i].monthlyReturns || {}) as Record<string, number>;
            for (const field of validFields) {
              let existingVal: unknown = null;
              if (field.key === "monthlyReturn") {
                existingVal = reportMonth && reportMonth in monthlyReturnsCheck ? monthlyReturnsCheck[reportMonth] : null;
              } else if (field.key.startsWith("monthlyReturns.")) {
                const m = field.key.split(".")[1];
                existingVal = m && m in monthlyReturnsCheck ? monthlyReturnsCheck[m] : null;
              } else if (field.key.startsWith("returns.")) {
                const yk = field.key.split(".")[1];
                existingVal = yk && yk in fundReturnsCheck ? fundReturnsCheck[yk] : null;
              } else {
                existingVal = funds[i][field.key] ?? null;
              }
              const isExist = existingVal !== null && existingVal !== undefined;
              const isSameVal = isExist && (existingVal === field.value || (typeof existingVal === "number" && typeof field.value === "number" && Math.abs(existingVal - field.value) < 1e-10));
              if (isExist && !isSameVal) {
                return NextResponse.json({
                  error: "נמצאו שדות שהשתנו — נדרשת סקירה ידנית",
                  requiresDiff: true,
                }, { status: 409 });
              }
            }
          }

          // Snapshot fund BEFORE changes for undo (extended with field decisions)
          await storageWrite(`undo-state:${clientKey}`, {
            draftId,
            fundId,
            categoryId,
            fundSnapshot: JSON.parse(JSON.stringify(funds[i])),
            timestamp: new Date().toISOString(),
            fieldDecisions: decisions,
          });

          // Ensure monthlyReturns object exists
          if (!funds[i].monthlyReturns) {
            funds[i].monthlyReturns = {};
          }
          const monthlyReturns = funds[i].monthlyReturns as Record<string, number>;
          const fundReturns = (funds[i].returns || {}) as Record<string, unknown>;

          // Apply whitelisted fields, respecting per-field decisions
          for (const field of validFields) {
            // Compute existing value for server-side validation
            let existingValue: unknown = null;
            if (field.key === "monthlyReturn") {
              existingValue = reportMonth && reportMonth in monthlyReturns ? monthlyReturns[reportMonth] : null;
            } else if (field.key.startsWith("monthlyReturns.")) {
              const month = field.key.split(".")[1];
              existingValue = month && month in monthlyReturns ? monthlyReturns[month] : null;
            } else if (field.key.startsWith("returns.")) {
              const yearKey = field.key.split(".")[1];
              existingValue = yearKey && yearKey in fundReturns ? fundReturns[yearKey] : null;
            } else {
              existingValue = funds[i][field.key] ?? null;
            }

            // Determine if this field is "changed" (exists with different value)
            const isExisting = existingValue !== null && existingValue !== undefined;
            const isSame = isExisting && (existingValue === field.value || (typeof existingValue === "number" && typeof field.value === "number" && Math.abs(existingValue - field.value) < 1e-10));
            const isChanged = isExisting && !isSame;

            // Block if changed field has no decision
            if (isChanged) {
              const decision = decisions[field.key];
              if (!decision) {
                return NextResponse.json({
                  error: `שדה "${field.key}" השתנה ודורש החלטה (replace/keep)`,
                }, { status: 409 });
              }
              if (decision === "keep") {
                skippedFields.push(field.key);
                changedFieldsLog.push({ field: field.key, oldValue: existingValue, newValue: field.value, decision: "keep" });
                continue;
              }
              // decision === "replace"
              changedFieldsLog.push({ field: field.key, oldValue: existingValue, newValue: field.value, decision: "replace" });
            }

            // Apply the field
            if (field.key === "monthlyReturn") {
              funds[i].monthlyReturn = field.value as number;
              if (reportMonth) {
                monthlyReturns[reportMonth] = field.value as number;
              }
              appliedFieldNames.push("monthlyReturn");
            } else if (field.key.startsWith("monthlyReturns.")) {
              const month = field.key.split(".")[1];
              if (month && isValidReportMonth(month)) {
                monthlyReturns[month] = field.value as number;
                appliedFieldNames.push(field.key);
              }
            } else if (field.key.startsWith("returns.")) {
              const yearKey = field.key.split(".")[1];
              if (!funds[i].returns) funds[i].returns = {};
              const returns = funds[i].returns as Record<string, unknown>;
              if (yearKey) {
                returns[yearKey] = field.value as number;
                appliedFieldNames.push(field.key);
              }
            } else if (field.key === "manager") {
              funds[i].manager = field.value as string;
              appliedFieldNames.push("manager");
            } else if (field.key === "classification") {
              funds[i].classification = field.value as string;
              appliedFieldNames.push("classification");
            } else if (field.key === "sharpe") {
              funds[i].sharpe = field.value as number;
              appliedFieldNames.push("sharpe");
            } else if (field.key === "stdDev") {
              funds[i].stdDev = field.value as number;
              appliedFieldNames.push("stdDev");
            }
          }

          // Apply clearFields: set missing_in_pdf fields to null
          const clearList = Array.isArray(clearFields) ? clearFields as string[] : [];
          for (const clearKey of clearList) {
            if (clearKey === "sharpe") {
              changedFieldsLog.push({ field: "sharpe", oldValue: funds[i].sharpe, newValue: null, decision: "clear" });
              funds[i].sharpe = null;
            } else if (clearKey === "stdDev") {
              changedFieldsLog.push({ field: "stdDev", oldValue: funds[i].stdDev, newValue: null, decision: "clear" });
              funds[i].stdDev = null;
            } else if (clearKey === "monthlyReturn" && reportMonth) {
              // Set the specific month entry to null (key preserved, value nulled)
              if (reportMonth in monthlyReturns) {
                changedFieldsLog.push({ field: "monthlyReturn", oldValue: monthlyReturns[reportMonth], newValue: null, decision: "clear" });
                (funds[i].monthlyReturns as Record<string, number | null>)[reportMonth] = null;
              }
            } else if (clearKey.startsWith("returns.")) {
              const yearKey = clearKey.split(".")[1];
              if (yearKey && /^(y\d{4}|ytd\d{4})$/.test(yearKey)) {
                if (!funds[i].returns) funds[i].returns = {};
                const returns = funds[i].returns as Record<string, unknown>;
                changedFieldsLog.push({ field: clearKey, oldValue: returns[yearKey], newValue: null, decision: "clear" });
                returns[yearKey] = null;
              }
            }
            appliedFieldNames.push(`cleared:${clearKey}`);
          }

          // Update lastReportDate if reportMonth provided — store as MM/YYYY for display consistency
          if (isValidReportMonth(reportMonth)) {
            const [yyyy, mm] = reportMonth.split("-");
            funds[i].lastReportDate = `${mm}/${yyyy}`;
          }

          // Set returnBasis + currency on fund if provided (fund-level currency)
          if (applyReturnBasis === "ILS" || applyReturnBasis === "USD") {
            funds[i].returnBasis = applyReturnBasis;
            funds[i].currency = applyReturnBasis;
          }

          // Update fund.lastUpdated for staleness tracking
          funds[i].lastUpdated = new Date().toISOString();

          // Auto-calculate sharpe/stdDev if 12+ observations (document values take priority)
          const hasExtractedSharpe = appliedFieldNames.includes("sharpe");
          const hasExtractedStdDev = appliedFieldNames.includes("stdDev");
          applyRiskMetrics(funds[i], hasExtractedSharpe, hasExtractedStdDev);

          break;
        }
        if (fundFound) break;
      }

      if (!fundFound) {
        return NextResponse.json({ error: "Fund not found" }, { status: 404 });
      }

      // Update top-level lastUpdated so the main report header reflects the latest apply
      {
        const fd = fundsData as Record<string, unknown>;
        const reportDate = isValidReportMonth(reportMonth)
          ? new Date(`${reportMonth}-01`).toISOString()
          : new Date().toISOString();
        fd.lastUpdated = reportDate;
      }

      // Save funds data
      await storageWrite(`funds:${clientKey}`, fundsData);

      // Update draft status
      const drafts = await storageRead<ParseDraft[]>(`parse-drafts:${clientKey}`, []);
      const draftIdx = drafts.findIndex((d) => d.id === draftId);
      let draftFundName = "";
      if (draftIdx >= 0) {
        drafts[draftIdx].status = "applied";
        drafts[draftIdx].appliedAt = new Date().toISOString();
        draftFundName = drafts[draftIdx].extracted.fundName;
        await storageWrite(`parse-drafts:${clientKey}`, drafts);
      }

      // Enhanced audit log with per-field decisions
      const replacedFields = changedFieldsLog.filter((f) => f.decision === "replace");
      const keptFields = changedFieldsLog.filter((f) => f.decision === "keep");

      await storageAppend<ParseLogEntry>(`parse-log:${clientKey}`, {
        id: generateId(),
        timestamp: new Date().toISOString(),
        action: "apply",
        draftId,
        fundName: draftFundName,
        fundId,
        details: `Applied ${appliedFieldNames.length} fields: ${appliedFieldNames.join(", ")}${skippedFields.length > 0 ? `. Kept existing: ${skippedFields.join(", ")}` : ""}${replacedFields.length > 0 ? `. Replaced: ${replacedFields.map((f) => `${f.field} (${f.oldValue}→${f.newValue})`).join(", ")}` : ""}`,
        reportMonth: reportMonth || null,
        collision: changedFieldsLog.length > 0,
        collisionDecision: replacedFields.length > 0 ? "replace" : keptFields.length > 0 ? "keep" : "new",
        ...(autoApply ? { autoApply: true } : {}),
        ...(batchId ? { batchId: String(batchId) } : {}),
      });

      return NextResponse.json({
        success: true,
        appliedFields: appliedFieldNames.length,
        skippedFields: skippedFields.length,
        reportMonth,
        ...(autoApply ? { autoApplied: true } : {}),
      });
    }

    // ============================================================
    // ACTION: reject — Reject a draft
    // ============================================================
    if (action === "reject") {
      const body = await req.json();
      const { draftId } = body;

      if (!draftId) {
        return NextResponse.json({ error: "Missing draftId" }, { status: 400 });
      }

      const drafts = await storageRead<ParseDraft[]>(`parse-drafts:${clientKey}`, []);
      const draftIdx = drafts.findIndex((d) => d.id === draftId);
      if (draftIdx < 0) {
        return NextResponse.json({ error: "Draft not found" }, { status: 404 });
      }

      drafts[draftIdx].status = "rejected";
      drafts[draftIdx].rejectedAt = new Date().toISOString();
      await storageWrite(`parse-drafts:${clientKey}`, drafts);

      await storageAppend<ParseLogEntry>(`parse-log:${clientKey}`, {
        id: generateId(),
        timestamp: new Date().toISOString(),
        action: "reject",
        draftId,
        fundName: drafts[draftIdx].extracted.fundName,
        fundId: drafts[draftIdx].match?.fundId || null,
        details: `Draft rejected by ${auth}. Fields: ${drafts[draftIdx].extracted.fields.map((f) => f.key).join(", ")}`,
      });

      return NextResponse.json({ success: true });
    }

    // ============================================================
    // ACTION: create-fund — Onboard a new fund from parsed data
    // ============================================================
    if (action === "create-fund") {
      if (auth !== "super") {
        return NextResponse.json({ error: "Only super admin can create funds" }, { status: 403 });
      }

      const body = await req.json();
      const { draftId, categoryId, fundName, fields, reportMonth, returnBasis, classification } = body;

      if (!categoryId || !fundName || !fields || !Array.isArray(fields)) {
        return NextResponse.json({ error: "Missing required fields: categoryId, fundName, fields" }, { status: 400 });
      }

      const validFields = sanitizeFields(fields);

      // Generate new fund ID
      const newFundId = `fund-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      // Build new fund object — ALL fields must be present to match Fund interface
      const newFund: Record<string, unknown> = {
        id: newFundId,
        name: fundName,
        classification: typeof classification === "string" && classification ? classification : "",
        startDate: null,
        manager: "",
        lastReportDate: isValidReportMonth(reportMonth) ? reportMonth : null,
        monthlyReturn: 0,
        returns: {
          ytd2026: null, y2025: null, y2024: null, y2023: null,
          y2022: null, y2021: null, y2020: null, y2019: null,
        },
        avgAnnualReturn: null,
        sharpe: null,
        stdDev: null,
        aumMillions: null,
        active: true,
        monthlyReturns: {},
        returnBasis: returnBasis === "ILS" || returnBasis === "USD" ? returnBasis : "ILS",
      };

      // Apply extracted fields
      for (const field of validFields) {
        if (field.key === "monthlyReturn" && typeof field.value === "number") {
          newFund.monthlyReturn = field.value;
          if (isValidReportMonth(reportMonth)) {
            (newFund.monthlyReturns as Record<string, number>)[reportMonth] = field.value;
          }
        } else if (field.key.startsWith("returns.")) {
          const yearKey = field.key.split(".")[1];
          if (yearKey) {
            (newFund.returns as Record<string, unknown>)[yearKey] = field.value;
          }
        } else if (field.key === "manager") {
          newFund.manager = field.value;
        } else if (field.key === "classification") {
          newFund.classification = field.value;
        } else if (field.key === "sharpe" && typeof field.value === "number") {
          newFund.sharpe = field.value;
        } else if (field.key === "stdDev" && typeof field.value === "number") {
          newFund.stdDev = field.value;
        } else if (field.key.startsWith("monthlyReturns.") && typeof field.value === "number") {
          const month = field.key.split(".")[1];
          if (month && isValidReportMonth(month)) {
            (newFund.monthlyReturns as Record<string, number>)[month] = field.value;
          }
        }
      }

      // Auto-calculate sharpe/stdDev for new fund if 12+ observations
      const hasExtractedSharpe = validFields.some((f) => f.key === "sharpe");
      const hasExtractedStdDev = validFields.some((f) => f.key === "stdDev");
      applyRiskMetrics(newFund, hasExtractedSharpe, hasExtractedStdDev);

      // Load funds data and add the new fund
      const fundsData = await storageRead<Record<string, unknown>>(`funds:${clientKey}`, { categories: [] });
      let categoryFound = false;

      // Handle new category creation: "__new__:{id}:{name}:{parentSection}"
      if (typeof categoryId === "string" && categoryId.startsWith("__new__:")) {
        const parts = categoryId.split(":");
        if (parts.length >= 4) {
          const newCat = {
            id: parts[1],
            name: parts[2],
            parentSection: parts.slice(3).join(":"), // parentSection may contain colons
            funds: [newFund],
          };
          if (!Array.isArray(fundsData.categories)) fundsData.categories = [];
          (fundsData.categories as Record<string, unknown>[]).push(newCat);
          categoryFound = true;
        }
      }

      if (!categoryFound) {
        for (const cat of (fundsData.categories as Record<string, unknown>[]) || []) {
          if (cat.id !== categoryId) continue;
          categoryFound = true;
          if (!Array.isArray(cat.funds)) cat.funds = [];
          (cat.funds as Record<string, unknown>[]).push(newFund);
          break;
        }
      }

      if (!categoryFound) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }

      await storageWrite(`funds:${clientKey}`, fundsData);

      // Update draft status if draftId provided
      if (draftId) {
        const drafts = await storageRead<ParseDraft[]>(`parse-drafts:${clientKey}`, []);
        const draftIdx = drafts.findIndex((d) => d.id === draftId);
        if (draftIdx >= 0) {
          drafts[draftIdx].status = "applied";
          drafts[draftIdx].appliedAt = new Date().toISOString();
          await storageWrite(`parse-drafts:${clientKey}`, drafts);
        }
      }

      // Log
      await storageAppend<ParseLogEntry>(`parse-log:${clientKey}`, {
        id: generateId(),
        timestamp: new Date().toISOString(),
        action: "apply",
        draftId: draftId || "direct-create",
        fundName,
        fundId: newFundId,
        details: `New fund created: "${fundName}" (${returnBasis || "ILS"}) in category ${categoryId}. Fields: ${validFields.map((f) => `${f.key}=${f.value}`).join(", ")}`,
        reportMonth: reportMonth || null,
        returnBasis: returnBasis || "ILS",
        collision: false,
        collisionDecision: "new",
      });

      return NextResponse.json({
        success: true,
        fundId: newFundId,
        fundName,
      });
    }

    // ============================================================
    // ACTION: undo — Revert last apply action
    // ============================================================
    if (action === "undo") {
      const undoState = await storageRead<{
        draftId: string;
        fundId: string;
        categoryId: string;
        fundSnapshot: Record<string, unknown>;
        timestamp: string;
      } | null>(`undo-state:${clientKey}`, null);

      if (!undoState) {
        return NextResponse.json({ error: "אין פעולה לביטול" }, { status: 404 });
      }

      // Check staleness — only allow undo within 30 minutes
      const age = Date.now() - new Date(undoState.timestamp).getTime();
      if (age > 30 * 60 * 1000) {
        await storageWrite(`undo-state:${clientKey}`, null);
        return NextResponse.json({ error: "חלון הביטול פג (30 דקות)" }, { status: 410 });
      }

      // Restore fund snapshot
      const fundsData = await storageRead<Record<string, unknown>>(`funds:${clientKey}`, { categories: [] });
      let restored = false;
      for (const cat of (fundsData.categories as Record<string, unknown>[]) || []) {
        if (cat.id !== undoState.categoryId) continue;
        const funds = cat.funds as Record<string, unknown>[];
        for (let i = 0; i < funds.length; i++) {
          if (funds[i].id !== undoState.fundId) continue;
          funds[i] = undoState.fundSnapshot;
          restored = true;
          break;
        }
        if (restored) break;
      }

      if (!restored) {
        return NextResponse.json({ error: "לא נמצאה הקרן לשחזור" }, { status: 404 });
      }

      await storageWrite(`funds:${clientKey}`, fundsData);

      // Revert draft status back to pending
      if (undoState.draftId) {
        const drafts = await storageRead<ParseDraft[]>(`parse-drafts:${clientKey}`, []);
        const draftIdx = drafts.findIndex((d) => d.id === undoState.draftId);
        if (draftIdx >= 0) {
          drafts[draftIdx].status = "pending";
          delete drafts[draftIdx].appliedAt;
          await storageWrite(`parse-drafts:${clientKey}`, drafts);
        }
      }

      // Clear undo state
      await storageWrite(`undo-state:${clientKey}`, null);

      // Log
      await storageAppend<ParseLogEntry>(`parse-log:${clientKey}`, {
        id: generateId(),
        timestamp: new Date().toISOString(),
        action: "reject",
        draftId: undoState.draftId,
        fundName: (undoState.fundSnapshot.name as string) || "",
        fundId: undoState.fundId,
        details: `Undo: reverted apply on fund "${undoState.fundSnapshot.name}" (draft ${undoState.draftId})`,
      });

      return NextResponse.json({ success: true, fundName: undoState.fundSnapshot.name });
    }

    // ============================================================
    // ACTION: parse-file — Parse uploaded PDF/Image via Vision API
    // ============================================================
    if (action === "parse-file") {
      const contentType = req.headers.get("content-type") || "";
      if (!contentType.includes("multipart/form-data")) {
        return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
      }

      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      // Validate file type
      const mimeType = ALLOWED_MIME_TYPES[file.type];
      if (!mimeType) {
        return NextResponse.json({
          error: `Unsupported file type: ${file.type}. Allowed: PDF, PNG, JPG`,
        }, { status: 400 });
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({
          error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum: 10MB`,
        }, { status: 400 });
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return NextResponse.json({
          error: "ANTHROPIC_API_KEY not configured.",
        }, { status: 500 });
      }

      // Load existing funds for matching (active only)
      const fundsData = await storageRead<{ categories: { id: string; funds: { id: string; name: string; active?: boolean; returnBasis?: string }[] }[] }>(`funds:${clientKey}`, { categories: [] });
      const existingFunds: { id: string; name: string; categoryId: string; returnBasis?: string }[] = [];
      for (const cat of fundsData.categories || []) {
        for (const fund of cat.funds || []) {
          if (fund.active === false) continue;
          existingFunds.push({ id: fund.id, name: fund.name, categoryId: cat.id, returnBasis: fund.returnBasis });
        }
      }

      // Convert file to raw base64 (no data URI prefix)
      const arrayBuffer = await file.arrayBuffer();
      let base64Data = Buffer.from(arrayBuffer).toString("base64");
      // Strip data URI prefix if present (safety guard)
      const prefixMatch = base64Data.match(/^data:[^;]+;base64,/);
      if (prefixMatch) {
        base64Data = base64Data.slice(prefixMatch[0].length);
      }

      // Check file cache — avoid re-processing identical files
      const fileHash = createHash("sha256").update(Buffer.from(arrayBuffer)).digest("hex");
      const cachedResult = await getCachedResult(clientKey, fileHash);
      if (cachedResult) {
        // Record as cached call (0 tokens)
        await recordTokenUsage(clientKey, "parse-file", { input_tokens: 0, output_tokens: 0 }, file.name, true);
        return NextResponse.json({
          ...cachedResult,
          sourceType: file.type.startsWith("image/") ? "image" : "pdf",
          fileName: file.name,
          fromCache: true,
          tokenUsage: { thisCall: 0, cached: true },
        });
      }

      // Check token limit before calling API
      const tokenCheck = await checkTokenLimit(clientKey);
      if (!tokenCheck.allowed) {
        return NextResponse.json({
          error: "חריגת מכסת טוקנים חודשית. פנה למנהל להגדלת המכסה.",
          fileName: file.name,
          tokenUsage: { percent: tokenCheck.percent, used: tokenCheck.usage.inputTokens, limit: tokenCheck.limit },
        }, { status: 429 });
      }

      const systemPrompt = buildSystemPrompt(existingFunds);

      const claudeResult = await callClaudeVision(apiKey, systemPrompt, base64Data, mimeType);
      if (!claudeResult.success) {
        return NextResponse.json({
          error: claudeResult.error,
          fileName: file.name,
        }, { status: 502 });
      }

      // Record token usage
      const updatedUsage = await recordTokenUsage(clientKey, "parse-file", claudeResult.usage, file.name);
      const limits = await getClientTokenLimit(clientKey);
      const usagePercent = Math.round((updatedUsage.inputTokens / limits.monthlyInputTokens) * 100);

      const result = parseCloudeResponse(claudeResult.content, existingFunds);
      if ("error" in result) {
        return NextResponse.json({
          error: result.error,
          fileName: file.name,
        }, { status: 500 });
      }

      let totalInputTokens = claudeResult.usage.input_tokens;

      // DEPRECATED — replaced by single-pass (buildDynamicStructuredPrompt + parseStructuredResponse removed)
      // Single pass with buildSystemPrompt is now the only extraction step.

      // Two-Pass: Raw extraction → deterministic mapping
      try {
        const rawPrompt = buildRawExtractionPrompt();
        const rawResult = await callClaudeVision(apiKey, rawPrompt, base64Data, mimeType);
        if (rawResult.success) {
          totalInputTokens += rawResult.usage.input_tokens;
          const rawContent = rawResult.content;
          const rawMatch = rawContent.match(/\{[\s\S]*\}/);
          if (rawMatch) {
            const rawData = JSON.parse(rawMatch[0]);
            if (rawData.tables && Array.isArray(rawData.tables) && rawData.tables.length > 0) {
              // DEBUG (dev only) — log raw tables from pass-2 AI response
              if (process.env.NODE_ENV === 'development') {
                console.log('RAW_TABLES:', JSON.stringify(rawData.tables, null, 2));
              }
              const mappedEntries = mapRawTablesToFields(rawData.tables as RawTable[]);
              if (mappedEntries.length > 0) {
                // Pass-2.5 — Jan↔Annual swap fix on mapped fields (Pass-1 fix runs on different fields)
                const pass2Corrections: string[] = [];
                for (const entry of mappedEntries) {
                  fixAnnualJanSwapPerYear(entry.fields, pass2Corrections, entry.returnBasis || "");
                  // Per-year month-shift correction
                  const years = [...new Set(
                    entry.fields.flatMap(f => {
                      const m = f.key.match(/^monthlyReturns\.(\d{4})-/);
                      return m ? [m[1]] : [];
                    })
                  )];
                  for (const year of years) {
                    const fixed = fixMonthShiftError(entry.fields, year);
                    const corrField = fixed.find(f => f.key === 'corrections');
                    if (corrField) {
                      pass2Corrections.push(String(corrField.value));
                      entry.fields = fixed.filter(f => f.key !== 'corrections');
                    } else {
                      entry.fields = fixed;
                    }
                  }
                }
                if (pass2Corrections.length > 0) {
                  result.corrections = [...(result.corrections || []), ...pass2Corrections];
                }
                result.dualCurrencyData = mappedEntries.map(e => ({
                  returnBasis: e.returnBasis ?? 'ILS',
                  fields: e.fields,
                  allMonthlyReturns: e.allMonthlyReturns,
                })) as unknown as DualCurrencyEntry[];
                // אם יש טבלה אחת בלבד — עדכן גם את fields הראשי
                if (mappedEntries.length === 1) {
                  result.fields = mappedEntries[0].fields;
                }
                // Pass-3 — ולידציה פנימית: מחושב vs מדווח
                const validations = mappedEntries.map(entry => validateParsedEntry(entry, result.reportMonth ?? null));
                result.validation = validations;
                result.validationStatus = validations.some(v => v.overallStatus === 'error') ? 'error'
                  : validations.some(v => v.overallStatus === 'warning') ? 'warning'
                  : 'valid';
              }
            }
            // Fallback ל-Pass-1: רץ אם Pass-2 לא הצליח לבנות dualCurrencyData
            // (tables ריק, או שלא נמצאו entries לאחר mapping)
            if (!result.dualCurrencyData) {
              const pass1AMR: Record<string, number> = {};
              for (const f of result.fields) {
                const m = f.key?.match(/^monthlyReturns\.(\d{4}-\d{2})$/);
                if (m && typeof f.value === 'number') pass1AMR[m[1]] = f.value;
              }
              // חשב YTD לשנת הדוח מ-compound של חודשים (לא מ-monthlyReturn האחרון)
              const reportYear = result.reportMonth?.slice(0, 4);
              const fallbackFields: ParsedField[] = result.fields.filter(f =>
                // הסר returns.y*/returns.ytd* לשנת הדוח — נחשב מחדש
                !(reportYear && f.key?.match(new RegExp(`^returns\\.(ytd|y)${reportYear}$`)))
              );
              if (reportYear) {
                const yearMonths = Object.keys(pass1AMR)
                  .filter(k => k.startsWith(reportYear + '-'))
                  .sort();
                if (yearMonths.length > 0) {
                  const compound = yearMonths.reduce((acc, k) => acc * (1 + pass1AMR[k]), 1) - 1;
                  fallbackFields.push({
                    key: `returns.ytd${reportYear}`,
                    value: Math.round(compound * 1e8) / 1e8,
                    confidence: 0.8,
                  });
                }
              }
              result.dualCurrencyData = [{
                returnBasis: result.returnBasis ?? 'ILS',
                fields: fallbackFields,
                allMonthlyReturns: pass1AMR,
              }] as unknown as DualCurrencyEntry[];
            }
          }
        }
      } catch (e) {
        console.warn('Raw extraction failed, falling back to pass-1 result:', e);
      }

      // Refresh usage totals
      const finalUsage = await getTokenUsage(clientKey);
      const finalLimits = await getClientTokenLimit(clientKey);
      const finalPercent = Math.round((finalUsage.inputTokens / finalLimits.monthlyInputTokens) * 100);

      // Fallback לשם קרן: אם Pass-1 לא זיהה שם — קח את שם הקובץ ללא סיומת
      if (!result.fundName) {
        result.fundName = file.name.replace(/\.[^.]+$/, '');
      }

      // Cache the result for future duplicate uploads (full format including dual currency)
      const resultObj: Record<string, unknown> = {
        fundName: result.fundName,
        fundNameConfidence: result.fundNameConfidence,
        reportMonth: result.reportMonth,
        reportMonthConfidence: result.reportMonthConfidence,
        returnBasis: result.returnBasis,
        returnBasisOptions: result.returnBasisOptions,
        fields: result.fields,
        match: result.match,
      };
      if (result.dualCurrencyData) {
        resultObj.dualCurrencyData = result.dualCurrencyData;
      }
      if (result.corrections) {
        resultObj.corrections = result.corrections;
      }
      if (result.validation) {
        resultObj.validation = result.validation;
        resultObj.validationStatus = result.validationStatus;
      }
      resultObj._cacheVersion = 47;
      await setCachedResult(clientKey, fileHash, resultObj);

      return NextResponse.json({
        ...result,
        sourceType: file.type.startsWith("image/") ? "image" : "pdf",
        fileName: file.name,
        reportMonth: result.reportMonth,
        reportMonthConfidence: result.reportMonthConfidence,
        tokenUsage: {
          thisCall: totalInputTokens,
          monthlyUsed: finalUsage.inputTokens,
          monthlyLimit: finalLimits.monthlyInputTokens,
          percent: finalPercent,
          warning: finalPercent >= WARN_THRESHOLD_PERCENT,
        },
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("POST /api/parse error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
