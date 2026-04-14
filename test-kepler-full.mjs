/**
 * Full pipeline test — Pass-1 (buildSystemPrompt) + Pass-2 (buildRawExtractionPrompt) for Kepler
 * Run: node test-kepler-full.mjs
 *
 * Tests BOTH passes to identify exactly where 2026 data is lost.
 * NO production code changes.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const PDF_PATH = resolve("C:/Users/Agam/Desktop/איתן/דוחות מרץ/KEPLER.pdf");
const API_KEY  = "ANTHROPIC_API_KEY_HERE";
const MODEL    = "claude-sonnet-4-5";

// ── Pass-1 System Prompt (simplified — no fund list) ──────────────────────────
const PASS1_SYSTEM = `You are a financial data extraction assistant for an Israeli fund tracking system.
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
  ANNUAL RETURN COLUMNS:
  - "שנתי" or "שנתית" or "Annual" → annual return
  - "YTD" or "מצטבר" or "מתחילת השנה" → annual return
  MONTH COLUMNS:
  - "ינו" or "ינואר" or "Jan" → month 01
  - "פבר" or "פברואר" or "Feb" → month 02
  - "מרץ" or "Mar" → month 03
  (etc. for all 12 months)
STEP 3 — READ ROWS BY MAPPING: For each data row, read by column label, NOT by position.
STEP 4 — VALIDATE: NEVER confuse January with annual.

- reportMonth: detect from document HEADER/TITLE/DATE first. If not found, use the LATEST month with data in the current year row.
  Examples: "מרץ 2026" → "2026-03", "03/2026" → "2026-03"
- allMonthlyReturns: object with YYYY-MM keys, decimal values. Extract ALL months from ALL years.
  CRITICAL: Extract EVERY month. Do NOT limit to the last 12 months.

Respond in valid JSON:
{
  "fundName": "...",
  "reportMonth": "YYYY-MM" or null,
  "reportMonthConfidence": "high" or "low",
  "returnBasis": "ILS" or "USD" or null,
  "allMonthlyReturns": { "2026-01": 0.0222, "2026-02": -0.0149, ... },
  "fields": [
    { "key": "returns.y2025", "value": 0.3653, "confidence": 0.95 },
    { "key": "returns.ytd2026", "value": -0.0441, "confidence": 0.95 }
  ]
}`;

// ── Pass-2 System Prompt (exact copy of buildRawExtractionPrompt) ─────────────
const PASS2_SYSTEM = `You are a table reader. Your only job is to describe what you see in the document.

Find ALL performance tables in this document.

For each table return:
{
  "currency_label": "the exact currency text near this table",
  "table_label": "the name/label of the fund this table belongs to, or null",
  "headers": ["every column header exactly as written, from RIGHT to LEFT"],
  "rows": [
    { "year": "the 4-digit year", "cells": ["cell values from RIGHT to LEFT"] }
  ]
}

Return JSON: { "tables": [...] }

STEP 1 — IDENTIFY THE YEAR COLUMN: find the column where every cell is a 4-digit year. Use as "year" field. Do NOT include in headers/cells.
STEP 2 — DETERMINE TABLE DIRECTION: year on RIGHT → RTL; year on LEFT → LTR.
STEP 3 — READ HEADERS: copy exactly, excluding year column.
STEP 4 — READ CELLS (CRITICAL partial rows):
- Each cell MUST match its header position EXACTLY.
- Missing months → null. NEVER shift values to fill gaps.
- Example headers [שנתי, דצמ, נוב, ..., מרץ, פבר, ינו], 2026 only has jan/feb/mar:
  cells = [ytd, null, null, ..., mar, feb, jan]
  NEVER: cells = [ytd, mar, feb, jan, null, null, ...]
STEP 5 — COLUMN TYPES: month columns → monthly returns; שנתי/annual → yearly; ITD/מהקמה → IGNORE.
STEP 6 — NEGATIVE: "-5.3%" → "-5.3"; "(5.3%)" → "-5.3"; empty → null.
RULES: Extract ONLY the fund's rows. IGNORE benchmark/index rows. Return ONLY valid JSON.`;

// ── API call helper ────────────────────────────────────────────────────────────
async function callAPI(systemPrompt, base64, label) {
  console.log(`\n🤖 Calling ${MODEL} — ${label}...`);
  const t0 = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16384,
      temperature: 0,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: "Extract fund performance data. Return valid JSON only." },
        ],
      }],
    }),
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  if (!res.ok) {
    const err = await res.text();
    console.error(`  ❌ API Error ${res.status}: ${err}`);
    return null;
  }
  const result = await res.json();
  const content = result.content?.[0]?.text || "";
  const usage = result.usage || {};
  console.log(`  ✅ ${elapsed}s | tokens: ${usage.input_tokens?.toLocaleString()} in / ${usage.output_tokens?.toLocaleString()} out`);
  return content;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const buf = readFileSync(PDF_PATH);
  const b64 = buf.toString("base64");
  console.log(`📄 ${PDF_PATH.split("/").pop()} — ${(buf.length/1024).toFixed(1)} KB\n`);

  // ── PASS 1 ──────────────────────────────────────────────────────────────────
  const pass1Raw = await callAPI(PASS1_SYSTEM, b64, "Pass-1 (buildSystemPrompt)");
  if (pass1Raw) {
    console.log("\n=== PASS-1 RAW RESPONSE ===");
    console.log(pass1Raw);

    try {
      const jm = pass1Raw.match(/```(?:json)?\s*([\s\S]*?)```/) || pass1Raw.match(/(\{[\s\S]*\})/);
      const p = JSON.parse((jm ? jm[1] : pass1Raw).trim());

      console.log("\n=== PASS-1 PARSED ===");
      console.log(`reportMonth        : ${p.reportMonth}`);
      console.log(`reportMonthConfidence: ${p.reportMonthConfidence}`);
      console.log(`returnBasis        : ${p.returnBasis}`);

      // Show allMonthlyReturns for 2026
      const amr = p.allMonthlyReturns || {};
      const months2026 = Object.entries(amr).filter(([k]) => k.startsWith("2026")).sort();
      console.log(`\nallMonthlyReturns 2026 (${months2026.length} months):`);
      if (months2026.length === 0) {
        console.log("  ⚠️  NONE — Pass-1 did not extract any 2026 monthly values!");
      } else {
        months2026.forEach(([k, v]) => console.log(`  ${k} → ${v}`));
      }

      // Show returns fields
      const retFields = (p.fields || []).filter(f => f.key?.startsWith("returns."));
      console.log(`\nreturns fields (${retFields.length}):`);
      retFields.forEach(f => console.log(`  ${f.key} = ${f.value}`));

    } catch (e) {
      console.error("  ❌ JSON parse failed:", e.message);
    }
  }

  // ── PASS 2 ──────────────────────────────────────────────────────────────────
  const pass2Raw = await callAPI(PASS2_SYSTEM, b64, "Pass-2 (buildRawExtractionPrompt)");
  if (pass2Raw) {
    try {
      const jm = pass2Raw.match(/```(?:json)?\s*([\s\S]*?)```/) || pass2Raw.match(/(\{[\s\S]*\})/);
      const p = JSON.parse((jm ? jm[1] : pass2Raw).trim());

      console.log("\n=== PASS-2 PARSED ===");
      console.log(`Tables found: ${p.tables?.length}`);

      (p.tables || []).forEach((t, i) => {
        console.log(`\n  Table ${i+1}: label="${t.table_label}" currency="${t.currency_label}"`);
        const r2026 = (t.rows || []).find(r => r.year === "2026");
        if (!r2026) {
          console.log("  ⚠️  No 2026 row found in this table!");
          return;
        }
        const headers = t.headers || [];
        const cells = r2026.cells || [];
        const nonNull = cells.filter(c => c !== null && c !== undefined && c !== "").length;
        console.log(`  2026 row — ${nonNull}/${cells.length} non-null cells`);
        headers.forEach((h, idx) => {
          const v = cells[idx];
          if (v !== null && v !== undefined && v !== "") {
            console.log(`    [${idx}] "${h}" → ${v}`);
          }
        });
        if (nonNull < 3) {
          console.log(`  ⚠️  Expected 4 (ytd+jan+feb+mar) but got ${nonNull} — THIS IS THE BUG`);
        } else {
          console.log(`  ✅ 2026 row correctly extracted (${nonNull} values)`);
        }
      });

    } catch (e) {
      console.error("  ❌ JSON parse failed:", e.message);
      console.log(pass2Raw.slice(0, 500));
    }
  }

  console.log("\n═══ DIAGNOSIS ═══");
  console.log("If Pass-1 has 0 2026 monthly values AND Pass-2 has 3-4 → issue is in mappedEntries.length check");
  console.log("If Pass-2 also has <3 values → AI extraction issue, need to improve prompt or re-run");
  console.log("If both have 3+ values → issue is in fixAnnualJanSwapPerYear or fixMonthShiftError");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
