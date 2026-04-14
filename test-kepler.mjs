/**
 * Standalone test script — Pass-1 raw extraction for Kepler PDF
 * Run: node test-kepler.mjs
 *
 * Sends KEPLER.pdf directly to Anthropic Vision API with buildRawExtractionPrompt().
 * Logs the full AI response and specifically the 2026 row cells.
 * NO production code changes — read-only investigation.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ── Config ──────────────────────────────────────────────────────────────────
const PDF_PATH = resolve(
  "C:/Users/Agam/Desktop/איתן/דוחות מרץ/KEPLER.pdf"
);
const API_KEY = "ANTHROPIC_API_KEY_HERE";
const MODEL   = "claude-sonnet-4-5"; // correct model — NOT the broken v45 "claude-sonnet-4-20250514"

// ── Pass-1 Prompt (exact copy of buildRawExtractionPrompt) ──────────────────
const PASS1_PROMPT = `You are a table reader. Your only job is to describe what you see in the document.

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

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  Kepler Pass-1 Test — Raw Extraction");
  console.log("═══════════════════════════════════════════════\n");

  // 1. Read PDF
  console.log(`📄 Reading: ${PDF_PATH}`);
  const pdfBuffer = readFileSync(PDF_PATH);
  const base64 = pdfBuffer.toString("base64");
  console.log(`   Size: ${(pdfBuffer.length / 1024).toFixed(1)} KB  |  Base64 length: ${base64.length.toLocaleString()}\n`);

  // 2. Call Anthropic Vision API
  console.log(`🤖 Calling ${MODEL} (Pass-1 raw extraction)...`);
  const startMs = Date.now();

  const response = await fetch("https://api.anthropic.com/v1/messages", {
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
      system: PASS1_PROMPT,
      messages: [{
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          },
          {
            type: "text",
            text: "Extract fund performance data from this document. Return valid JSON only.",
          },
        ],
      }],
    }),
  });

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

  if (!response.ok) {
    const errText = await response.text();
    console.error(`\n❌ API Error ${response.status}:`);
    console.error(errText);
    process.exit(1);
  }

  const result = await response.json();
  const content = result.content?.[0]?.text || "";
  const usage = result.usage || {};

  console.log(`   ✅ Done in ${elapsed}s`);
  console.log(`   Tokens: ${usage.input_tokens?.toLocaleString()} in / ${usage.output_tokens?.toLocaleString()} out\n`);

  // 3. Parse JSON from response
  console.log("═══════════════════════════════════════════════");
  console.log("  RAW AI RESPONSE (full)");
  console.log("═══════════════════════════════════════════════");
  console.log(content);
  console.log("\n");

  // 4. Try to parse and show structured breakdown
  console.log("═══════════════════════════════════════════════");
  console.log("  PARSED BREAKDOWN");
  console.log("═══════════════════════════════════════════════\n");

  let parsed;
  try {
    // Extract JSON from possible markdown fences
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                      content.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;
    parsed = JSON.parse(jsonStr.trim());
  } catch (e) {
    console.error("❌ Failed to parse JSON from response:", e.message);
    process.exit(1);
  }

  const tables = parsed.tables || [];
  console.log(`Tables found: ${tables.length}\n`);

  tables.forEach((table, ti) => {
    console.log(`── Table ${ti + 1} ──────────────────────────────────`);
    console.log(`   currency_label : ${JSON.stringify(table.currency_label)}`);
    console.log(`   table_label    : ${JSON.stringify(table.table_label)}`);
    console.log(`   headers        : ${JSON.stringify(table.headers)}`);
    console.log(`   rows count     : ${table.rows?.length ?? 0}\n`);

    const rows = table.rows || [];
    rows.forEach(row => {
      const is2026 = row.year === "2026";
      const prefix = is2026 ? "   🔍 2026 ROW →" : "      ";
      console.log(`${prefix} year=${row.year}  cells(${row.cells?.length})= ${JSON.stringify(row.cells)}`);
    });
    console.log();
  });

  // 5. Focused 2026 analysis
  console.log("═══════════════════════════════════════════════");
  console.log("  2026 ROW ANALYSIS (per table)");
  console.log("═══════════════════════════════════════════════\n");

  tables.forEach((table, ti) => {
    const row2026 = (table.rows || []).find(r => r.year === "2026");
    if (!row2026) {
      console.log(`Table ${ti + 1}: ⚠️  No 2026 row found`);
      return;
    }

    const headers = table.headers || [];
    const cells   = row2026.cells || [];

    console.log(`Table ${ti + 1} — currency: ${table.currency_label ?? "null"}`);
    console.log(`  Headers (${headers.length}): ${JSON.stringify(headers)}`);
    console.log(`  Cells   (${cells.length}):`);

    headers.forEach((h, i) => {
      const val = cells[i];
      const valStr = val === null || val === undefined ? "NULL" : JSON.stringify(val);
      console.log(`    [${i}] "${h}" → ${valStr}`);
    });

    // Count non-null cells (excluding index 0 if YTD)
    const nonNull = cells.filter(c => c !== null && c !== undefined && c !== "").length;
    console.log(`\n  Non-null cells: ${nonNull} / ${cells.length}`);
    console.log(`  Expected for March 2026 report: YTD + Jan + Feb + Mar = 4 values\n`);
  });
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
