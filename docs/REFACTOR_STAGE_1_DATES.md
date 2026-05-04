# Refactor Stage 1 — Date Field Unification

## Summary

All date fields across the system now follow a single, consistent format: **YYYY-MM**.

`fund.lastReportDate` has been removed. `fund.lastUpdated` is the single source of truth for a fund's data month. `data.lastUpdated` (global tenant field) is now also YYYY-MM.

---

## Before / After

| Field | Before | After |
|-------|--------|-------|
| `fund.lastReportDate` | `string \| null` (YYYY-MM, MM/YYYY, DD.MM.YYYY, etc.) | **Removed** |
| `fund.lastUpdated` | `string?` (ISO timestamp or YYYY-MM, inconsistent) | `string \| null` (YYYY-MM, required) |
| `fund.lastUpdatedAt` | `string?` (sometimes set, sometimes not) | `string?` (ISO timestamp, used for staleness guard) |
| `data.lastUpdated` | `string` (YYYY-MM-DD, full date) | `string` (YYYY-MM) |

---

## Files Changed

### Core types
| File | Change |
|------|--------|
| `lib/types.ts` | Removed `lastReportDate`; `lastUpdated: string \| null` (required); comment on `data.lastUpdated` |
| `lib/format.ts` | Added YYYY-MM fast path to `formatReportDate` (avoids timezone issues with `new Date()`) |

### Components
| File | Change |
|------|--------|
| `components/FundCard.tsx` | `lastReportDate` → `lastUpdated` |
| `components/FundTable.tsx` | `lastReportDate` → `lastUpdated` |
| `components/FundTableV2.tsx` | Simplified `fmtUpdateCell` — no longer needs regex guard, `formatReportDate(fund.lastUpdated)` |
| `components/PrintReport.tsx` | `lastReportDate` → `lastUpdated` |
| `components/CompareTable.tsx` | `lastReportDate` → `lastUpdated` |

### App pages
| File | Change |
|------|--------|
| `app/page.tsx` | `formatDate` → `formatReportDate` for `data.lastUpdated` |
| `app/charts/page.tsx` | `formatDate` → `formatReportDate` for `data.lastUpdated` (3 locations) |
| `app/data-completion/page.tsx` | `formatDate` → `formatReportDate` for `data.lastUpdated` |
| `app/compare/page.tsx` | `lastReportDate` → `lastUpdated` in fund card |
| `app/fund-status/page.tsx` | `rdk = fund.lastReportDate` → `fund.lastUpdated` |
| `app/consistency/page.tsx` | `FundConsistencyData` type + all reads: `lastReportDate` → `lastUpdated` |
| `app/consistency/compare/page.tsx` | `FundMetrics` type + all reads: `lastReportDate` → `lastUpdated` |

### API routes
| File | Change |
|------|--------|
| `app/api/parse/route.ts` | **Staleness guard**: reads `lastUpdatedAt` (ISO) not `lastUpdated`; **apply**: writes `lastUpdated = reportMonth` (YYYY-MM) + `lastUpdatedAt = ISO`; removes `lastReportDate` write; `data.lastUpdated = reportMonth` (YYYY-MM); new fund creation: `lastUpdated` instead of `lastReportDate` |
| `app/api/consistency-data/route.ts` | Response: `lastReportDate` → `lastUpdated` |
| `app/api/consistency-compare-data/route.ts` | Response: `lastReportDate` → `lastUpdated` |
| `app/api/consistency-ai/route.ts` | Local `ConsistencyPayload` type: `lastReportDate` → `lastUpdated` |

### Admin page
| File | Change |
|------|--------|
| `app/admin/page.tsx` | Import `formatReportDate`; admin header uses `formatReportDate(data.lastUpdated)`; "מעודכן לתאריך" input changed from `type="date"` to `type="month"`; staleness warning: `lastReportDate` → `lastUpdated`; fund add/edit form: `lastReportDate` field → `lastUpdated` with `type="month"` |

### Scripts & tests
| File | Change |
|------|--------|
| `scripts/update-monthly.ts` | Removed `--report-month` flag and `storedLastReportDate`; `data.lastUpdated = args.month` (YYYY-MM, not YYYY-MM-01); removed `fund.lastReportDate` from diff/apply/verify |
| `__tests__/category-average.test.ts` | `lastReportDate: null` → `lastUpdated: null` |
| `__tests__/consistency-v2.test.ts` | `lastReportDate: null` → `lastUpdated: null` |

---

## Migration Script

`scripts/migrate-dates.ts` — runs once against production KV.

**What it does:**
1. Reads `funds:green` and `funds:nox` from KV
2. Writes full backup to `/tmp/kv-backup-dates-{client}-{timestamp}.json`
3. For each fund:
   - Converts `lastUpdated` from ISO timestamp to YYYY-MM (if needed)
   - Falls back to `lastReportDate` if `lastUpdated` is absent
   - Deletes `lastReportDate` property
4. `data.lastUpdated`: YYYY-MM-DD or ISO → YYYY-MM
5. Verifies all `lastUpdated` fields are valid YYYY-MM after write

**Supported input formats for conversion:**
- ISO timestamp: `"2026-04-23T06:52:39.191Z"` → `"2026-04"`
- YYYY-MM-DD: `"2026-04-01"` → `"2026-04"`
- MM/YYYY: `"04/2026"` → `"2026-04"`
- DD/MM/YYYY: `"31/03/2026"` → `"2026-03"`
- YYYY-MM: unchanged

**Dry-run output (2026-05-04):**
- GREEN: 89 changes (ISO timestamps → YYYY-MM, lastReportDate deletions)
- NOX: 49 changes (lastReportDate deletions, data.lastUpdated conversion)

**To run:**
```bash
# Preview only (no writes):
npx tsx scripts/migrate-dates.ts --dry-run

# Execute:
npx tsx scripts/migrate-dates.ts
```

**After prod migration:**
```bash
git rm scripts/migrate-dates.ts
git commit -m "chore: remove migrate-dates.ts after prod migration"
```

---

## Key Behaviour Changes

### `formatReportDate` — timezone-safe for YYYY-MM
Before: `new Date("2026-04")` could return month 3 (March) in UTC-5 timezones.
After: regex fast-path `"2026-04"` → `"04/2026"` with no Date constructor.

### Parser — `lastUpdated` is now the data month
Before: parser wrote `lastUpdated = new Date().toISOString()` (write time) + `lastReportDate = "MM/YYYY"`.
After: parser writes `lastUpdated = reportMonth` (YYYY-MM, data month) + `lastUpdatedAt = ISO` (write time).

### Staleness guard — uses `lastUpdatedAt`
Before: compared `fund.lastUpdated` (ISO timestamp) vs `diffComputedAt` (ISO timestamp).
After: compares `fund.lastUpdatedAt` (ISO timestamp) vs `diffComputedAt` (ISO timestamp). Semantically identical, but now `lastUpdated` is free to carry the data month.

### Admin "מעודכן לתאריך" input
Before: `<input type="date">` — required YYYY-MM-DD.
After: `<input type="month">` — returns YYYY-MM natively. No conversion needed.

---

## Verification Checklist (post-deploy)

```
[ ] Main page (/green) — subtitle shows "MM/YYYY" format correctly
[ ] Fund status (/green/fund-status) — green/yellow/red status correct
[ ] Admin panel (/green/admin) — header shows "עדכון: MM/YYYY"
[ ] Admin "עדכון חודשי" tab — month picker works, saves correctly
[ ] FundTableV2 — "עדכון אחרון" column shows MM/YYYY
[ ] Consistency single view — endMonth picker snaps to fund's lastUpdated
[ ] Consistency compare — date picker snaps correctly
[ ] Print report (Ctrl+P) — date column shows MM/YYYY
[ ] Charts page — header date shows MM/YYYY
[ ] Parser apply — new lastUpdated is YYYY-MM (not ISO timestamp)
```

---

## Stage 2 & 3 (NOT YET)

- Stage 2: Computed fields — `returns.*`, `sharpe`, `stdDev`, `avgAnnualReturn`
- Stage 3: UI — monthly update screen with YTD preview
