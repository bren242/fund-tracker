# PROJECT STATE — מעקב קרנות (Fund Tracker)

## Current Milestone: System Working & Stable

**Last Updated:** 2026-03-28

---

## System Overview

White-label multi-client fund tracking web application built with Next.js 15 (App Router).
Designed for institutional-grade reporting and print output for top-tier clients.

### Architecture
- **Framework:** Next.js 15.5.14 with App Router (Windows)
- **UI Direction:** RTL (Hebrew)
- **Styling:** Tailwind CSS + CSS variables + inline styles for print
- **Charts:** Recharts (scatter plot with fixed dimensions for print)
- **Multi-Client:** Client isolation via `?client=<key>` URL param (e.g., `nox`, `green`)
- **Data Storage:** JSON files under `data/{clientKey}/` (funds.json, brand.json)
- **Auth:** Password gate using sessionStorage (`client-auth-{clientKey}`)

### Pages
| Page | Path | Description |
|------|------|-------------|
| Report | `/` | Main fund report table with print support |
| Charts | `/charts` | Scatter plot (risk vs return) with print support |
| Admin | `/admin` | Brand config, fund management, logo upload |

### Active Clients
| Client | Key | Admin Password | Data Path |
|--------|-----|----------------|-----------|
| NOX | `nox` | `nox2020` | `data/nox/` |
| GREEN | `green` | `green2026` | `data/green/` |

---

## Completed Features

### Core
- [x] Multi-client data isolation (funds.json + brand.json per client)
- [x] Client password gate with sessionStorage persistence
- [x] Fund report table with all year columns (2019–2026)
- [x] Category-based grouping with color-coded section headers
- [x] Filter bar (category, manager, search)
- [x] Dark/light theme toggle
- [x] Admin panel with logo upload, disclaimer, brand config

### Print — Report (PrintReport.tsx)
- [x] Landscape A4 layout with proper margins
- [x] Repeating header (logo + title + date) via `<thead>`
- [x] 3-cell inner `<table>` for reliable RTL header alignment
- [x] Year selection (printYears[] → filtered columns)
- [x] Dynamic column widths based on selected years
- [x] Color-coded return values (green/red/neutral)
- [x] Row striping, category headers, super-header
- [x] Fixed footer with disclaimer + copyright on every page
- [x] Page-break-inside: avoid for rows

### Print — Charts (charts/page.tsx)
- [x] Portrait A4 layout with proper margins
- [x] Repeating header (logo + title + date) via `<thead>`
- [x] 3-cell inner `<table>` — identical structure to report header
- [x] Spacer row (14px) below header border for breathing room
- [x] Fixed-dimension ScatterChart (660×380, no ResponsiveContainer)
- [x] Hardcoded hex colors instead of CSS variables in SVG
- [x] Category title (bold, centered, with underline)
- [x] Legend table (centered, 65% width)
- [x] Rank cards (מובילות / מפגרות) side by side
- [x] Fixed footer with disclaimer + copyright on every page
- [x] Scatter point labels visible in print

### Print CSS (globals.css)
- [x] `@page { size: A4 landscape; margin: 6mm 6mm 14mm 6mm }`
- [x] `.print-footer { position: fixed; bottom: 0 }` for every-page footer
- [x] `-webkit-print-color-adjust: exact` for color preservation
- [x] SVG dot/label opacity forced to 1
- [x] `.print-only` / `.no-print` visibility toggles
- [x] `thead { display: table-header-group }` for header repetition
- [x] `tr { page-break-inside: avoid }` for clean row breaks

---

## Known Issues / Limitations

1. **Browser print headers/footers** — Users must uncheck "Headers and footers" in browser print dialog
2. **sessionStorage cross-origin** — Print preview in some contexts may not access sessionStorage
3. **CSS variables in SVG** — Will NOT render in print; must always use hardcoded hex colors
4. **ResponsiveContainer** — Cannot be used for print (uses ResizeObserver); must use fixed dimensions
5. **`tfoot` unreliable** — Conflicts with `.print-only { display: revert }` CSS; use `position: fixed` footer div instead
6. **Flexbox RTL** — Unreliable for print alignment; use inner `<table>` layout instead
