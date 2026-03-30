import { NextRequest, NextResponse } from "next/server";
import { getClientKeyFromRequest } from "@/lib/clientKey";
import { storageRead, storageWrite, storageAppend } from "@/lib/storage";
import { ParseDraft, ParseLogEntry, ParsedField } from "@/lib/parseTypes";

const SUPER_ADMIN_PASSWORD = "super2026";
const DEFAULT_ADMIN_PASSWORD = "admin2026";

// Allowed field key patterns (whitelist validation)
const ALLOWED_FIELD_KEYS = new Set([
  "monthlyReturn",
  "manager",
  "classification",
  "returns.ytd2026",
  "returns.y2025",
  "returns.y2024",
  "returns.y2023",
  "returns.y2022",
  "returns.y2021",
  "returns.y2020",
  "returns.y2019",
]);

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
    const key = String(field.key || "");

    // Whitelist check
    if (!ALLOWED_FIELD_KEYS.has(key)) continue;

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
  return result;
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
async function callClaude(apiKey: string, systemPrompt: string, userText: string): Promise<{ success: true; content: string } | { success: false; error: string }> {
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
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: "user", content: userText }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text().catch(() => "Unknown error");
        console.error(`Claude API error (attempt ${attempt}):`, errText);
        if (attempt < maxAttempts) continue; // retry
        return { success: false, error: `AI service error (${response.status})` };
      }

      const result = await response.json();
      const content = result.content?.[0]?.text || "";
      if (!content) {
        if (attempt < maxAttempts) continue;
        return { success: false, error: "Empty response from AI" };
      }

      return { success: true, content };
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
  mediaType: string
): Promise<{ success: true; content: string } | { success: false; error: string }> {
  const maxAttempts = 2;
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
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64Data,
                },
              },
              {
                type: "text",
                text: "Extract fund performance data from this document. Return valid JSON only.",
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
      if (!content) {
        if (attempt < maxAttempts) continue;
        return { success: false, error: "Empty response from AI" };
      }

      return { success: true, content };
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
function buildSystemPrompt(existingFunds: { id: string; name: string }[]): string {
  return `You are a financial data extraction assistant for an Israeli fund tracking system.
Extract fund performance data from the provided Hebrew or English text or document.

RULES:
- Extract ONLY factual data explicitly stated in the text/document
- Do NOT infer, calculate, or estimate any values
- All return values should be decimal numbers (e.g., 5.2% → 0.052)
- Fund name must be extracted in its original language
- If a field is not clearly present, omit it

FIELDS TO EXTRACT (only these):
- fundName: string (the fund's name as written)
- monthlyReturn: number | null (latest monthly return as decimal)
- manager: string | null (fund manager name)
- classification: string | null (fund type/classification)
- returns: object with year keys like "y2024", "y2023", etc. (annual returns as decimals)
- ytd2026: number | null (year-to-date return for 2026)

EXISTING FUNDS IN SYSTEM (for matching):
${existingFunds.map((f) => `- "${f.name}" (id: ${f.id})`).join("\n")}

Respond in valid JSON with this exact structure:
{
  "fundName": "...",
  "fundNameConfidence": 0.0-1.0,
  "fields": [
    { "key": "monthlyReturn", "value": ..., "confidence": 0.0-1.0 },
    { "key": "returns.y2024", "value": ..., "confidence": 0.0-1.0 },
    ...
  ],
  "suggestedMatch": {
    "fundId": "..." or null,
    "fundName": "..." or null,
    "similarity": 0.0-1.0
  }
}`;
}

/** Parse Claude response JSON → structured result */
function parseCloudeResponse(
  content: string,
  existingFunds: { id: string; name: string; categoryId: string }[]
): {
  fundName: string;
  fundNameConfidence: number;
  fields: ParsedField[];
  match: { fundId: string; fundName: string; similarity: number; categoryId: string | null } | null;
} | { error: string } {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { error: "Could not parse AI response — invalid JSON" };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return { error: "Could not parse AI response — malformed JSON" };
  }

  const sanitizedFields = sanitizeFields(parsed.fields as unknown[]);

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

  return {
    fundName: String(parsed.fundName || ""),
    fundNameConfidence: normalizeConfidence(parsed.fundNameConfidence),
    fields: sanitizedFields,
    match,
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
      return NextResponse.json(drafts);
    }

    if (action === "log") {
      const log = await storageRead<ParseLogEntry[]>(`parse-log:${clientKey}`, []);
      return NextResponse.json(log);
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

      // Load existing fund names for matching context
      const fundsData = await storageRead<{ categories: { id: string; funds: { id: string; name: string }[] }[] }>(`funds:${clientKey}`, { categories: [] });
      const existingFunds: { id: string; name: string; categoryId: string }[] = [];
      for (const cat of fundsData.categories || []) {
        for (const fund of cat.funds || []) {
          existingFunds.push({ id: fund.id, name: fund.name, categoryId: cat.id });
        }
      }

      const systemPrompt = buildSystemPrompt(existingFunds);

      const claudeResult = await callClaude(apiKey, systemPrompt, text);
      if (!claudeResult.success) {
        return NextResponse.json({ error: claudeResult.error }, { status: 502 });
      }

      const result = parseCloudeResponse(claudeResult.content, existingFunds);
      if ("error" in result) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }

      return NextResponse.json(result);
    }

    // ============================================================
    // ACTION: save-draft — Save parsed result as pending draft
    // ============================================================
    if (action === "save-draft") {
      const body = await req.json();

      // Sanitize fields before saving
      const sanitizedFields = sanitizeFields(body.fields || []);

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
        match: body.match || null,
        status: "pending",
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
    // ACTION: apply — Apply draft fields to fund in funds.json
    // ============================================================
    if (action === "apply") {
      const body = await req.json();
      const { draftId, fundId, categoryId, approvedFields } = body;

      if (!draftId || !fundId || !categoryId || !approvedFields) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }

      // Re-sanitize approved fields against whitelist
      const validFields = sanitizeFields(approvedFields);

      if (validFields.length === 0) {
        return NextResponse.json({ error: "No valid fields to apply" }, { status: 400 });
      }

      // Load funds data
      const fundsData = await storageRead<Record<string, unknown>>(`funds:${clientKey}`, { categories: [] });

      // Find the fund
      let fundFound = false;
      const appliedFieldNames: string[] = [];

      for (const cat of (fundsData.categories as Record<string, unknown>[]) || []) {
        if (cat.id !== categoryId) continue;
        const funds = cat.funds as Record<string, unknown>[];
        for (let i = 0; i < funds.length; i++) {
          if (funds[i].id !== fundId) continue;
          fundFound = true;

          // Apply whitelisted fields only
          for (const field of validFields) {
            if (field.key === "monthlyReturn") {
              funds[i].monthlyReturn = field.value as number;
              // Sync to monthlyReturns history
              if (field.value !== null && fundsData.lastUpdated) {
                const monthKey = (fundsData.lastUpdated as string).slice(0, 7);
                if (!funds[i].monthlyReturns) funds[i].monthlyReturns = {};
                (funds[i].monthlyReturns as Record<string, number>)[monthKey] = field.value as number;
              }
              appliedFieldNames.push("monthlyReturn");
            } else if (field.key.startsWith("returns.")) {
              const yearKey = field.key.split(".")[1]; // "y2024"
              const returns = funds[i].returns as Record<string, unknown>;
              if (yearKey && returns.hasOwnProperty(yearKey)) {
                returns[yearKey] = field.value as number;
                appliedFieldNames.push(field.key);
              }
            } else if (field.key === "manager") {
              funds[i].manager = field.value as string;
              appliedFieldNames.push("manager");
            } else if (field.key === "classification") {
              funds[i].classification = field.value as string;
              appliedFieldNames.push("classification");
            }
          }
          break;
        }
        if (fundFound) break;
      }

      if (!fundFound) {
        return NextResponse.json({ error: "Fund not found" }, { status: 404 });
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

      // Log with detailed field info
      await storageAppend<ParseLogEntry>(`parse-log:${clientKey}`, {
        id: generateId(),
        timestamp: new Date().toISOString(),
        action: "apply",
        draftId,
        fundName: draftFundName,
        fundId,
        details: `Applied ${appliedFieldNames.length} fields to fund: ${appliedFieldNames.join(", ")}. Values: ${validFields.map((f) => `${f.key}=${f.value}`).join(", ")}`,
      });

      return NextResponse.json({ success: true, appliedFields: appliedFieldNames.length });
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

      // Load existing funds for matching
      const fundsData = await storageRead<{ categories: { id: string; funds: { id: string; name: string }[] }[] }>(`funds:${clientKey}`, { categories: [] });
      const existingFunds: { id: string; name: string; categoryId: string }[] = [];
      for (const cat of fundsData.categories || []) {
        for (const fund of cat.funds || []) {
          existingFunds.push({ id: fund.id, name: fund.name, categoryId: cat.id });
        }
      }

      // Convert file to base64
      const arrayBuffer = await file.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString("base64");

      const systemPrompt = buildSystemPrompt(existingFunds);

      // For PDFs, Claude Vision accepts them as images with application/pdf mime type
      const claudeResult = await callClaudeVision(apiKey, systemPrompt, base64Data, mimeType);
      if (!claudeResult.success) {
        return NextResponse.json({
          error: claudeResult.error,
          fileName: file.name,
        }, { status: 502 });
      }

      const result = parseCloudeResponse(claudeResult.content, existingFunds);
      if ("error" in result) {
        return NextResponse.json({
          error: result.error,
          fileName: file.name,
        }, { status: 500 });
      }

      return NextResponse.json({
        ...result,
        sourceType: file.type.startsWith("image/") ? "image" : "pdf",
        fileName: file.name,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("POST /api/parse error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
