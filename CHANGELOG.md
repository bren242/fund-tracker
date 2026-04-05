# Changelog

## v1.5.1 — Value Layer Infrastructure (2026-04-05)

### Analysis Window
- `getAnalysisWindow(monthlyReturns, periodMonths)` — returns last N months of monthly data, sorted chronologically
- Assumes data is already post-normalization (direction, validation layers)

### Period Selector
- 12 / 24 / 36 / 60 month toggle buttons in Monthly History tab
- Default: 24 months
- Shows eligibility count (funds with full data for selected period)
- View-level state only (not global)

### Insight Placeholder
- Empty placeholder area for future Value Layer insights
- No calculations or fake content

### Files Changed
- `app/admin/page.tsx` — `getAnalysisWindow()`, period selector UI, insight placeholder
- Documentation: CHANGELOG.md, PROJECT_STATE.md, DEV_STATE.md

---

## v1.5 — Monthly Direction Control (2026-04-04)

### Per-Fund Direction Setting
- `monthlyDirection: "LTR" | "RTL" | null` field on Fund type
- `normalizeMonthlyDirection()` — reverses monthly value assignments per year when direction is RTL
- Normalization runs before compound validation, diff comparison, history cross-check, and apply
- Does NOT mutate raw draft data — interpretation layer only
- `monthly_uncertain` preserved as-is — direction does not auto-clear parser uncertainty

### API
- `set-direction` action on parse API — saves direction to fund object
- `fundMonthlyDirection` returned in check-collision response

### UI
- Direction selector in diff review when `monthlyDirection` is null and draft has monthly fields
- Two buttons: "ינואר → דצמבר" (LTR) / "ינואר ← דצמבר" (RTL)
- On selection: saves direction, re-runs check-collision with normalization applied
- Direction badge when already set (green for LTR, blue for RTL)

### Files Changed
- `lib/types.ts` — `monthlyDirection` field on Fund
- `app/api/parse/route.ts` — `normalizeMonthlyDirection()`, `set-direction` action, normalization in check-collision + apply
- `app/admin/page.tsx` — direction selector UI, badge, re-check on direction change
- Documentation: CLAUDE.md, AI_PARSER.md, PROJECT_STATE.md, DEV_STATE.md, CHANGELOG.md

---

## v1.4 — Monthly Reliability Layers (2026-04-04)

### Phase 1: Safety Net
- `corrections[]` + `monthly_uncertain` warning banner in draft review UI
- Auto-apply blocked (client + server) for uncertain drafts
- Batch apply skips uncertain drafts
- Single apply requires explicit confirm for uncertain drafts

### Phase 2: Overwrite Protection
- Changed monthly fields flagged as `monthlyProtected` when draft has `monthly_uncertain`
- Protected fields auto-default to "keep" in diff review
- Red "🛡 מוגן" badge on protected rows

### Compound Validation (expanded)
- `validateMonthlyVsYearly()` — Π(1+rₖ) vs yearly, ±1% tolerance
- Now runs for **all** drafts (not only uncertain) — merges fund's full monthly history + draft values
- Detection-only for clean drafts (warning, not blocking)
- Results shown in diff review per year (✓ pass / ✕ fail)

### History Cross-Check
- Monthly values compared against existing `fund.monthlyReturns[month]` at check-collision
- Flags mismatch when difference >0.5% absolute (`historyMismatch` + `historyDiff`)
- Orange "⚠ ערך שונה מהיסטוריה קיימת" badge in diff review
- Detection only — does not block apply

### Files Changed
- `app/api/parse/route.ts` — validation function, check-collision enhancements, server-side guards, history cross-check
- `app/admin/page.tsx` — corrections UI, protected rows, compound validation display, apply gating, history mismatch badge
- Documentation: CLAUDE.md, AI_PARSER.md, PROJECT_STATE.md, DEV_STATE.md, CHANGELOG.md

---

## v1.3 — Creative Value Parser Fix (2026-04-03)

### Parser Hardening
- **temperature: 0** on all Claude API calls — reduces LLM non-determinism
- **Yearly swap correction** — `fixAnnualJanSwapPerYear()` detects and fixes Jan ↔ yearly value swaps per year
- **corrections[] diagnostic flag** — tracks all auto-corrections: `yearly_swap`, `yearly_duplicate`, `monthly_uncertain`
- **Cache version → 11** — invalidates all pre-fix cached results

### Production Verified
- Creative Value PDF: all yearly values correct (2019-2025 + YTD 2026), zero false positives
- corrections[] returned with 12 entries (6 years corrected)

### Files Changed
- `app/api/parse/route.ts` — temperature, swap detection, corrections tracking, cache v11
- `lib/parseTypes.ts` — corrections field on ParseDraft
- `CLAUDE.md` — New project-level documentation (created)
- `AI_PARSER.md` — New parser technical reference (created)
- `PROJECT_STATE.md` — v1.3 section added
- `CHANGELOG.md` — This entry

---

## v1.2 — Stable Baseline (2026-04-02)

### Critical Bug Fixes
- **Currency inversion fix** — Dual-currency documents (ILS+USD) had values swapped. Root cause: system prompt biased Claude to assume first table is ILS. Fixed with label-only 3-step assignment process.
- **y2025 missing fix** — December reports showed blank 2025 column. Root cause: parser stored `ytd2025` but table expects `y2025`. Added auto-promotion for December reports.
- **Fund matching currency awareness** — Matching now includes `returnBasis` per fund to prevent cross-currency matching.
- **KV overwrite protection** — PUT endpoint validates payload before writing to prevent data corruption.

### Improvements
- Cache version bumped to 8 (auto-invalidates stale pre-fix results)
- System prompt includes explicit warning about USD-first document layouts
- Dual currency JSON example updated to reflect real document order

### Files Changed
- `app/api/parse/route.ts` — System prompt, ytd→y promotion, matching context, cache version
- `PROJECT_STATE.md` — Stable baseline documentation
- `DEV_STATE.md` — Updated system health and fix log
- `CHANGELOG.md` — This entry

---

## v1.1 (2026-03-29)

### New Features
- **Clean URL routing** — `/green`, `/nox/charts` via middleware rewrite
- **Custom 404 page** — Bare `/` shows branded guide instead of default error
- **Version badge** — `v1.1` displayed in header across all pages
- **Unified chart filters** — Charts page now uses shared `FilterBar` + `useFilters` (same as report)

### Improvements
- **Client detection** — Extract client from pathname as primary source, fallback to `?client=` param
- **Filter consistency** — Charts page upgraded from basic `SelectBox` to full cascading filters (group > category > classification > search)
- **Brand colors** — UI elements connected to brand config instead of hardcoded values

### Bug Fixes
- Fixed client detection showing wrong branding on clean URL routes
- Fixed default client fallback (changed from "nox" to "green")

### Files Added
- `middleware.ts` — URL routing for clean client paths
- `app/not-found.tsx` — Custom 404 page

### Files Changed
- `app/charts/page.tsx` — Replaced inline filters with shared FilterBar
- `app/page.tsx` — Added version badge
- `app/compare/page.tsx` — Added version badge
- `app/admin/page.tsx` — Added version badge
- `lib/clientKey.ts` — Pathname-based client extraction
- `lib/useClientKey.ts` — Pathname-based client extraction
- `data/green/brand.json` — Version 1.0 → 1.1
- `data/nox/brand.json` — Version 1.0 → 1.1
- `data/brand.json` — Version 1.0 → 1.1

---

## v1.0 (2026-02-28)

### Initial Release
- Fund report with full data table and print support
- Fund comparison (basic + advanced with charts)
- Risk vs return scatter chart
- Admin panel for branding and feature management
- White-label multi-client support (NOX, GREEN)
- Dark/light theme toggle
- Client authentication gate
- Print-optimized A4 layouts with repeating headers
