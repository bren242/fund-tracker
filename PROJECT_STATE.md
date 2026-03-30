# PROJECT STATE — Fund Tracker

## Current Version: v1.2
**Last Updated:** 2026-03-30
**Status:** Production-ready
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
- [x] Phase 2 backend stub: `parse-file` action (returns mock, no UI yet)

### AI Parser — Phase 2 Prepared (backend stub)
- [x] `parse-file` API action exists (accepts fileName/fileType)
- [x] Returns stub response with `stub: true` flag
- [x] `sourceType: "text" | "file"` internal flag ready
- [ ] Vision API integration (not yet)
- [ ] File upload UI (not yet)

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

## Known Issues / Limitations

1. **Logo upload** — Still filesystem-based; requires Vercel Blob for production upload (out of scope for v1.2)
2. **Browser print headers/footers** — Users must uncheck "Headers and footers" in browser print dialog
3. **CSS variables in SVG** — Will NOT render in print; must always use hardcoded hex colors
4. **ResponsiveContainer** — Cannot be used for print; must use fixed chart dimensions
5. **Desktop-first** — Responsive design is functional but not fully optimized for mobile
6. **AI Parser requires ANTHROPIC_API_KEY** — Must be added to Vercel env vars for production use

---

## Future Considerations

- AI Parser Phase 2: PDF/Image upload via Claude Vision API
- AI Parser Phase 3: Chat interface ("Ask your data")
- Fund Narrator: AI-generated fund/comparison summaries
- One-Pager Generator: standardized per-fund PDF output
- Vercel Blob for logo upload in production
- Mobile-first responsive design pass
- Excel upload for fund data
- User roles (admin vs viewer)
