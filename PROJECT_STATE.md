# PROJECT STATE — Fund Tracker

## Current Version: v1.2
**Last Updated:** 2026-04-02
**Status:** Production-ready — STABLE BASELINE (Parser Phase Complete)
**Deployment:** Vercel (auto-deploy on push to main)
**Repository:** github.com/bren242/fund-tracker

---

## System Overview

White-label multi-client fund tracking web application built with Next.js 15 (App Router).
Designed for institutional-grade reporting and print output for top-tier clients.

### Architecture
- **Framework:** Next.js 15.5.14 with App Router (Windows)
- **UI Direction:** RTL (Hebrew)
- **Styling:** Tailwind CSS + CSS variables + inline styles for print
- **Charts:** Recharts (scatter plot, line chart — fixed dimensions for print)
- **Multi-Client:** Client isolation via clean URLs (`/green`, `/nox`) + middleware rewrite
- **Data Storage:** Vercel KV (production) / JSON files (local development)
- **Auth:** Password gate using sessionStorage (`client-auth-{clientKey}`)

### Storage Layer (v1.2)
- **Production:** Vercel KV (Upstash Redis) — all reads/writes go through KV
- **Local:** Filesystem fallback — JSON files under `data/{clientKey}/`
- **Abstraction:** `lib/storage.ts` — `storageRead()`, `storageWrite()`, `storageAppend()`
- **KV Keys:** `funds:{client}`, `brand:{client}`, `parse-drafts:{client}`, `parse-log:{client}`

### Pages
| Page | Path | Description |
|------|------|-------------|
| Report | `/{client}` | Main fund report table with print support |
| Charts | `/{client}/charts` | Scatter plot (risk vs return) with print support |
| Compare | `/{client}/compare` | Fund comparison (basic/advanced) |
| Admin | `/{client}/admin` | Brand config, fund management, AI parser |
| Upload | `/{client}/upload` | Mobile-first PDF/image upload for AI parsing |
| 404 | `/` | Custom branded guide for missing client |

### Active Clients
| Client | Key | Features | AI Parser | Version |
|--------|-----|----------|-----------|---------|
| GREEN | `green` | Full (comparison advanced + charts) | Enabled | 1.2 |
| NOX | `nox` | Basic (comparison + charts disabled) | Disabled | 1.2 |

---

## Completed Features

### Core
- [x] Multi-client data isolation (funds.json + brand.json per client)
- [x] Client password gate with sessionStorage persistence
- [x] Fund report table with all year columns (2019–2026)
- [x] Category-based grouping with color-coded section headers
- [x] Cascading filter bar (group > category > classification chips > search)
- [x] Unified FilterBar shared between report and charts pages
- [x] Dark/light theme toggle
- [x] Admin panel with logo upload, disclaimer, brand config
- [x] Version badge (v1.1) in all page headers
- [x] Clean URL routing via middleware (/green, /nox)
- [x] Custom 404 page for bare URLs
- [x] Brand color connection to UI elements

### Monthly Returns History (v1.2)
- [x] `monthlyReturns` field on Fund type (optional, backward-compatible)
- [x] Admin tab "היסטוריה חודשית" — view/enter monthly returns per month
- [x] Auto-sync: updating monthlyReturn in "עדכון חודשי" saves to history
- [x] Month selector with reporting status per fund
- [x] Super admin only (behind super2026)

### Vercel KV Storage (v1.2)
- [x] Storage abstraction layer (`lib/storage.ts`)
- [x] KV in production, filesystem in local dev
- [x] All admin saves work in production (was broken before — read-only filesystem)
- [x] Migration script for JSON → KV (`scripts/migrate-to-kv.ts`)
- [x] Graceful fallback if KV env vars missing

### AI Parser — Phase 1 Complete + Hardened (v1.2)
- [x] Feature flag: `brand.features.aiParser` (per client)
- [x] Admin tab "קליטת נתונים" with sub-views: input, review, drafts
- [x] Text-only input (paste from email/portal/fact sheet)
- [x] Claude API integration (direct HTTP, model: claude-sonnet-4-20250514)
- [x] Structured JSON extraction with system prompt
- [x] Field whitelist: monthlyReturn, returns[year], manager, classification
- [x] Fund name used for matching only — never overwritten
- [x] Confidence scoring with visual badges (high/medium/low)
- [x] Auto-approve high-confidence fields (≥70%)
- [x] Fund matching dropdown with AI suggestion
- [x] Draft save (pending) — NO write to funds.json at parse time
- [x] Separate apply-to-fund action with explicit confirmation
- [x] monthlyReturn sync to monthlyReturns history on apply
- [x] Draft reject with status tracking
- [x] Append-only audit log (`parse-log:{client}`)
- [x] Production hardening:
  - Robust error handling (missing API key, timeout, invalid response)
  - 1 retry on Claude API failure
  - 30s timeout on Claude calls
  - Confidence normalization (default 0.5, clamp 0-1)
  - Post-Claude field sanitization (whitelist + type normalization)
  - Draft schema validation (must have fund name or match + at least 1 field)
  - Apply button disabled when no fund selected or no valid fields
  - All endpoints return structured JSON (no crashes)
- [x] Phase 2: real `parse-file` action with Vision API (replaces stub)

### AI Parser — Phase 2: PDF/Image Upload (v1.2)
- [x] Claude Vision API integration (`callClaudeVision()` with 45s timeout + retry)
- [x] `parse-file` API action: multipart/form-data, validates type/size, base64 → Vision API
- [x] Shared helpers: `buildSystemPrompt()`, `parseCloudeResponse()` (used by text + file)
- [x] Allowed MIME types: PDF, PNG, JPG, WebP — max 10MB
- [x] Mobile upload page (`/upload`) — drag/drop, file picker, camera capture
- [x] Sequential multi-file processing (up to 10 files)
- [x] Per-file status cards (queued → uploading → parsed → saved / error)
- [x] Save individual draft or "Save All" from mobile
- [x] Feature flag: `brand.features.mobileUpload` (per client)
- [x] ClientGate password persistence for API auth from upload page
- [x] Middleware updated for `/upload` route

### Fund Comparison
- [x] Select up to 4 funds from report table (inline checkbox)
- [x] Navigate to dedicated compare page
- [x] Side-by-side comparison table (15 metrics)
- [x] Auto-highlight winner per category (star + brand color)
- [x] Leading fund summary card
- [x] Dual mode: basic (table only) / advanced (table + line chart)
- [x] Feature flag: `brand.features.comparisonMode`

### Print — Report (PrintReport.tsx)
- [x] Landscape A4 layout with proper margins
- [x] Repeating header (logo + title + date) via `<thead>`
- [x] 3-cell inner `<table>` for reliable RTL header alignment
- [x] Year selection (printYears[] -> filtered columns)
- [x] Dynamic column widths based on selected years
- [x] Color-coded return values (green/red/neutral)
- [x] Row striping, category headers, super-header
- [x] Fixed footer with disclaimer + copyright on every page
- [x] Page-break-inside: avoid for rows

### Print — Charts (charts/page.tsx)
- [x] Portrait A4 layout with proper margins
- [x] Repeating header (logo + title + date) via `<thead>`
- [x] Fixed-dimension ScatterChart (660x380)
- [x] Category title (bold, centered, with underline)
- [x] Legend table + rank cards (top/bottom)
- [x] Fixed footer with disclaimer + copyright

### Print — Comparison (compare/page.tsx)
- [x] Portrait A4 layout
- [x] 2-row header (logo + date, centered title)
- [x] Compact table + summary strip
- [x] Line chart with fixed dimensions (680x280)
- [x] Divider between table and chart
- [x] Footer with disclaimer + copyright

### Print CSS (globals.css)
- [x] `@page` size overrides per page
- [x] `.print-footer { position: fixed; bottom: 0 }` for every-page footer
- [x] `-webkit-print-color-adjust: exact` for color preservation
- [x] `.print-only` / `.no-print` visibility toggles
- [x] `thead { display: table-header-group }` for header repetition

---

## STABLE BASELINE — Parser Phase Complete (2026-04-02)

All AI parser functionality is production-verified and stable.

### What Is Working
| Feature | Status | Verified |
|---------|--------|----------|
| AI text parse (Claude API) | WORKING | 2026-04-02 |
| AI file parse (PDF/Image Vision) | WORKING | 2026-04-02 |
| Dual currency detection (ILS+USD) | WORKING | 2026-04-02 |
| Currency label-based assignment (no inversion) | WORKING | 2026-04-02 |
| Monthly returns extraction (all 12 months) | WORKING | 2026-04-02 |
| Annual returns (y2025 from December YTD) | WORKING | 2026-04-02 |
| Report month detection | WORKING | 2026-04-02 |
| Draft save/apply/reject flow | WORKING | 2026-04-02 |
| Fund matching with currency awareness | WORKING | 2026-04-02 |
| Classification (3-layer category system) | WORKING | 2026-04-02 |
| KV overwrite protection (PUT validation) | WORKING | 2026-04-02 |
| Token usage tracking + monthly limits | WORKING | 2026-04-02 |
| File hash caching (avoid re-parse) | WORKING | 2026-04-02 |
| Mobile upload page (/upload) | WORKING | 2026-04-02 |

### Recent Critical Fixes (March–April 2026)
1. **Currency inversion fix** — System prompt had ILS-first bias that caused Claude to swap USD/ILS values. Fixed with mandatory 3-step label identification process and removed all position-based assumptions. (commits: 944ba93, b5b85f3)
2. **y2025 missing fix** — December reports store YTD as `ytd2025` but table renders `y2025`. Added auto-promotion: `ytd{year}` → `y{year}` when reportMonth is December. (commit: 944ba93)
3. **Fund matching currency awareness** — Matching context now includes `returnBasis` per fund. Claude instructed to never match ILS document to USD fund. (commit: e3022a8)
4. **KV overwrite protection** — PUT endpoint validates payload structure before writing to prevent partial/corrupt writes. (commit: 2aa4cf0)
5. **Cache invalidation** — Cache version bumped to 8; stale parse results from pre-fix era are automatically invalidated.

### Known Risks (Real)
1. **Prompt sensitivity** — Currency assignment depends on Claude correctly reading Hebrew labels. Unusual document layouts may still confuse it.
2. **PDF text extraction order** — Some PDFs have text layer order that doesn't match visual layout. Vision API (document type) handles this better than text paste.
3. **Token limits** — Monthly token budget is per-client. Heavy usage (many large PDFs) could exhaust quota mid-month.
4. **Logo upload still filesystem-based** — Requires Vercel Blob for production upload (out of scope for v1.2).

### Not Built Yet
- **Batch undo** — Only single-step undo supported
- **Manual field override in draft review** — Fields are checkbox-only (include/exclude), no inline edit
- **Historical parse comparison** — No way to compare two parses of the same fund over time
- **Multi-user roles** — Single admin password, no viewer/editor distinction

---

## Override / Diff MVP — QA APPROVED (2026-04-02)

Full field-level diff review system before applying parsed data to existing funds.

### Status: QA APPROVED

### Implemented Scope

**Diff statuses:**
| Status | Meaning | Decision required | Action |
|--------|---------|-------------------|--------|
| `new` | Field exists in draft only | No | Auto-apply |
| `changed` | Both have value, values differ | Yes | replace / keep |
| `same` | Both have value, values match | No | Hidden, counter only |
| `missing_in_pdf` | Field exists in fund with value, absent from draft | Yes | keep / clear |

**missing_in_pdf applies to (financial fields only):**
- `monthlyReturn` (for the specific reportMonth)
- `sharpe`
- `stdDev`
- `returns.y*` (annual returns)
- `returns.ytd*` (year-to-date)

**missing_in_pdf does NOT apply to:**
- `manager`
- `classification`
- `monthlyReturns.*` (historical month entries)

**Server-side (route.ts):**
- `check-collision` computes full diff for all approved fields + detects missing_in_pdf
- Returns `diff[]`, `diffComputedAt`, `fundLastUpdated`
- `apply` accepts `fieldDecisions: Record<string, "replace"|"keep"|"clear">` + `clearFields: string[]`
- Blocks with 409 if any `changed` or `missing_in_pdf` field has no decision
- `clear` writes `null` to the field (key preserved, value nulled)
- `fund.lastUpdated` set after every successful apply

**Client-side (admin/page.tsx):**
- Diff review UI replaces old collision UI
- `changed` rows: orange, with replace/keep buttons
- `new` rows: green, no buttons (auto-apply)
- `missing_in_pdf` rows: red, with keep/clear buttons
- `same` rows: hidden, shown as counter ("X שדות ללא שינוי")
- Apply button blocked until all `changed` + `missing_in_pdf` fields have decisions

**Safety rules (active):**
- Match safety: no `returnBasis` on draft = no auto-match, force explicit user selection
- Staleness: `fund.lastUpdated` vs `diffComputedAt` — blocks apply if fund changed since diff
- Staleness safe for old funds: `fund.lastUpdated = null` does not block
- Undo valid after apply/clear (restores full fund snapshot)
- `clearFields` sent separately from `approvedFields` — no mixing

### QA Results (2026-04-02)
| Case | Scenario | Result |
|------|----------|--------|
| 1 | changed → replace | PASS |
| 2 | changed → keep | PASS |
| 3 | missing_in_pdf → keep | PASS |
| 4 | missing_in_pdf → clear | PASS |
| 5 | Apply gating (no decision → 409) | PASS |
| 6 | Regression check (no unintended changes) | PASS |

### Out of Scope (intentionally not included)
- No expansion of `missing_in_pdf` to manager/classification/monthly history
- No auto-decision engine
- No batch operations
- No inline field value editing in diff review
- No refactor of existing parser/extract logic

### Recommended Next Step
~~Auto-apply path for clearly safe drafts~~ → **Implemented. See Auto-Apply MVP below.**

---

## Auto-Apply MVP — QA APPROVED (2026-04-02)

Skip diff UI and apply directly when parsed data contains only safe fields (new + same).

### Status: QA APPROVED

### Implemented Scope

**Eligibility rules:**
| Condition | Eligible? | Behavior |
|-----------|-----------|----------|
| ≥1 `new` + 0 `changed` + 0 `missing_in_pdf` | Yes | Auto-apply, no diff UI |
| `new` + `same` mix, 0 `changed`, 0 `missing_in_pdf` | Yes | Auto-apply, no diff UI |
| Only `same` fields (0 `new`) | No | "אין צורך בעדכון" message |
| Any `changed` field | No | Diff UI with manual decisions |
| Any `missing_in_pdf` field | No | Diff UI with manual decisions |
| Empty diff | No | "אין צורך בעדכון" message |

**Server-side (`route.ts`):**
- `check-collision` returns `autoApplyEligible: boolean`
- `apply` accepts `autoApply?: boolean` — re-validates safety server-side
- If changed field found during re-validation → 409 with `requiresDiff: true`
- Response includes `autoApplied: true` on success
- Audit log records `autoApply: true`

**Client-side (`admin/page.tsx`):**
- After check-collision, if `autoApplyEligible === true` → calls apply directly
- Success → green status "(אוטומטי)" + reload
- 409 with `requiresDiff` → re-runs check-collision, falls back to diff UI
- Other errors → error message

**Safety rules (active):**
- Server re-computes diff at apply time — never trusts client's eligibility claim
- Staleness check still enforced (`fund.lastUpdated` vs `diffComputedAt`)
- Undo remains valid after auto-apply (full fund snapshot preserved)
- `fieldDecisions: {}` and `clearFields: []` sent for auto-apply (no decisions needed)

### QA Results (2026-04-02)
| Case | Scenario | Result |
|------|----------|--------|
| 1 | Only new fields → auto-apply | PASS |
| 2 | New + same fields → auto-apply | PASS |
| 3 | Changed field → not eligible | PASS |
| 4 | missing_in_pdf → not eligible | PASS |
| 5 | Staleness 409 on auto-apply | PASS |
| 6 | Undo after auto-apply | PASS |
| R1 | Manual diff flow unchanged | PASS |
| R2 | autoApply=true with changed → server 409 | PASS |

### Out of Scope (intentionally not included)
- No auto-apply for new fund creation (existing fund updates only)
- No auto-decision engine for changed/missing fields
- No skip of match validation (returnBasis check still enforced)

---

## Batch Apply MVP — QA APPROVED (2026-04-03)

Single-action batch processing of all safe pending drafts. Completes the pipeline: parse → diff → auto-apply → batch.

### Status: QA APPROVED

### Implemented Scope

**Batch definition:**
- All pending drafts with a valid fund match
- Cross-fund — any eligible draft regardless of target fund
- Sequential execution only (no parallel writes)

**Pre-filter (client-side):**
- `status === "pending"`
- `match.fundId` exists
- `extracted.fields.length > 0`
- If `monthlyReturn` in fields → `reportMonth` must be set

**Per-draft flow:**
```
check-collision → autoApplyEligible?
  → true:  apply with autoApply=true → count as applied
  → false: skip → count as skipped (needs manual review)
  → error/409: count as skipped or failed → continue to next
```

**UI trigger:**
- Button `"החל טיוטות בטוחות"` in drafts list header
- Visible when: pending drafts > 0, no diff UI open, no new-fund flow open
- Disabled during execution (`batchRunning`)

**Result banner:**
| Condition | Display |
|-----------|---------|
| applied > 0 | `✓ עודכנו X טיוטות אוטומטית` (green) |
| skipped > 0 | `· Y דורשות סקירה ידנית` (orange) |
| failed > 0 | `· Z נכשלו` (red) |
| applied === 0, skipped > 0 | `ℹ️ כל הטיוטות דורשות סקירה ידנית` |
| applied > 1 | Note: `ביטול אפשרי רק לטיוטה האחרונה שעודכנה` |

**Safety rules (unchanged from auto-apply):**
- Server re-validates eligibility on every apply (never trusts client)
- Staleness enforced (`fund.lastUpdated` vs `diffComputedAt`)
- Duplicate fund targets: second draft hits staleness 409 → skipped
- Undo: last applied draft only (each apply overwrites `undo-state`)
- No override of changed or missing_in_pdf fields — those stay in review queue

**Logging:**
- `batchId` (format: `batch-{ISO timestamp}`) passed in apply body
- Stored in audit log per draft (`ParseLogEntry.batchId`)
- Enables grouping batch operations in log review

### QA Results (2026-04-03)
| Case | Scenario | Result |
|------|----------|--------|
| 1 | All eligible → all applied | PASS |
| 2 | Mixed eligible + non-eligible | PASS |
| 3 | None eligible → all skipped | PASS |
| 4 | Partial failure → continues, no abort | PASS |
| 5 | Duplicate fund target → staleness 409 skip | PASS |
| 6 | Undo after batch → last draft restored | PASS |
| + | batchId in audit log | PASS |

### Out of Scope (intentionally not included)
- No batch diff UI or bulk override decisions
- No multi-select (processes all pending eligible)
- No retry mechanism
- No parallel execution
- No batch undo (single-draft undo only)

---

## Known Issues / Limitations

1. **Browser print headers/footers** — Users must uncheck "Headers and footers" in browser print dialog
2. **CSS variables in SVG** — Will NOT render in print; must always use hardcoded hex colors
3. **ResponsiveContainer** — Cannot be used for print; must use fixed chart dimensions
4. **Desktop-first** — Responsive design is functional but not fully optimized for mobile
5. **AI Parser requires ANTHROPIC_API_KEY** — Must be added to Vercel env vars for production use

---

## Future Considerations

- AI Parser Phase 3: Chat interface ("Ask your data")
- Fund Narrator: AI-generated fund/comparison summaries
- One-Pager Generator: standardized per-fund PDF output
- Vercel Blob for logo upload in production
- Mobile-first responsive design pass
- Excel upload for fund data
- User roles (admin vs viewer)
