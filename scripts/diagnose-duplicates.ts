// READ-ONLY DIAGNOSTIC — DO NOT ADD WRITE OPERATIONS
// Output is a deletion checklist for manual action in Admin UI
// Usage: npx tsx scripts/diagnose-duplicates.ts

import * as fs from "fs";
import * as path from "path";

// Load production env vars before any imports that need them
// Search cwd and parent dirs (handles running from a git worktree)
function findEnvFile(filename: string): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`${filename} not found (searched from ${process.cwd()})`);
}
const envFile = findEnvFile(".env.production.local");
const lines = fs.readFileSync(envFile, "utf-8").split("\n");
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  process.env[key] = val;
}
process.env.VERCEL = "1"; // force KV path in storageRead

import { storageRead } from "../lib/storage";
import { FundsData, Fund, Category } from "../lib/types";

const CLIENT = "green";
const DIVIDER = "━".repeat(44);

// ── Normalisation ────────────────────────────────────────────────
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    // strip common punctuation (keep Hebrew, Latin, digits, spaces)
    .replace(/[״'".,\-–—_()[\]{}]/g, "")
    .trim();
}

// ── Levenshtein ──────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ── Fund display info ────────────────────────────────────────────
interface FundInfo {
  fund: Fund;
  categoryName: string;
  monthlyCount: number;
}

function buildFundInfo(fund: Fund, cat: Category): FundInfo {
  return {
    fund,
    categoryName: cat.name,
    monthlyCount: Object.keys(fund.monthlyReturns ?? {}).length,
  };
}

function printFundEntry(idx: number, info: FundInfo): void {
  const { fund, categoryName, monthlyCount } = info;
  console.log(`\n  [${idx}] fundId: ${fund.id}`);
  console.log(`      name: ${fund.name}`);
  console.log(`      manager: ${fund.manager || "(לא צוין)"}`);
  console.log(`      category: ${categoryName}`);
  console.log(`      active: ${fund.active !== false}`);
  console.log(`      monthlyReturns: ${monthlyCount} חודשים`);
  console.log(`      lastUpdated: ${fund.lastUpdated ?? "null"}`);
}

function recommend(infos: FundInfo[]): string {
  const withData = infos.filter(i => i.monthlyCount > 0);
  const withoutData = infos.filter(i => i.monthlyCount === 0);

  if (withData.length === 0) {
    return "דרושה בדיקה ידנית — שניהם ריקים";
  }
  if (withoutData.length === 0) {
    return "דרושה בדיקה ידנית — לשניהם יש נתונים";
  }
  // exactly the empties are candidates for deletion
  const deleteIdxs = infos
    .map((info, i) => (info.monthlyCount === 0 ? i + 1 : null))
    .filter((x): x is number => x !== null);
  return `למחוק את [${deleteIdxs.join(", ")}] — אין monthlyReturns`;
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log("🔍 טוען נתוני GREEN מ-KV...\n");

  const fundsData = await storageRead<FundsData>(`funds:${CLIENT}`, {
    lastUpdated: "",
    categories: [],
  });

  // Collect all funds with their category
  const allFunds: FundInfo[] = [];
  for (const cat of fundsData.categories ?? []) {
    for (const fund of cat.funds ?? []) {
      allFunds.push(buildFundInfo(fund, cat));
    }
  }

  console.log(`נמצאו ${allFunds.length} קרנות ב-${fundsData.categories?.length ?? 0} קטגוריות.\n`);

  // ── Exact duplicates (by normalized name) ────────────────────
  const exactGroups = new Map<string, FundInfo[]>();
  for (const info of allFunds) {
    const key = normalizeName(info.fund.name);
    const group = exactGroups.get(key) ?? [];
    group.push(info);
    exactGroups.set(key, group);
  }

  const duplicateGroups = [...exactGroups.entries()].filter(
    ([, group]) => group.length >= 2
  );

  console.log(`\n${"=".repeat(44)}`);
  console.log(`  כפילויות וודאיות (שם זהה לאחר נרמול)`);
  console.log(`${"=".repeat(44)}\n`);

  if (duplicateGroups.length === 0) {
    console.log("  ✅ לא נמצאו כפילויות וודאיות.\n");
  } else {
    for (const [normalizedName, infos] of duplicateGroups) {
      console.log(DIVIDER);
      console.log(`📋 כפילות: ${infos[0].fund.name}  (מנורמל: "${normalizedName}")`);

      infos.forEach((info, i) => printFundEntry(i + 1, info));

      console.log(`\n  המלצה: ${recommend(infos)}`);
      console.log(DIVIDER + "\n");
    }
  }

  // ── Fuzzy duplicates (Levenshtein ≤ 3, not already exact dupes) ──
  console.log(`\n${"=".repeat(44)}`);
  console.log(`  🔍 כפילויות חשודות (לא ודאיות):`);
  console.log(`${"=".repeat(44)}\n`);

  // Build list of normalized keys that are ALREADY exact dupes — exclude from fuzzy
  const exactKeys = new Set(
    duplicateGroups.map(([k]) => k)
  );

  // Group allFunds by normalized key to avoid double-counting intra-exact pairs
  const uniqueNormKeys = [...exactGroups.keys()];
  const fuzzyPairs: Array<[FundInfo[], FundInfo[]]> = [];

  for (let i = 0; i < uniqueNormKeys.length; i++) {
    for (let j = i + 1; j < uniqueNormKeys.length; j++) {
      const keyA = uniqueNormKeys[i];
      const keyB = uniqueNormKeys[j];
      // Skip pairs where both keys are exact-dupe groups (already reported above)
      if (exactKeys.has(keyA) && exactKeys.has(keyB)) continue;
      const dist = levenshtein(keyA, keyB);
      if (dist <= 3) {
        fuzzyPairs.push([exactGroups.get(keyA)!, exactGroups.get(keyB)!]);
      }
    }
  }

  if (fuzzyPairs.length === 0) {
    console.log("  ✅ לא נמצאו כפילויות חשודות.\n");
  } else {
    for (const [groupA, groupB] of fuzzyPairs) {
      console.log(DIVIDER);
      console.log(`🔍 חשוד: "${groupA[0].fund.name}" ↔ "${groupB[0].fund.name}"`);
      const combined = [...groupA, ...groupB];
      combined.forEach((info, i) => printFundEntry(i + 1, info));
      console.log(`\n  המלצה: ${recommend(combined)}`);
      console.log(DIVIDER + "\n");
    }
  }

  // ── Summary ──────────────────────────────────────────────────
  console.log(
    `\n📊 סה״כ נמצאו ${duplicateGroups.length} קבוצות כפילויות וודאיות, ${fuzzyPairs.length} קבוצות חשודות`
  );
}

main().catch(err => {
  console.error("שגיאה:", err);
  process.exit(1);
});
