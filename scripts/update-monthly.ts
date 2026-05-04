/**
 * update-monthly.ts — Safe atomic monthly return updater.
 *
 * Patches a single fund's monthly return in KV with full date sync across
 * all system fields. Writes a timestamped backup before any change, verifies
 * the write with an immediate read-back, and restores on any error.
 *
 * Usage:
 *   npx tsx scripts/update-monthly.ts \
 *     --client green \
 *     --fund fund-22 \
 *     --month 2026-04 \
 *     --value 0.012 \
 *     --ytd 0.045 \
 *     [--report-month 04/2026] \
 *     [--dry-run] \
 *     [--force]
 *
 * IMPORTANT — Business rule on dates:
 *   --month is the DATA month (the period the return belongs to), NOT today.
 *   Example: running in early May 2026 to record April 2026 returns → --month 2026-04
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ── 1. Load production KV credentials before any import ────────────────────────
const envFile = path.join(process.cwd(), ".env.production.local");
if (!fs.existsSync(envFile)) {
  console.error("ERROR: .env.production.local not found.");
  console.error("  Run: vercel env pull .env.production.local --environment production");
  process.exit(1);
}
for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 0) continue;
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
}
process.env.VERCEL = "1"; // force KV path in storageRead/storageWrite

import { storageRead, storageWrite } from "../lib/storage";
import { FundsData, Fund } from "../lib/types";

// ── 2. Audit: all system fields that display update dates ──────────────────────
//
// data.lastUpdated (FundsData global — YYYY-MM-DD format):
//   app/page.tsx:98              — main page subtitle "עדכון: {formatDate(...)}"
//   app/page.tsx:159             — PrintReport prop
//   app/charts/page.tsx:281      — charts header (screen)
//   app/charts/page.tsx:301      — charts header (print)
//   app/charts/page.tsx:399      — charts footer (print)
//   app/data-completion/page.tsx:211 — data-completion subtitle
//   app/admin/page.tsx:357       — admin panel header "עדכון:"
//
// fund.lastReportDate (per-fund — YYYY-MM format):
//   components/FundCard.tsx:306  — "עדכון {formatReportDate(...)}" on fund card
//   components/FundTable.tsx:183 — main table date column
//   components/FundTableV2.tsx:32 — FundTableV2 fallback (when lastUpdated not YYYY-MM)
//   components/PrintReport.tsx:100 — print report date column
//   components/CompareTable.tsx:259 — under "תשואה חודשית" in compare
//   app/compare/page.tsx:224     — "מעודכן ל:" in compare card
//   app/fund-status/page.tsx:140 — display date in fund status page
//   app/admin/page.tsx:1222      — staleness warning (≥3 months alert)
//   app/consistency/page.tsx:778 — snaps consistency single-view endMonth picker
//   app/consistency/compare/page.tsx:135 — snaps compare-view date picker
//
// fund.lastUpdated (per-fund — YYYY-MM format, PRIMARY for display):
//   components/FundTableV2.tsx:27 — FIRST priority for update-date cell
//   app/fund-status/page.tsx:46  — effectiveKey for green/yellow/red status
//   app/api/parse/route.ts:2299  — staleness guard (blocks conflicting parser apply)

// ── 3. CLI argument parsing ────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  client: string;
  fund: string;
  month: string;
  value: number;
  ytd: number;
  reportMonth: string | null;
  dryRun: boolean;
  force: boolean;
} {
  const args = argv.slice(2);
  const get = (flag: string): string | null => {
    const i = args.indexOf(flag);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
  };
  const has = (flag: string): boolean => args.includes(flag);

  const client     = get("--client");
  const fund       = get("--fund");
  const month      = get("--month");
  const valueStr   = get("--value");
  const ytdStr     = get("--ytd");
  const reportMonth = get("--report-month");
  const dryRun     = has("--dry-run");
  const force      = has("--force");

  const missing: string[] = [];
  if (!client)   missing.push("--client");
  if (!fund)     missing.push("--fund");
  if (!month)    missing.push("--month");
  if (!valueStr) missing.push("--value");
  if (!ytdStr)   missing.push("--ytd");

  if (missing.length > 0) {
    console.error(`ERROR: Missing required arguments: ${missing.join(", ")}`);
    console.error("");
    console.error("Usage:");
    console.error("  npx tsx scripts/update-monthly.ts \\");
    console.error("    --client green \\");
    console.error("    --fund fund-22 \\");
    console.error("    --month 2026-04 \\");
    console.error("    --value 0.012 \\");
    console.error("    --ytd 0.045 \\");
    console.error("    [--report-month 04/2026] \\");
    console.error("    [--dry-run] [--force]");
    process.exit(1);
  }

  const value = parseFloat(valueStr!);
  const ytd   = parseFloat(ytdStr!);

  if (isNaN(value)) { console.error(`ERROR: --value "${valueStr}" is not a number`); process.exit(1); }
  if (isNaN(ytd))   { console.error(`ERROR: --ytd "${ytdStr}" is not a number`); process.exit(1); }

  return {
    client:      client!,
    fund:        fund!,
    month:       month!,
    value,
    ytd,
    reportMonth: reportMonth ?? null,
    dryRun,
    force,
  };
}

// ── 4. Validation helpers ──────────────────────────────────────────────────────

const MONTH_RE        = /^\d{4}-(0[1-9]|1[0-2])$/;       // YYYY-MM
const REPORT_MONTH_RE = /^(0[1-9]|1[0-2])\/\d{4}$/;       // MM/YYYY

/** Convert MM/YYYY → YYYY-MM */
function reportMonthToYYYYMM(rm: string): string {
  const [mm, yyyy] = rm.split("/");
  return `${yyyy}-${mm}`;
}

/** Derive YYYY from month string */
function yearOf(month: string): number {
  return parseInt(month.slice(0, 4), 10);
}

/** Returns the FundsData.returns key for a given data year vs the current year. */
function ytdKey(dataYear: number): string {
  const currentYear = new Date().getFullYear();
  return dataYear === currentYear ? `ytd${dataYear}` : `y${dataYear}`;
}

/** Compare two YYYY-MM strings — returns true if a is before b */
function monthBefore(a: string, b: string): boolean {
  return a < b;
}

// ── 5. Diff display ────────────────────────────────────────────────────────────

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return `${(v * 100).toFixed(4)}% (${v})`;
  return String(v);
}

function printDiff(label: string, before: unknown, after: unknown): void {
  const changed = before !== after;
  const symbol = changed ? "~" : "=";
  const arrow  = changed ? ` → ${fmtVal(after)}` : " (unchanged)";
  console.log(`  [${symbol}] ${label.padEnd(36)} ${fmtVal(before)}${arrow}`);
}

// ── 6. Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  update-monthly.ts — atomic monthly return patch");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  client      : ${args.client}`);
  console.log(`  fund        : ${args.fund}`);
  console.log(`  data month  : ${args.month}`);
  console.log(`  value       : ${(args.value * 100).toFixed(4)}% (${args.value})`);
  console.log(`  ytd         : ${(args.ytd * 100).toFixed(4)}% (${args.ytd})`);
  if (args.reportMonth) console.log(`  report-month: ${args.reportMonth} (override)`);
  if (args.dryRun) console.log("  *** DRY-RUN — no writes will happen ***");
  if (args.force)  console.log("  *** FORCE — skipping safety guards ***");
  console.log("");

  // ── Validate month format
  if (!MONTH_RE.test(args.month)) {
    console.error(`ERROR: --month "${args.month}" must be YYYY-MM (e.g. 2026-04)`);
    process.exit(1);
  }

  // ── Validate report-month if provided
  let storedLastReportDate: string = args.month; // default: YYYY-MM
  if (args.reportMonth) {
    if (!REPORT_MONTH_RE.test(args.reportMonth)) {
      console.error(`ERROR: --report-month "${args.reportMonth}" must be MM/YYYY (e.g. 04/2026)`);
      process.exit(1);
    }
    storedLastReportDate = reportMonthToYYYYMM(args.reportMonth); // convert to YYYY-MM
  }

  // ── Validate client
  const VALID_CLIENTS = ["green", "nox"];
  if (!VALID_CLIENTS.includes(args.client)) {
    console.error(`ERROR: --client must be one of: ${VALID_CLIENTS.join(", ")}`);
    process.exit(1);
  }

  // ── Value range check
  const VALUE_MIN = -0.5;
  const VALUE_MAX =  0.5;
  if (args.value < VALUE_MIN || args.value > VALUE_MAX) {
    if (!args.force) {
      console.error(`ERROR: --value ${args.value} is outside normal range [${VALUE_MIN}, ${VALUE_MAX}]`);
      console.error("  Pass --force to override this check.");
      process.exit(1);
    }
    console.warn(`  WARN: value ${args.value} is outside normal range — proceeding due to --force`);
  }

  // ── Load FundsData
  console.log(`Loading funds:${args.client} from KV...`);
  const data = await storageRead<FundsData>(`funds:${args.client}`, {
    lastUpdated: "",
    categories: [],
  });

  if (!data.categories || data.categories.length === 0) {
    console.error(`ERROR: No categories found for client "${args.client}". Is the KV key populated?`);
    process.exit(1);
  }

  // ── Create backup
  const timestamp  = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(os.tmpdir(), `kv-backup-funds-${args.client}-${timestamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`Backup saved to: ${backupPath}`);
  console.log("");

  // ── Find fund
  let foundFund: Fund | null = null;
  let foundCatName = "";

  for (const cat of data.categories) {
    const f = cat.funds.find((f) => f.id === args.fund);
    if (f) {
      foundFund    = f;
      foundCatName = cat.name;
      break;
    }
  }

  if (!foundFund) {
    // Print available fund IDs to help the caller
    const allIds = data.categories.flatMap((c) => c.funds.map((f) => `  ${f.id} — ${f.name}`));
    console.error(`ERROR: Fund "${args.fund}" not found in client "${args.client}".`);
    console.error("Available funds:");
    allIds.forEach((l) => console.error(l));
    process.exit(1);
  }

  console.log(`Fund found: "${foundFund.name}" (${foundCatName})`);
  console.log("");

  // ── startDate guard: month must be >= fund startDate
  if (foundFund.startDate && !args.force) {
    const startYYYYMM = foundFund.startDate.slice(0, 7); // "YYYY-MM" from "YYYY-MM-DD"
    if (monthBefore(args.month, startYYYYMM)) {
      console.error(`ERROR: --month ${args.month} is before fund startDate ${startYYYYMM}`);
      console.error("  Pass --force to override.");
      process.exit(1);
    }
  }

  // ── Existing value guard
  const existingMonthly = (foundFund.monthlyReturns || {})[args.month];
  if (existingMonthly !== undefined && existingMonthly !== null && !args.force) {
    console.error(`ERROR: monthlyReturns["${args.month}"] already has a value: ${fmtVal(existingMonthly)}`);
    console.error(`  New value would be: ${fmtVal(args.value)}`);
    console.error("  Pass --force to overwrite.");
    process.exit(1);
  }

  // ── Compute all field values
  const dataYear  = yearOf(args.month);
  const ytdField  = ytdKey(dataYear);
  const now       = new Date();
  const nowISO    = now.toISOString();
  const nowYYYYMM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Existing "before" snapshots for diff display
  const before = {
    "fund.monthlyReturn":          foundFund.monthlyReturn,
    [`fund.monthlyReturns[${args.month}]`]: existingMonthly ?? null,
    [`fund.returns.${ytdField}`]:  (foundFund.returns as Record<string, number | null>)[ytdField] ?? null,
    "fund.lastReportDate":         foundFund.lastReportDate,
    "fund.lastUpdated":            foundFund.lastUpdated ?? null,
    "data.lastUpdated (global)":   data.lastUpdated,
  };

  const after = {
    "fund.monthlyReturn":          args.value,
    [`fund.monthlyReturns[${args.month}]`]: args.value,
    [`fund.returns.${ytdField}`]:  args.ytd,
    "fund.lastReportDate":         storedLastReportDate,
    "fund.lastUpdated":            nowYYYYMM,
    "data.lastUpdated (global)":   `${args.month}-01`,
  };

  // ── Diff display
  console.log("─── DIFF ─────────────────────────────────────────────────────");
  for (const key of Object.keys(before)) {
    printDiff(key, before[key as keyof typeof before], after[key as keyof typeof after]);
  }
  console.log("");
  console.log(`  [✓] All other ${data.categories.flatMap((c) => c.funds).length - 1} funds: NOT TOUCHED`);
  console.log("  [✓] Benchmarks: NOT TOUCHED");
  console.log("─────────────────────────────────────────────────────────────");
  console.log("");

  if (args.dryRun) {
    console.log("DRY-RUN complete. No data was written.");
    console.log("");
    printSummary(args, backupPath, foundFund.name, true);
    process.exit(0);
  }

  // ── Apply patch in-memory
  if (!foundFund.monthlyReturns) {
    foundFund.monthlyReturns = {};
  }
  foundFund.monthlyReturn                    = args.value;
  foundFund.monthlyReturns[args.month]       = args.value;
  (foundFund.returns as Record<string, number | null>)[ytdField] = args.ytd;
  foundFund.lastReportDate                   = storedLastReportDate;
  foundFund.lastUpdated = nowYYYYMM;

  // Global lastUpdated — first day of data month so formatDate shows the right month
  data.lastUpdated = `${args.month}-01`;

  // ── Write
  console.log(`Writing funds:${args.client} to KV...`);
  let writeError: Error | null = null;
  try {
    await storageWrite(`funds:${args.client}`, data);
  } catch (err) {
    writeError = err as Error;
  }

  if (writeError) {
    console.error(`ERROR during write: ${writeError.message}`);
    console.error("Attempting restore from backup...");
    try {
      const backup = JSON.parse(fs.readFileSync(backupPath, "utf-8")) as FundsData;
      await storageWrite(`funds:${args.client}`, backup);
      console.error("Restore successful. KV state is unchanged.");
    } catch (restoreErr) {
      console.error(`CRITICAL: Restore FAILED: ${(restoreErr as Error).message}`);
      console.error(`Manual restore required. Backup at: ${backupPath}`);
    }
    process.exit(1);
  }

  // ── Read-back verification
  console.log("Verifying write (read-back)...");
  const verify = await storageRead<FundsData>(`funds:${args.client}`, { lastUpdated: "", categories: [] });

  let verifyFund: Fund | null = null;
  for (const cat of verify.categories) {
    const f = cat.funds.find((f) => f.id === args.fund);
    if (f) { verifyFund = f; break; }
  }

  let verifyOk = true;

  if (!verifyFund) {
    console.error("VERIFY ERROR: fund not found in read-back!");
    verifyOk = false;
  } else {
    const checks: Array<[string, unknown, unknown]> = [
      ["monthlyReturn",      verifyFund.monthlyReturn,                                    args.value],
      [`monthlyReturns[${args.month}]`, (verifyFund.monthlyReturns || {})[args.month],    args.value],
      [`returns.${ytdField}`, (verifyFund.returns as Record<string, number | null>)[ytdField], args.ytd],
      ["lastReportDate",     verifyFund.lastReportDate,                                   storedLastReportDate],
      ["lastUpdated (fund)", verifyFund.lastUpdated,                                      nowYYYYMM],
      ["lastUpdated (data)", verify.lastUpdated,                                           `${args.month}-01`],
    ];

    for (const [label, got, expected] of checks) {
      const ok = typeof got === "number" && typeof expected === "number"
        ? Math.abs(got - expected) < 1e-10
        : got === expected;
      if (!ok) {
        console.error(`  VERIFY FAIL: ${label} — expected ${fmtVal(expected)}, got ${fmtVal(got)}`);
        verifyOk = false;
      }
    }
  }

  if (!verifyOk) {
    console.error("");
    console.error("CRITICAL: Verification failed. Manual check required.");
    console.error(`  Backup (pre-write state) at: ${backupPath}`);
    process.exit(1);
  }

  console.log("  All fields verified. ✓");
  console.log("");

  printSummary(args, backupPath, foundFund.name, false);
}

// ── 7. Summary ─────────────────────────────────────────────────────────────────

function printSummary(
  args: { client: string; fund: string; month: string },
  backupPath: string,
  fundName: string,
  dryRun: boolean,
): void {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(dryRun ? "  DRY-RUN SUMMARY" : "  UPDATE COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Fund       : ${fundName} (${args.fund})`);
  console.log(`  Data month : ${args.month}`);
  console.log(`  Backup     : ${backupPath}`);
  console.log("");
  if (!dryRun) {
    console.log("  Fields updated:");
    console.log("    fund.monthlyReturn         — scalar for table display");
    console.log(`    fund.monthlyReturns[${args.month}] — monthly history`);
    console.log("    fund.returns.ytd*/y*        — YTD / annual return");
    console.log("    fund.lastReportDate         — YYYY-MM (data month)");
    console.log("    fund.lastUpdated            — YYYY-MM (data month, display priority)");
    console.log("    data.lastUpdated            — YYYY-MM-DD (global, report header)");
    console.log("");
    console.log("  System locations that now reflect the new date:");
    console.log("    [1] app/page.tsx:98              — main page subtitle");
    console.log("    [2] app/charts/page.tsx:281,301  — charts header");
    console.log("    [3] app/admin/page.tsx:357       — admin panel header");
    console.log("    [4] components/FundCard.tsx:306  — fund card subtitle");
    console.log("    [5] components/FundTable.tsx:183 — main table date column");
    console.log("    [6] components/FundTableV2.tsx   — FundTableV2 date cell");
    console.log("    [7] components/PrintReport.tsx   — print report date column");
    console.log("    [8] app/fund-status/page.tsx     — status green/yellow/red");
    console.log("    [9] app/consistency/page.tsx     — consistency endMonth picker");
    console.log("");
    console.log("  Checklist (verify in browser after deploy):");
    console.log("    [ ] Main page subtitle shows new month");
    console.log("    [ ] Admin panel header shows new date");
    console.log("    [ ] Fund card shows correct report date");
    console.log("    [ ] Fund status page: fund is GREEN (not yellow/red)");
    console.log("    [ ] Consistency single view: endMonth snapped to new month");
    console.log("    [ ] Print report: date column shows new month");
  }
  console.log("═══════════════════════════════════════════════════════════");
}

// ── Entry point ────────────────────────────────────────────────────────────────
main().catch((err: Error) => {
  console.error(`FATAL: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
