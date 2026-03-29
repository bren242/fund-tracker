# DEV STATE — System Functionality & Stability

**Status:** STABLE
**Date:** 2026-03-28

---

## System Health

| Component | Status | Notes |
|-----------|--------|-------|
| Report page (`/`) | ✅ Stable | Print + screen working |
| Charts page (`/charts`) | ✅ Stable | Print + screen working |
| Admin page (`/admin`) | ✅ Stable | Brand config, logo upload, funds CRUD |
| Multi-client isolation | ✅ Stable | NOX + GREEN clients verified |
| Print — Report | ✅ Stable | Header repeats, footer fixed, years filterable |
| Print — Charts | ✅ Stable | Chart renders, header repeats, footer fixed |
| Data layer | ✅ Stable | JSON read/write with auto-backup |

---

## File Map

### Pages
```
app/page.tsx           — Main report (fund table + filters + print trigger)
app/charts/page.tsx    — Scatter plot (risk vs return) + print layout
app/admin/page.tsx     — Admin panel (brand config + fund management)
```

### Components
```
components/PrintReport.tsx   — Print-only table for fund report
components/FundTable.tsx     — Screen fund table with sorting/filtering
components/FilterBar.tsx     — Category/manager/search filters
components/BrandLogo.tsx     — Logo renderer (supports light/dark variants)
components/ClientGate.tsx    — Password gate wrapper
components/PasswordInput.tsx — Password input UI
components/ThemeProvider.tsx  — Dark/light theme context
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

1. Replaced flexbox headers with 3-cell inner `<table>` — solved RTL alignment
2. Removed `ResponsiveContainer` from charts — solved blank print
3. Replaced CSS variables with hardcoded hex in chart SVG — solved invisible elements
4. Moved from `tfoot` to `position: fixed` footer — solved footer overlap issues
5. Added spacer row in charts `<thead>` (14px) — content breathing room from header
6. Both headers/footers now fully synchronized between report and charts
