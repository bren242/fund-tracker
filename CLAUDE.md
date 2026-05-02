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

## Current Status (2026-04-04)
- **v1.5 deployed** — Monthly Direction Control
- **All yearly values correct** (2019-2025 + YTD 2026)
- **Monthly safety layers active:**
  - `corrections[]` + `monthly_uncertain` visible in draft review UI (red banner + tags)
  - Auto-apply blocked (client + server) for uncertain drafts
  - Existing monthly values protected from uncertain overwrite (default "keep")
  - Compound validation (Π(1+rₖ) vs yearly, ±1%) runs for **all** drafts — merges fund history + draft values
  - Validation is detection-only for clean drafts (warning, not blocking)
  - History cross-check: flags monthly values that differ from existing same-month history by >0.5% (detection-only)
- **Monthly Direction Control:**
  - Per-fund `monthlyDirection: "LTR" | "RTL" | null` setting
  - When RTL: monthly values reversed before validation/diff/apply (normalization layer)
  - Direction selector in diff review when direction is null and draft has monthly fields
  - Badge shown when direction already set
  - Does NOT auto-clear `monthly_uncertain` — direction improves interpretation, not parser certainty
- **No open bugs**

## Next Focus
- Monitor direction normalization in production
- Consider retroactive validation of existing monthly history
- Batch processing of multiple fund reports

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

## פיצ'ר עקביות (מאי 2026)

### מה נבנה
- Leaderboard ב-/green/consistency
- Detail view ב-/green/consistency?fund=X
- Compare view ב-/green/consistency/compare?funds=A,B,C (2-4 קרנות, אותה קטגוריה)
- 3 ציוני עקביות: IR, % מעל בנצ'מרק, % מעל קטגוריה (כולם Rolling 24M)
- AI בעברית על detail + compare, grounded במספרים

### קבצים מרכזיים
- lib/category-average.ts — חישוב ממוצע קטגוריה (monthly/YTD/24M)
- lib/consistency.ts — פונקציות consistencyVsBenchmark + consistencyVsCategory
- app/consistency/page.tsx — leaderboard + detail view (מותנה ב-?fund=)
- app/consistency/compare/page.tsx — compare view
- app/api/consistency-data/route.ts — אגרגציה צד-שרת לקרן בודדת
- app/api/consistency-compare-data/route.ts — אגרגציה לכמה קרנות
- app/api/consistency-ai/route.ts — AI לקרן בודדת
- app/api/consistency-compare-ai/route.ts — AI להשוואה

### Commits מרכזיים
- 2ebc45d — core (category-average + consistency expansion)
- afd1209 — dropdown + compare page + leaderboard checkboxes
- 940fd7e — fix cross-category toast
- 4dbeb5f — fix race condition on compare page

### בעיות UX פתוחות
הפיצ'ר עובד פונקציונלית, אבל ה-UX לא ב-Apple-grade. 4 בעיות מרכזיות:
1. בורר תקופה לא מובן (תקופה vs חלון)
2. 12M מחזיר "אין נתונים" כי סף מינימום הוא 24M
3. Checkbox ב-leaderboard בלי context/label
4. תאריך משתנה במעבר ל-compare

הסשן הבא ייעודי ל-Design Review מלא. לא להוסיף פיצ'רים עד אז.

### לקחים טכניים
- חובה npm run build && npm start לפני push לכל פיצ'ר עם useSearchParams
- npm run dev לא חושף race conditions של hydration
- useEffect שמנקה state ב-dependency change = anti-pattern. עדיף guards מפורשים.
