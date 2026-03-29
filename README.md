# Fund Tracker v1.1

A professional **white-label fund tracking platform** built with Next.js.
Each client gets a fully branded experience — custom logo, colors, features, and data.

## Features

- **Fund Report** — Full table with annual returns, averages, Sharpe, StdDev, AUM. Cascading filters (group > category > classification > search). Print-ready A4 PDF.
- **Fund Comparison** — Select up to 4 funds for side-by-side comparison with auto-highlighted winners. Advanced mode adds line charts.
- **Risk vs Return Chart** — Scatter chart with automatic top/bottom ranking. Same filter bar as report for consistent UX.
- **Admin Panel** — Manage branding (logo, colors, name), feature flags, print footer, and passwords per client.
- **White Label** — Each client has separate branding, data, and feature configuration. Adding a new client = one new folder.
- **Print** — A4 portrait with repeating headers, disclaimers, and brand-consistent styling across all pages.
- **Clean URLs** — `/green`, `/nox/charts`, `/nox/compare` — middleware handles routing.
- **Custom 404** — Bare `/` shows a branded guide page.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 15 (App Router) |
| UI | React 19, RTL, Inline Styles |
| Charts | Recharts |
| Hosting | Vercel (auto-deploy on push) |
| Routing | Middleware rewrite |
| State | URL params + React hooks |
| Data | Static JSON per client |

## Project Structure

```
app/
  page.tsx          # Fund report
  charts/page.tsx   # Risk vs return chart
  compare/page.tsx  # Fund comparison
  admin/page.tsx    # Admin panel
  not-found.tsx     # Custom 404
  api/              # API routes (brand, funds, auth)

components/
  FilterBar.tsx     # Shared cascading filter bar
  FundTable.tsx     # Fund data table
  CompareTable.tsx  # Comparison table
  CompareCharts.tsx # Comparison line chart
  CompareSummary.tsx # Leading fund card
  PrintReport.tsx   # Print layout
  BrandLogo.tsx     # Logo component

lib/
  useFilters.ts     # Cascading filter hook
  useClientKey.ts   # Client detection hook
  useBrand.ts       # Brand config hook
  clientKey.ts      # Client key helpers
  colors.ts         # CSS variable helpers
  format.ts         # Date/number formatting
  types.ts          # TypeScript types

config/
  brand.ts          # Brand config types + defaults

data/
  green/            # GREEN client (brand.json + funds.json)
  nox/              # NOX client (brand.json + funds.json)

middleware.ts       # URL routing (/green, /nox)
```

## Adding a New Client

1. Create `data/{client-name}/brand.json` (copy from existing)
2. Create `data/{client-name}/funds.json` (fund data)
3. Add client key to `CLIENT_KEYS` in `lib/clientKey.ts`
4. Push to GitHub — Vercel deploys automatically

## Development

```bash
npm install
npm run dev        # http://localhost:3000/green
```

## Deployment

Connected to Vercel. Every `git push origin main` triggers automatic deployment.

```
/green          → GREEN client
/nox            → NOX client
/green/charts   → GREEN charts
/green/compare  → GREEN comparison
```

