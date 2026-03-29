# Changelog

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
