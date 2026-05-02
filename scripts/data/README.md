# Benchmark History Data

This directory holds CSV files with historical monthly return data for benchmarks.
These files are one-time inputs for `scripts/upload-benchmark-history.ts`.

---

## CSV Format

File name: anything descriptive, e.g. `benchmark-ta125.csv`

The script accepts **both** percent and decimal formats — auto-detected from the values:

**Percent format** (as exported from TASE / Bloomberg):
```
month,return
2024-05,1.23
2024-06,-0.45
2024-07,2.01
```

**Decimal format:**
```
month,return
2024-05,0.0123
2024-06,-0.0045
2024-07,0.0201
```

- **month** — `YYYY-MM` format (e.g. `2024-05`)
- **return** — either percent (`1.23` = 1.23%) or decimal (`0.0123` = 1.23%)
- Detection rule: all values in `[-1, 1]` → decimal; all values in `[-50, 50]` with at least one `|v|>1` → percent; mixed → error
- Header row (`month,return`) is optional — the script skips it automatically
- Semicolons also accepted as separator

---

## How to Run

```bash
# Pull fresh production credentials first (once per session)
vercel env pull .env.production.local --environment production

# Upload each benchmark
npx tsx scripts/upload-benchmark-history.ts ./scripts/data/benchmark-ta125.csv bm-ta125
npx tsx scripts/upload-benchmark-history.ts ./scripts/data/benchmark-telbond-maagar.csv bm-telbond-maagar
npx tsx scripts/upload-benchmark-history.ts ./scripts/data/benchmark-agach-klali.csv bm-agach-klali
```

The script **never overwrites** existing months — safe to re-run.

---

## Required Benchmarks for v2 Consistency Feature

IDs confirmed from production KV:

| Benchmark ID          | Name           | KV Key           |
|-----------------------|----------------|------------------|
| `bm-ta125`            | ת"א 125        | `benchmarks:green` |
| `bm-telbond-maagar`   | תל בונד-מאגר   | `benchmarks:green` |
| `bm-agach-klali`      | אג"ח כללי      | `benchmarks:green` |

---

## Required Date Range

The 24-month rolling window ending April 2026 requires:

**May 2024 → April 2026** (24 months: `2024-05` through `2026-04`)

### Current KV state (as of May 2026)

All three benchmarks currently have **only 2 months** in KV: `2026-01` and `2026-02`.

**You need to upload all 22 missing months:**

| Range | Months | Note |
|-------|--------|------|
| `2024-05` → `2025-12` | 20 months | Historical — upload via script |
| `2026-03` | 1 month | March 2026 — upload via script |
| `2026-04` | 1 month | April 2026 — upload via script |

> **Note:** Benchmark data is maintained **manually only**. There is no automatic flow
> that adds new months from fund reports. When a new month passes, you must upload
> the benchmark return for that month yourself.

---

## Verify After Upload

```bash
npx tsx scripts/verify-production-kv.ts
```

Look for: `In 24M window : 24 / 24` for each of the three benchmarks.

---

## Data Sources

- **ת"א 125** — [TASE website](https://www.tase.co.il), monthly index data → compute returns
- **תל בונד-מאגר** — TASE website or Bloomberg
- **אג"ח כללי** — TASE website or Bloomberg

Returns are computed as: `(close_month / close_prev_month) - 1`

If TASE exports the value directly as a percent return (e.g. `1.23`), you can paste it
as-is — the script will auto-detect and convert.
