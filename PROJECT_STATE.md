# PROJECT STATE — Fund Tracker

## Current Version: v1.1
**Last Updated:** 2026-03-29
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
- **Data Storage:** JSON files under `data/{clientKey}/` (funds.json, brand.json)
- **Auth:** Password gate using sessionStorage (`client-auth-{clientKey}`)

### Pages
| Page | Path | Description |
|------|------|-------------|
| Report | `/{client}` | Main fund report table with print support |
| Charts | `/{client}/charts` | Scatter plot (risk vs return) with print support |
| Compare | `/{client}/compare` | Fund comparison (basic/advanced) |
| Admin | `/admin?client={key}` | Brand config, fund management, logo upload |
| 404 | `/` | Custom branded guide for missing client |

### Active Clients
| Client | Key | Features | Version |
|--------|-----|----------|---------|
| GREEN | `green` | Full (comparison advanced + charts) | 1.1 |
| NOX | `nox` | Basic (comparison + charts disabled) | 1.1 |

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

1. **Admin saves locally only** — Vercel filesystem is read-only; changes must be pushed via Git
2. **Browser print headers/footers** — Users must uncheck "Headers and footers" in browser print dialog
3. **CSS variables in SVG** — Will NOT render in print; must always use hardcoded hex colors
4. **ResponsiveContainer** — Cannot be used for print; must use fixed chart dimensions
5. **Desktop-first** — Responsive design is functional but not fully optimized for mobile

---

## Future Considerations

- Vercel KV/Blob for production admin saves
- Database integration (Supabase/Neon) for scalable data
- Mobile-first responsive design pass
- Excel upload for fund data
- User roles (admin vs viewer)
