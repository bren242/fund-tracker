# AI Parser — Technical Reference

## Overview
PDF/image/text → Claude API → structured JSON → draft → diff review → apply to fund.

All parser logic lives in `app/api/parse/route.ts`. Types in `lib/parseTypes.ts`.

---

## API Configuration
- **Model:** `claude-sonnet-4-20250514`
- **Temperature:** `0` (deterministic mode — reduces but doesn't eliminate LLM variance)
- **Text parse:** Direct API call, `max_tokens: 4096`, 30s timeout, 1 retry
- **File parse:** Vision API with `type: "document"`, `max_tokens: 4096`, 45s timeout, 1 retry
- **Cache:** File hash-based, version 11, auto-invalidates stale results

## Field Extraction
Whitelist-only extraction — only these fields are written to funds:
- `monthlyReturn` — current month return
- `monthlyReturns.{YYYY-MM}` — historical monthly returns
- `returns.y{YYYY}` — annual returns
- `returns.ytd{YYYY}` — year-to-date
- `manager` — fund manager name
- `classification` — fund classification
- `sharpe` — Sharpe ratio
- `stdDev` — standard deviation

Fund name is extracted for **matching only** — never overwritten.

---

## Yearly Swap Correction (`fixAnnualJanSwapPerYear`)

### Problem
Claude sometimes swaps Jan monthly return with the yearly return when parsing RTL Hebrew tables. The swap can occur independently per year.

### Detection Logic
For each year with both `returns.y{YYYY}` and `monthlyReturns.{YYYY}-01`:
```
janAbs = |monthlyReturns.{YYYY}-01|
yearlyAbs = |returns.y{YYYY}|

isSwapped = janAbs > yearlyAbs * 2   // Jan looks too big to be a monthly return
isDuplicate = janAbs === yearlyAbs    // Exact duplicate = extraction error
```

### Correction
If swapped: swap the two values back.
If duplicate: keep yearly as-is, null out January.

### Flags Added to `corrections[]`
- `{year}:yearly_swap` — values were swapped, corrected
- `{year}:yearly_duplicate` — duplicate detected, corrected
- `{year}:monthly_uncertain` — monthly order may be wrong (always accompanies swap/duplicate)

With label parameter (for future multi-pass): `{label}:{year}:yearly_swap`

---

## Monthly Mirror Limitation

### Problem
When LLM reverses monthly column order (Dec→Jan instead of Jan→Dec), all 12 monthly values are present but in reverse order.

### Why It Can't Be Fixed
Compound return = `∏(1+rₖ)` for k=1..12. Multiplication is commutative:
```
(1+r₁)(1+r₂)...(1+r₁₂) = (1+r₁₂)(1+r₁₁)...(1+r₁)
```
Both orders produce identical compound. No mathematical test can distinguish them.

### Mitigation
- `monthly_uncertain` flag warns that monthly order may be wrong
- Yearly values are always corrected (swap detection works regardless of monthly order)
- Operator should verify monthly values manually when flag is present

---

## Monthly Reliability Layers (v1.4)

### Phase 1: Safety Net
- `corrections[]` and `monthly_uncertain` shown in draft review UI (red banner + tags)
- Auto-apply blocked (client + server) when `monthly_uncertain` exists
- Batch apply skips uncertain drafts
- Single apply requires explicit `window.confirm()` for uncertain drafts

### Phase 2: Overwrite Protection
- Changed monthly fields flagged as `monthlyProtected` when draft has `monthly_uncertain`
- Protected fields auto-default to "keep" in diff review (user can override)
- Red "🛡 מוגן" badge on protected rows

### Compound Validation
- `validateMonthlyVsYearly()` — computes Π(1+rₖ)-1 for complete years, compares to yearly return
- Tolerance: ±1% absolute
- Runs for **all** drafts at check-collision (not only uncertain)
- Merges fund's full existing monthly history + draft's new values for comparison
- Results shown in diff review: ✓ pass / ✕ fail per year
- Detection only — does not block apply for clean drafts
- Requires 12 months + yearly value for a year to validate; otherwise skips

---

## corrections[] Array

Returned on every parse result. Empty array (or undefined) means no corrections were needed.

| Flag | Meaning | Action Required |
|------|---------|-----------------|
| `{year}:yearly_swap` | Yearly ↔ Jan swapped and corrected | None — auto-fixed |
| `{year}:yearly_duplicate` | Duplicate value detected and corrected | None — auto-fixed |
| `{year}:monthly_uncertain` | Monthly order unreliable | Manual verification recommended |

Stored in:
- Parse result (API response)
- Cache object
- Draft (`ParseDraft.corrections`)

---

## Cache Versioning
| Version | Change | Date |
|---------|--------|------|
| 8 | Currency inversion fix + ytd→y promotion | 2026-04-02 |
| 9 | Header-driven table parsing | 2026-04-03 |
| 10 | Per-year swap detection | 2026-04-03 |
| 11 | temperature=0 + corrections flag | 2026-04-03 |

Cache invalidation: any cached result with `_cacheVersion < 11` is discarded and re-parsed.
