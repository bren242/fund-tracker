/**
 * migrate-dates.ts — One-time migration for Stage 1 date refactor.
 *
 * What it does (per client):
 *   1. Reads funds:{client} from KV
 *   2. Writes a full backup to /tmp/kv-backup-dates-{client}-{timestamp}.json
 *   3. For each fund:
 *      - If lastUpdated looks like an ISO timestamp (2026-05-04T...) → slice to YYYY-MM
 *      - If lastReportDate exists → convert to YYYY-MM if needed, write to lastUpdated
 *        ONLY if lastUpdated is not already set
 *      - Delete lastReportDate property
 *   4. data.lastUpdated: if YYYY-MM-DD → slice to YYYY-MM; if ISO → slice to YYYY-MM
 *   5. Writes result back to KV (unless --dry-run)
 *   6. Verifies each fund's lastUpdated is now a valid YYYY-MM string
 *
 * Usage:
 *   npx tsx scripts/migrate-dates.ts --dry-run       # preview without writing
 *   npx tsx scripts/migrate-dates.ts                 # execute migration
 *
 * After running in prod: delete this file with:
 *   git rm scripts/migrate-dates.ts && git commit -m "chore: remove migrate-dates.ts after prod migration"
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ── Load env ────────────────────────────────────────────────────────────────
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
process.env.VERCEL = "1";

import { storageRead, storageWrite } from "../lib/storage";

// ── helpers ──────────────────────────────────────────────────────────────────

const YYYY_MM_RE      = /^\d{4}-\d{2}$/;
const YYYY_MM_DD_RE   = /^\d{4}-\d{2}-\d{2}/;
const ISO_TS_RE       = /^\d{4}-\d{2}-\d{2}T/;
const MM_YYYY_RE      = /^(\d{1,2})\/(\d{4})$/;         // "04/2026"
const DD_MM_YYYY_RE   = /^(\d{2})\/(\d{2})\/(\d{4})$/;  // "31/03/2026"

/** Convert any date-like string to YYYY-MM, or return null if unrecognisable */
function toYYYYMM(s: string | null | undefined): string | null {
  if (!s) return null;
  if (YYYY_MM_RE.test(s))    return s;
  if (ISO_TS_RE.test(s))     return s.slice(0, 7);        // "2026-05-04T..." → "2026-05"
  if (YYYY_MM_DD_RE.test(s)) return s.slice(0, 7);        // "2026-05-04" → "2026-05"
  const mmyyyy = s.match(MM_YYYY_RE);
  if (mmyyyy) return `${mmyyyy[2]}-${mmyyyy[1].padStart(2, "0")}`; // "04/2026" → "2026-04"
  const ddmmyyyy = s.match(DD_MM_YYYY_RE);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}`;   // "31/03/2026" → "2026-03"
  return null;
}

const dryRun = process.argv.includes("--dry-run");

// ── main ─────────────────────────────────────────────────────────────────────

async function migrateClient(client: string): Promise<void> {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Client: ${client}${dryRun ? "  [DRY-RUN]" : ""}`);
  console.log(`${"═".repeat(60)}`);

  const data = await storageRead<Record<string, unknown>>(`funds:${client}`, { lastUpdated: "", categories: [] });

  // Backup
  const timestamp  = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(os.tmpdir(), `kv-backup-dates-${client}-${timestamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`  Backup → ${backupPath}`);

  let changes = 0;

  // ── Migrate data.lastUpdated (global) ────────────────────────────────────
  const globalRaw = data.lastUpdated as string | null;
  const globalNew = toYYYYMM(globalRaw);
  if (globalNew && globalNew !== globalRaw) {
    console.log(`  [~] data.lastUpdated: "${globalRaw}" → "${globalNew}"`);
    if (!dryRun) data.lastUpdated = globalNew;
    changes++;
  } else {
    console.log(`  [=] data.lastUpdated: "${globalRaw}" (ok)`);
  }

  // ── Migrate each fund ────────────────────────────────────────────────────
  const categories = (data.categories as Record<string, unknown>[]) || [];
  for (const cat of categories) {
    const funds = (cat.funds as Record<string, unknown>[]) || [];
    for (const fund of funds) {
      const name = (fund.name as string) || (fund.id as string);

      const rawUpdated    = fund.lastUpdated as string | null | undefined;
      const rawReportDate = fund.lastReportDate as string | null | undefined;

      // Determine target YYYY-MM:
      // Priority: lastUpdated (if already set or ISO timestamp) > lastReportDate > null
      let targetYYYYMM: string | null = null;

      if (rawUpdated) {
        targetYYYYMM = toYYYYMM(rawUpdated);
      }
      if (!targetYYYYMM && rawReportDate) {
        targetYYYYMM = toYYYYMM(rawReportDate);
      }

      let fundChanged = false;

      // Update lastUpdated
      if (targetYYYYMM !== (rawUpdated ?? null)) {
        console.log(`  [~] ${name}: lastUpdated "${rawUpdated ?? "—"}" → "${targetYYYYMM ?? "null"}"`);
        if (!dryRun) fund.lastUpdated = targetYYYYMM;
        fundChanged = true;
      } else if (rawReportDate) {
        // lastUpdated already correct but lastReportDate still exists
        fundChanged = true; // need to delete it
      }

      // Delete lastReportDate if present
      if (rawReportDate !== undefined) {
        if (!dryRun) delete fund.lastReportDate;
        if (fundChanged || rawReportDate !== undefined) {
          console.log(`  [x] ${name}: deleted lastReportDate ("${rawReportDate ?? "—"}")`);
          fundChanged = true;
        }
      }

      if (fundChanged) changes++;

      // Verify YYYY-MM format
      const finalUpdated = dryRun ? targetYYYYMM : (fund.lastUpdated as string | null);
      if (finalUpdated && !YYYY_MM_RE.test(finalUpdated)) {
        console.warn(`  [!] WARN: ${name}: lastUpdated "${finalUpdated}" is not YYYY-MM after migration`);
      }
    }
  }

  console.log(`\n  Total changes: ${changes}`);

  if (dryRun) {
    console.log("  DRY-RUN — nothing written.");
    return;
  }

  console.log(`  Writing funds:${client} to KV...`);
  await storageWrite(`funds:${client}`, data);

  // Read-back verification
  const verify = await storageRead<Record<string, unknown>>(`funds:${client}`, { lastUpdated: "", categories: [] });
  const verifyCats = (verify.categories as Record<string, unknown>[]) || [];
  let verifyErrors = 0;
  for (const cat of verifyCats) {
    for (const fund of (cat.funds as Record<string, unknown>[]) || []) {
      const lu = fund.lastUpdated as string | null;
      if (lu && !YYYY_MM_RE.test(lu)) {
        console.error(`  VERIFY FAIL: ${fund.name}: lastUpdated "${lu}" is not YYYY-MM`);
        verifyErrors++;
      }
      if (fund.lastReportDate !== undefined) {
        console.error(`  VERIFY FAIL: ${fund.name}: lastReportDate still present`);
        verifyErrors++;
      }
    }
  }
  const globalVerify = verify.lastUpdated as string;
  if (globalVerify && !YYYY_MM_RE.test(globalVerify)) {
    console.error(`  VERIFY FAIL: data.lastUpdated "${globalVerify}" is not YYYY-MM`);
    verifyErrors++;
  }

  if (verifyErrors === 0) {
    console.log("  Verification passed ✓");
  } else {
    console.error(`  ${verifyErrors} verification error(s). Backup: ${backupPath}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  console.log("");
  console.log("migrate-dates.ts — Stage 1 date format migration");
  if (dryRun) console.log("*** DRY-RUN MODE — no KV writes ***");
  console.log("");

  await migrateClient("green");
  await migrateClient("nox");

  console.log("\n\nMigration complete.");
  if (!dryRun) {
    console.log("Next step: git rm scripts/migrate-dates.ts && git commit -m 'chore: remove migrate-dates.ts after prod migration'");
  }
}

main().catch((err: Error) => {
  console.error(`FATAL: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
