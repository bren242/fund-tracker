# Benchmark History Data

This directory holds CSV files with historical monthly return data for benchmarks.
These files are one-time inputs for `scripts/upload-benchmark-history.ts`.

---

## CSV Format

File name: anything descriptive, e.g. `benchmark-ta125.csv`

```
month,return
2024-05,0.0123
2024-06,-0.0045
2024-07,0.0201
...
```

- **month** — `YYYY-MM` format (e.g. `2024-05`)
- **return** — decimal (e.g. `0.0123` = 1.23%, `-0.0045` = −0.45%)
- Header row (`month,return`) is optional — the script skips it automatically
- Semicolons also accepted as separator

---

## How to Run

```bash
# Pull fresh production credentials first (once per session)
vercel env pull .env.production.local --environment production

# Upload a single benchmark
npx tsx scripts/upload-benchmark-history.ts ./scripts/data/benchmark-ta125.csv bm-ta125
npx tsx scripts/upload-benchmark-history.ts ./scripts/data/benchmark-telbond-maagar.csv bm-telbond-maagar
npx tsx scripts/upload-benchmark-history.ts ./scripts/data/benchmark-agach-klali.csv bm-agach-klali
```

The script **never overwrites** existing months — safe to re-run.

---

## Required Benchmarks for v2 Consistency Feature

| Benchmark ID        | Name             | KV Key          |
|---------------------|------------------|-----------------|
| `bm-ta125`          | ת"א 125          | benchmarks:green |
| `bm-telbond-maagar` | תל בונד מאגר     | benchmarks:green |
| `bm-agach-klali`    | אג"ח כללי        | benchmarks:green |

---

## Required Date Range

The 24-month rolling window ending April 2026 requires:

**May 2024 → April 2026** (24 months)

Months needed: `2024-05` through `2026-04`

The current KV data already has `2026-01` and `2026-02` for all three benchmarks.
You need to add: `2024-05` through `2025-12` (20 months) + `2026-03` and `2026-04`.

---

## Verify After Upload

```bash
npx tsx scripts/verify-production-kv.ts
```

Look for: `In 24M window : 24 / 24` for each of the three benchmarks.

---

## Data Sources

- **ת"א 125** — TASE website, monthly close prices → compute returns
- **תל בונד מאגר** — TASE website or Bloomberg
- **אג"ח כללי** — TASE website or Bloomberg

Returns are computed as: `(close_month / close_prev_month) - 1`
