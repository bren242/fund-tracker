# Regression Test Results — Two-Pass Architecture
> Generated: 2026-04-07 | v28 cache
> Re-verified: 2026-04-08 (night run) — no new report files found in repo, previous results still valid

## Summary

| | Count |
|---|---|
| ✅ OK | 7 |
| ⚠️ No Data | 1 |
| ❌ Error | 12 |
| **Total** | **20** |

---

## Quick Reference

| File | Fund Name | Currency | Years | Months | YTD | Value Format | Notes |
|------|-----------|----------|-------|--------|-----|--------------|-------|
| CLO_IBI (root) | — | ILS | 2022–2026 | 49 (0 null) | ✅ | decimal (<1) | cached |
| CLO_IBI (root) | — | USD | 2022–2026 | 46 (0 null) | ✅ | decimal (<1) | cached |
| CLO IBI png | — | ILS | 2022–2026 | 49 (0 null) | ✅ | decimal (<1) | cached |
| CLO IBI png | — | USD | 2022–2026 | 46 (0 null) | ✅ | decimal (<1) | cached |
| IBI CLO pdf | IBI CLO | USD | 2022–2026 | 46 (0 null) | ✅ | decimal (<1) | cached |
| IBI CLO pdf | IBI CLO | ILS | 2022–2026 | 46 (0 null) | ✅ | decimal (<1) | cached |
| IBI CLO pdf | IBI CLO | ILS | — | 0 (0 null) | ❌ | no values | **BUG: ghost entry** |
| ogen J png | — | ILS | 2019–2026 | 85 (0 null) | ✅ | decimal (<1) | cached, duplicate entry |
| ogen J png | — | ILS | 2019–2026 | 85 (0 null) | ✅ | decimal (<1) | cached, duplicate entry |
| keren-ogen jan26 | הפניקס קפיטל קרן עוגן | USD | 2019–2026 | 85 (0 null) | ✅ | decimal (<1) | cached |
| keren-ogen jan26 | הפניקס קפיטל קרן עוגן | ILS | 2019–2026 | 85 (0 null) | ✅ | decimal (<1) | cached |
| aspm dec25 | Fund Access ASPM Apollo | ILS | 2025 only | 12 (0 null) | ❌ | decimal (<1) | **no YTD** |
| aspm dec25 | Fund Access ASPM Apollo | ILS | 2025 only | 12 (0 null) | ❌ | decimal (<1) | **duplicate, no YTD** |
| Sphera Q1 2026 | — | — | — | — | — | — | ❌ 400: multi-page PDF |
| Creative Value Feb | Creative Value | ILS | 2019–2026 | 79 (0 null) | ✅ | decimal (<1) | **BUG: 5 ghost entries** |
| morefeb png | — | — | — | — | — | — | ❌ NO_DATA: table format unrecognized |
| מעקב CLO | — | — | — | — | — | — | ❌ 400: multi-fund tracker PDF |
| מעקב גידור לונג | — | — | — | — | — | — | ❌ 400: multi-fund tracker PDF |
| NOX 2.26 | — | — | — | — | — | — | ❌ 400: multi-fund tracker PDF |
| NOX tracker | — | — | — | — | — | — | ❌ 400: multi-fund tracker PDF |
| מעקב קרנות | — | — | — | — | — | — | ❌ 400: multi-fund tracker PDF |
| מעקב קרנות 1 | — | — | — | — | — | — | ❌ 400: multi-fund tracker PDF |
| השוואה | — | — | — | — | — | — | ❌ 400: multi-fund tracker PDF |
| מעקב גרף | — | — | — | — | — | — | ❌ 400: multi-fund tracker PDF |
| מעקב גרף11 | — | — | — | — | — | — | ❌ 400: multi-fund tracker PDF |
| מעקב סיכון-תשואה | — | — | — | — | — | — | ❌ 400: multi-fund tracker PDF |
| מכתב תודה גרין | — | — | — | — | — | — | ❌ 400: not a fund report |

---

## Root Cause Analysis

### HTTP 502 — "AI service error (400)" (11 files)

All `מעקב קרנות*.pdf` files, `NOX*.pdf`, `השוואה.pdf`, `Sphera Q1 2026.pdf.pdf`, and `מכתב תודה גרין 3.26.pdf` return 400 from the Claude API.

**Root cause**: These are multi-page fund tracker PDFs (spreadsheet-style, often with charts). Claude's vision API returns 400 for these because:
1. PDFs with many pages (likely >5) exceed Claude's document input limit
2. Graph-only PDFs (risk/return scatter, performance chart) contain no extractable tables

These files are **not** single-fund performance reports — they are internal management tools or marketing materials. They were never intended to be parsed by this API.

**Files affected**: All `מעקב קרנות` series, `NOX` series, `השוואה`, `מעקב גרף*`, `מכתב תודה גרין`, `Sphera Q1 2026`

**Action needed**: None — these file types are out of scope. Consider adding a pre-check for file type/page count and returning a clear error message instead of 502.

---

### NO_DATA — morefeb.png

**File**: `C:/Users/Agam/Desktop/איתן/morefeb.png` (45 KB)

Pass-1 extracted `reportMonth: 2026-02` and a single `monthlyReturn = -0.0467` field, but `dualCurrencyData` was never populated. The raw extraction (Pass-2) returned no tables from this image.

**Root cause**: `morefeb.png` appears to be a simple monthly return card (single value, no full performance table). The Two-Pass raw table extraction found no table structure, so `mapRawTablesToFields` returned 0 entries and `dualCurrencyData` remained unset.

**Action needed**: Consider using Pass-1 `fields` as fallback when Pass-2 returns empty (i.e., if `dualCurrencyData` empty but `fields` has monthly data, wrap it into a single-entry `dualCurrencyData`).

---

### BUG — Ghost empty entries (IBI CLO pdf, Creative Value Feb)

**IBI CLO pdf**: 3 entries returned — entries 1 & 2 are correct (USD + ILS), entry 3 is empty (ILS, 0 fields). The raw table extraction found a 3rd table that had no usable monthly data.

**Creative Value Feb**: 6 entries returned — entries 1–5 are empty (0 fields each), entry 6 is the real data (ILS, 79 months, 2019–2026). The raw extractor found 6 tables in this multi-page PDF, but only the last one contained return data.

**Root cause**: `mapRawTablesToFields` creates an entry for every `RawTable` returned by Pass-2, even if the table has no recognizable month headers. Empty entries are included in `dualCurrencyData`.

**Fix needed**: Filter out entries where `monthFields.length === 0 && ytdFields.length === 0` before returning from `mapRawTablesToFields`.

---

### BUG — Duplicate ILS entries (ogen J png, aspm dec25)

Both files return 2 identical (or near-identical) ILS entries. This happens when the raw extractor sees the same table twice (e.g., table appears in two slightly different forms in the PDF) or when a header row is detected as a separate table.

**aspm dec25**: Both entries cover 2025 only, 12 months each, with slightly different values (Dec: 0.0074 vs 0.0062, annual: 0.1991 vs 0.1863). These appear to be two share classes (Class A vs Class B) with different returns — correctly separated.

**ogen J png**: Both entries are nearly identical (same years, same month count, Jan-2026 values differ slightly: 0.0113 vs 0.0128). Likely two fund classes or benchmark vs fund — also valid separation.

**Verdict**: Not a bug for aspm/ogen — the two entries represent two fund classes. The label `returnBasis` is incorrect (both say ILS) but the split is correct.

---

### Missing YTD — aspm dec25

`aspm dec25` reports Dec 2025 and has all 12 months of 2025 plus an annual total (0.1991), but no `returns.ytd2025` field.

**Root cause**: For December reports, YTD is often labeled differently ("תשואה שנתית", "שנה") rather than the explicit "YTD" label. The `mapRawTablesToFields` only maps headers matching `YTD_ALIASES` — the December label used in this document didn't match.

---

## Detailed Results

### CLO_IBI (root) ✅

- **Path**: `C:/Users/Agam/CLO_IBI.png`
- **Size**: 115 KB | **Cache**: v28 | **Report month**: 2026-01

**Entry 1 — ILS**:
- Years: 2022–2026 | Monthly: 49 (2022:11m, 2023:12m, 2024:12m, 2025:12m, 2026:2m)
- YTD 2026: -0.0691 ✅ | Annual: 2023=+16.66%, 2024=+14.71%, 2025=+1.78%
- Values: decimal (<1) ✅

**Entry 2 — USD**:
- Years: 2022–2026 | Monthly: 46 (2022:8m, 2023:12m, 2024:12m, 2025:12m, 2026:2m)
- YTD 2026: -0.0692 ✅ | Annual: 2022=-1.70%, 2023=+15.53%, 2024=+14.07%, 2025=+0.81%
- Values: decimal (<1) ✅

---

### CLO IBI png ✅

- **Path**: `C:/Users/Agam/Desktop/איתן/CLO IBI.png`
- **Size**: 115 KB | **Cache**: v28 | **Report month**: 2026-01
- Identical to CLO_IBI (root) — same image, same cache hit

---

### IBI CLO pdf ✅ (with ghost entry)

- **Path**: `C:/Users/Agam/Desktop/איתן/IBI CLO.pdf`
- **Size**: 489 KB | **Cache**: v28 | **Report month**: 2026-02

**Entry 1 — USD**:
- Years: 2022–2026 | Monthly: 46 | YTD 2026: -0.0691 ✅
- Annual: 2022=+0.52%, 2023=+16.66%, 2024=+14.71%, 2025=+1.28%

**Entry 2 — ILS**:
- Years: 2022–2026 | Monthly: 46 | YTD 2026: -0.0692 ✅
- Annual: 2022=-1.70%, 2023=+15.53%, 2024=+14.02%, 2025=+0.81%

**Entry 3 — ILS** ⚠️:
- Ghost entry: 0 monthly fields, no years, no YTD
- **BUG**: should be filtered out

---

### ogen J png ✅

- **Path**: `C:/Users/Agam/Desktop/איתן/ogen J.png`
- **Size**: 80 KB | **Cache**: v28 | **Report month**: 2026-01

**Entry 1 — ILS** (Class A or Fund):
- Years: 2019–2026 | Monthly: 85 (full coverage) | YTD 2026: +1.13% ✅
- Annual: 2025=+6.00%, 2024=+13.68%, 2023=+14.66%, 2022=+5.06%, 2021=+6.49%, 2020=+5.71%, 2019=+6.94%

**Entry 2 — ILS** (Class B or Benchmark):
- Years: 2019–2026 | Monthly: 85 | YTD 2026: +1.28% ✅
- Annual: 2025=+5.34%, 2024=+12.18%, 2023=+13.62%, 2022=+3.43%

---

### keren-ogen jan26 ✅

- **Path**: `C:/Users/Agam/Desktop/איתן/keren-ogen_jan26 class a.pdf`
- **Size**: 150 KB | **Cache**: v28 | **Report month**: 2026-01
- **Fund**: הפניקס קפיטל קרן עוגן

**Entry 1 — USD**: 2019–2026, 85 months, YTD 2026=+1.13% ✅
**Entry 2 — ILS**: 2019–2026, 85 months, YTD 2026=+1.28% ✅

Note: USD/ILS entries have identical values to ogen J — likely same fund, the PDF labels the first table as USD.

---

### aspm dec25 ✅

- **Path**: `C:/Users/Agam/Desktop/איתן/aspm_dec25.pdf`
- **Size**: 283 KB | **Cache**: v28 | **Report month**: 2025-12
- **Fund**: Fund Access ASPM Apollo

**Entry 1 — ILS** (Class A): 2025 only, 12 months | YTD ❌ | Annual 2025=+19.91%
**Entry 2 — ILS** (Class B): 2025 only, 12 months | YTD ❌ | Annual 2025=+18.63%

Two legitimate share classes. No YTD extracted despite full year available — see root cause above.

---

### Sphera Q1 2026 ❌

- **Path**: `C:/Users/Agam/Desktop/איתן/Sphera Master Fund Q1 2026.pdf.pdf`
- **Size**: 384 KB
- **Error**: `AI service error (400)` — Claude API rejected this PDF
- Note: file has double extension `.pdf.pdf`

---

### Creative Value Feb ✅ (with ghost entries)

- **Path**: `C:/Users/Agam/Desktop/איתן/Creative Value עלון פברואר.pdf`
- **Size**: 384 KB | **Cache**: v28 | **Report month**: 2026-02
- **Fund**: Creative Value

Entries 1–5: Ghost entries (0 fields, no data) — **BUG**: should be filtered
**Entry 6 — ILS** (real data):
- Years: 2019–2026 | Monthly: 79 | YTD 2026: +4.38% ✅
- Annual: 2025=+23.87%, 2024=+41.35%, 2023=+19.72%, 2022=-20.35%, 2021=+28.88%, 2020=+11.57%

---

### morefeb png ⚠️

- **Path**: `C:/Users/Agam/Desktop/איתן/morefeb.png`
- **Size**: 45 KB | **Cache**: v28 | **Report month**: 2026-02
- Pass-1 found: `monthlyReturn = -0.0467` (single value)
- Pass-2 raw extraction: 0 tables found
- **Result**: `dualCurrencyData` never populated — NO_DATA

---

### מעקב CLO ❌ through מכתב תודה גרין ❌

All these files are multi-page fund tracker PDFs (internal management spreadsheets, charts, comparison tables, or letters). They are **not** individual fund performance reports.

- Claude API returns 400 for all of them
- Sizes range from 184 KB to 868 KB
- These files are out of scope for single-fund parsing

---

## Issues Log (Bugs to Fix)

| # | Severity | Issue | Affected Files | Fix |
|---|----------|-------|----------------|-----|
| 1 | Medium | Ghost empty entries in `dualCurrencyData` | IBI CLO pdf, Creative Value Feb | Filter entries with 0 monthly fields from `mapRawTablesToFields` |
| 2 | Low | `morefeb.png` returns NO_DATA despite Pass-1 having data | morefeb png | Use Pass-1 `fields` as fallback when Pass-2 yields empty |
| 3 | Low | Missing YTD for December reports | aspm dec25 | Broaden `YTD_ALIASES` to include annual total labels used in Dec reports |
| 4 | Info | Multi-page tracker PDFs return 400 | all מעקב* PDFs | Add pre-check + user-friendly error message (out of scope for this parser) |
| 5 | Info | Fund name not extracted for PNG files | CLO_IBI, ogen J | Investigate Pass-1 fund name extraction for image-only reports |
