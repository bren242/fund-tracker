import { NextRequest, NextResponse } from "next/server";
import { getClientKeyFromRequest } from "@/lib/clientKey";
import { storageRead, storageWrite, storageAppend } from "@/lib/storage";
import { ParseDraft, ParseLogEntry, ParsedField, APPLY_WHITELIST } from "@/lib/parseTypes";

const SUPER_ADMIN_PASSWORD = "super2026";
const DEFAULT_ADMIN_PASSWORD = "admin2026";

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

/**
 * POST /api/parse?action=parse — Parse text via Claude API
 * POST /api/parse?action=save-draft — Save parsed result as draft
 * POST /api/parse?action=apply — Apply draft to fund
 * POST /api/parse?action=reject — Reject a draft
 * GET  /api/parse?action=drafts — List all drafts
 * GET  /api/parse?action=log — Get audit log
 */
export async function GET(req: NextRequest) {
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
}

export async function POST(req: NextRequest) {
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
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    // Load existing fund names for matching context
    const fundsData = await storageRead<{ categories: { id: string; funds: { id: string; name: string }[] }[] }>(`funds:${clientKey}`, { categories: [] });
    const existingFunds: { id: string; name: string; categoryId: string }[] = [];
    for (const cat of fundsData.categories || []) {
      for (const fund of cat.funds || []) {
        existingFunds.push({ id: fund.id, name: fund.name, categoryId: cat.id });
      }
    }

    const systemPrompt = `You are a financial data extraction assistant for an Israeli fund tracking system.
Extract fund performance data from the provided Hebrew or English text.

RULES:
- Extract ONLY factual data explicitly stated in the text
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

    try {
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
          messages: [{ role: "user", content: text }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error("Claude API error:", err);
        return NextResponse.json({ error: "AI service error" }, { status: 502 });
      }

      const result = await response.json();
      const content = result.content?.[0]?.text || "";

      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return NextResponse.json({ error: "Could not parse AI response" }, { status: 500 });
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Build match info
      let match = null;
      if (parsed.suggestedMatch?.fundId) {
        const matchedFund = existingFunds.find((f) => f.id === parsed.suggestedMatch.fundId);
        match = {
          fundId: parsed.suggestedMatch.fundId,
          fundName: matchedFund?.name || parsed.suggestedMatch.fundName,
          similarity: parsed.suggestedMatch.similarity || 0,
          categoryId: matchedFund?.categoryId || null,
        };
      }

      return NextResponse.json({
        fundName: parsed.fundName || "",
        fundNameConfidence: parsed.fundNameConfidence || 0,
        fields: parsed.fields || [],
        match,
      });
    } catch (err) {
      console.error("Parse error:", err);
      return NextResponse.json({ error: "Failed to parse text" }, { status: 500 });
    }
  }

  // ============================================================
  // ACTION: save-draft — Save parsed result as pending draft
  // ============================================================
  if (action === "save-draft") {
    const body = await req.json();
    const draft: ParseDraft = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      source: {
        type: "text",
        preview: (body.sourceText || "").slice(0, 200),
      },
      extracted: {
        fundName: body.fundName || "",
        fundNameConfidence: body.fundNameConfidence || 0,
        fields: body.fields || [],
      },
      match: body.match || null,
      status: "pending",
    };

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
      details: `Parsed text (${draft.source.preview.length} chars preview). ${draft.extracted.fields.length} fields extracted.`,
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

    // Validate approved fields against whitelist
    const validFields: ParsedField[] = [];
    for (const field of approvedFields as ParsedField[]) {
      const baseKey = field.key.split(".")[0]; // "returns.y2024" → "returns"
      if ((APPLY_WHITELIST as readonly string[]).includes(baseKey)) {
        validFields.push(field);
      }
    }

    if (validFields.length === 0) {
      return NextResponse.json({ error: "No valid fields to apply" }, { status: 400 });
    }

    // Load funds data
    const fundsData = await storageRead<Record<string, unknown>>(`funds:${clientKey}`, { categories: [] });

    // Find the fund
    let fundFound = false;
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
          } else if (field.key.startsWith("returns.")) {
            const yearKey = field.key.split(".")[1]; // "y2024"
            const returns = funds[i].returns as Record<string, unknown>;
            if (yearKey && returns.hasOwnProperty(yearKey)) {
              returns[yearKey] = field.value as number;
            }
          } else if (field.key === "manager") {
            funds[i].manager = field.value as string;
          } else if (field.key === "classification") {
            funds[i].classification = field.value as string;
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
    if (draftIdx >= 0) {
      drafts[draftIdx].status = "applied";
      drafts[draftIdx].appliedAt = new Date().toISOString();
      await storageWrite(`parse-drafts:${clientKey}`, drafts);
    }

    // Log
    await storageAppend<ParseLogEntry>(`parse-log:${clientKey}`, {
      id: generateId(),
      timestamp: new Date().toISOString(),
      action: "apply",
      draftId,
      fundName: drafts[draftIdx]?.extracted.fundName || "",
      fundId,
      details: `Applied ${validFields.length} fields: ${validFields.map((f) => f.key).join(", ")}`,
    });

    return NextResponse.json({ success: true, appliedFields: validFields.length });
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
      details: "Draft rejected by admin",
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
