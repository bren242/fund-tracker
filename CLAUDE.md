# CLAUDE.md — Fund Tracker

## Project Overview
- **App:** White-label fund tracking platform for institutional clients
- **Stack:** Next.js 15.5.14 (App Router), TypeScript, Tailwind CSS, Recharts
- **UI:** Hebrew RTL, dark/light theme, print-optimized A4 layouts
- **Live:** Vercel (auto-deploy on push to main)
- **Routes:** `/{client}` (report), `/{client}/charts`, `/{client}/compare`, `/{client}/admin`, `/{client}/upload`
- **Clients:** GREEN (full features + AI parser), NOX (basic)
- **Auth:** Password gate per client, super admin (`super2026`) for AI parser + advanced ops

## Data & Storage
- **Production:** Vercel KV (Upstash Redis)
- **Local dev:** JSON files under `data/{clientKey}/`
- **Abstraction:** `lib/storage.ts` — `storageRead()`, `storageWrite()`, `storageAppend()`
- **KV keys:** `funds:{client}`, `brand:{client}`, `parse-drafts:{client}`, `parse-log:{client}`
- **Parse flow:** Upload/paste → Claude API → structured extract → draft (pending) → diff review → apply to fund
- **Cache version:** 11 — bumped after parser fixes, stale results auto-invalidated

## AI Parser — Current State (v1.3)

### Architecture
- Claude API (claude-sonnet-4-20250514) with `temperature: 0`
- Text input: direct API call with system prompt
- File input (PDF/image): Vision API with document media type
- Shared helpers: `buildSystemPrompt()`, `parseCloudeResponse()`
- Field whitelist: `monthlyReturn`, `monthlyReturns`, `returns`, `manager`, `classification`, `sharpe`, `stdDev`
- Fund name used for MATCHING only — never overwritten

### Creative Value Fix (v1.3, commit c1db678)
- **Root cause:** LLM non-determinism in RTL Hebrew table parsing — Claude sometimes swaps column values (Jan ↔ yearly) across runs
- **Fix:** `fixAnnualJanSwapPerYear()` — detects when |Jan| > |yearly|*2 and swaps them back
- **temperature: 0** — reduces (but doesn't eliminate) non-determinism
- **corrections[] diagnostic flags** on every parse result:
  - `{year}:yearly_swap` — yearly value was swapped with Jan, corrected
  - `{year}:yearly_duplicate` — duplicate pattern detected, corrected
  - `{year}:monthly_uncertain` — monthly order may be wrong for this year

### Reliability Guarantees
- **Yearly values: RELIABLE** — swap correction catches and fixes all known error patterns
- **Monthly values: MAY BE UNCERTAIN** — when `monthly_uncertain` flag exists, monthly order might be mirrored

### RULE: Never Trust Monthly Blindly
If `corrections[]` contains `monthly_uncertain` for a year, monthly values for that year cannot be trusted as-is. The LLM may have mirrored them (Dec↔Jan, Nov↔Feb, etc.). This is mathematically impossible to detect or fix — multiplication is commutative, so compound returns are identical regardless of order.

## Known Limitations
1. **LLM non-determinism** — Same PDF + same prompt can produce different column orderings across runs. `temperature: 0` reduces but doesn't eliminate this.
2. **Monthly mirror unfixable** — When LLM swaps columns, yearly gets corrected but monthly order cannot be deterministically verified or fixed.
3. **Prompt sensitivity** — Currency assignment and table parsing depend on Claude correctly reading Hebrew labels. Unusual layouts may confuse it.
4. **PDF text layer order** — Some PDFs have text layer that doesn't match visual layout. Vision API handles this better than text paste.
5. **Token limits** — Monthly per-client token budget. Heavy PDF usage can exhaust quota.

## Working Rules
1. **Minimal changes only** — No unnecessary refactoring or restructuring
2. **Root cause first** — Identify why before fixing what
3. **One fix at a time** — Don't stack multiple changes
4. **No push before validation** — Always verify fix works before pushing
5. **No blind iteration** — If stuck >2 attempts, stop, summarize, change approach
6. **Print is sacred** — Never break print layouts (see AI_DEV_RULES.md for patterns)

## Current Status (2026-04-03)
- **v1.3 deployed and production-verified** — Creative Value parsing confirmed correct
- **All yearly values correct** (2019-2025 + YTD 2026)
- **corrections[] visible** in parse results (12 entries for Creative Value)
- **No open bugs**

## Next Focus
- Monitor other fund PDFs for similar swap patterns
- Consider expanding corrections visibility to the draft review UI
- Batch processing of multiple fund reports in production

## Key Files
| File | Purpose |
|------|---------|
| `app/api/parse/route.ts` | ALL parser logic — prompts, API calls, extraction, swap correction, drafts, apply |
| `app/admin/page.tsx` | Admin panel UI — brand config, fund management, AI parser interface |
| `lib/parseTypes.ts` | Parser type definitions — ParseDraft, ParsedField, corrections |
| `lib/storage.ts` | Storage abstraction — KV (prod) / JSON (dev) |
| `lib/types.ts` | Core types — Fund, Category, FundsData |
| `AI_DEV_RULES.md` | Print layout rules, header/footer patterns, CSS constraints |
| `PROJECT_STATE.md` | Full feature documentation and QA records |
| `DEV_STATE.md` | System health and file map |
