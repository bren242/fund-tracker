# DEV STATE — System Functionality & Stability

**Status:** STABLE — v1.7 (NOX v1.1 release — feature-flag nav + year mode + changelog modal)
**Date:** 2026-04-15

---

## System Health

| Component | Status | Notes |
|-----------|--------|-------|
| Report page (`/`) | ✅ Stable | Print + screen working |
| Charts page (`/charts`) | ✅ Stable | Print + screen working |
| Admin page (`/admin`) | ✅ Stable | Brand config, logo upload, funds CRUD, AI parser |
| Upload page (`/upload`) | ✅ Stable | Mobile-first PDF/image upload |
| Multi-client isolation | ✅ Stable | NOX + GREEN clients verified |
| Print — Report | ✅ Stable | Header repeats, footer fixed, years filterable |
| Print — Charts | ✅ Stable | Chart renders, header repeats, footer fixed |
| Data layer (KV) | ✅ Stable | Vercel KV production, JSON local, overwrite protection |
| AI Parser — Text | ✅ Stable | Claude API, dual currency, field extraction |
| AI Parser — File | ✅ Stable | Vision API, PDF/PNG/JPG, 45s timeout + retry |
| Draft system | ✅ Stable | Save/apply/reject/undo, append-only audit log |
| Fund matching | ✅ Stable | Currency-aware, returnBasis in matching context |
| Monthly reliability | ✅ Stable | corrections UI, auto-apply block, overwrite protection, compound validation, history cross-check |
| Monthly direction | ✅ Stable | per-fund LTR/RTL normalization, direction selector in diff review |
| Value Layer infra | ✅ Stable | period selector (12/24/36/60), analysis window helper, insight placeholder |
| Data completion | ✅ Stable | standalone page, per-fund selection, search, feature flag controlled |
| NOX tenant (white-label) | 🔒 Locked | v1.1 — feature-flag nav, year mode on table + /compare, per-tenant favicon, one-time changelog modal |

---

## File Map

### Pages
```
app/page.tsx                  — Main report (fund table + filters + print trigger)
app/charts/page.tsx           — Scatter plot (risk vs return) + print layout
app/admin/page.tsx            — Admin panel (brand config + fund management)
app/data-completion/page.tsx  — Data completion (auto-compute missing fields)
```

### Components
```
components/PrintReport.tsx      — Print-only table for fund report
components/FundTable.tsx        — Screen fund table with sorting/filtering
components/FundTableV2.tsx      — V2 table with year-mode (auto-detected when no monthlyReturns)
components/FilterBar.tsx        — Category/manager/search filters
components/BrandLogo.tsx        — Logo renderer (supports light/dark variants)
components/AppHeader.tsx        — Top nav with feature-flag filtering + dynamic favicon/logo
components/ClientGate.tsx       — Password gate wrapper (renders NoxChangelogModal when authed)
components/PasswordInput.tsx    — Password input UI
components/ThemeProvider.tsx    — Dark/light theme context
components/CompareCharts.tsx    — Line chart for /compare (monthly + annual fallback)
components/CompareYearBars.tsx  — Grouped BarChart for /compare year-mode (NOX)
components/NoxChangelogModal.tsx — One-time session modal (NOX-only, versioned dismiss key)
```

### Lib
```
lib/types.ts         — TypeScript interfaces (Fund, Category, FundsData, etc.)
lib/format.ts        — Formatting utils (pct, num, formatDate, formatReportDate)
lib/useBrand.ts      — Brand config hook (fetches brand.json)
lib/useClientKey.ts  — Client key extraction from URL params
lib/clientKey.ts     — Client key utilities
lib/clientPaths.ts   — Data path resolution per client
lib/aggregate.ts     — Data aggregation utilities
lib/disclaimer.ts    — Default disclaimer text
lib/useFilters.ts    — Filter state management
lib/reportGroups.ts  — Report grouping logic
```

### Config
```
config/brand.ts      — BrandConfig type definition + defaults
```

### Data
```
data/funds.json              — Default/fallback fund data
data/brand.json              — Default/fallback brand config
data/nox/funds.json          — NOX client fund data
data/nox/brand.json          — NOX client brand config
data/green/funds.json        — GREEN client fund data
data/green/brand.json        — GREEN client brand config
data/backups/               — Auto-backup files
data/nox/backups/           — NOX auto-backups
```

---

## Header Synchronization

Both `PrintReport.tsx` and `charts/page.tsx` use **identical** header structure:

```
<thead>
  <tr>
    <td borderBottom="2px solid {secondaryColor}">
      <table 3-cell inner layout>
        Cell 1 (120px, right): Date — "מעודכן ל: {formatDate(...)}"
        Cell 2 (center):       Title — brand.mainTitle / "סיכון מול תשואה"
        Cell 3 (120px, left):  Logo — brand.logoLight || brand.logo
      </table>
    </td>
  </tr>
  <tr spacer row />
</thead>
```

### Footer Synchronization

Both files use **identical** footer:
```html
<div class="print-footer"> <!-- position: fixed; bottom: 0 in CSS -->
  <div>brand.footerDisclaimer</div>
  <div>© {year} {brand.fullName}. כל הזכויות שמורות | גרסה {version}</div>
</div>
```

---

## Recent Changes (Session Summary)

### Print/Layout Fixes (March 2026)
1. Replaced flexbox headers with 3-cell inner `<table>` — solved RTL alignment
2. Removed `ResponsiveContainer` from charts — solved blank print
3. Replaced CSS variables with hardcoded hex in chart SVG — solved invisible elements
4. Moved from `tfoot` to `position: fixed` footer — solved footer overlap issues
5. Added spacer row in charts `<thead>` (14px) — content breathing room from header
6. Both headers/footers now fully synchronized between report and charts

### AI Parser Critical Fixes (April 2026)
7. **Currency inversion** — Removed ILS-first bias from system prompt. Added mandatory 3-step label identification (identify labels → extract numbers → assign by label). Prompt now warns that USD table often appears first in Israeli documents.
8. **y2025 data loss** — Added auto-promotion of `ytd{year}` → `y{year}` for December reports. The fund table expects `y2025` but Claude returns `ytd2025` for December YTD.
9. **Fund matching confusion** — Added `returnBasis` to fund matching context. Claude now sees currency per existing fund and won't match ILS doc to USD fund.
10. **KV overwrite protection** — PUT endpoint validates payload integrity before writing.
11. **Cache version → 8** — Forces re-parse of any cached results from pre-fix versions.

### Creative Value Parser Fix (v1.3, April 2026)
12. **temperature: 0** — All Claude API calls now use deterministic mode.
13. **Yearly swap correction** — `fixAnnualJanSwapPerYear()` detects and fixes Jan ↔ yearly swaps per year.
14. **corrections[] flag** — Diagnostic array tracking all auto-corrections (`yearly_swap`, `yearly_duplicate`, `monthly_uncertain`).
15. **Cache version → 11** — Invalidates all pre-fix cached parse results.
16. **Production verified** — Creative Value: all 6 yearly values correct, zero false positives.

### Key Files Changed (Parser Fixes)
```
app/api/parse/route.ts    — System prompt, ytd→y, matching, swap detection, corrections, cache v11
lib/parseTypes.ts         — corrections field on ParseDraft
```

---

## STABLE BASELINE — Parser Phase Complete

**Date:** 2026-04-03
**Commits:** 944ba93, e3022a8, b5b85f3, 2aa4cf0, c1db678

All parser functionality verified end-to-end in production.
v1.3: Creative Value yearly swap correction + corrections[] diagnostic flag.
No code changes needed — this is the locked baseline for future development.
