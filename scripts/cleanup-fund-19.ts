/**
 * scripts/cleanup-fund-19.ts — DRY RUN
 *
 * Reports which monthlyReturns keys for fund-19 ("חצבים ואליו") predate
 * its startDate (2024-01). Does NOT write to KV.
 *
 * To run:
 *   npx tsx scripts/cleanup-fund-19.ts
 *
 * To apply after review (uncomment kv.set at the bottom):
 *   npx tsx scripts/cleanup-fund-19.ts --apply
 */

import { kv } from "@vercel/kv";

const TENANT = "green";
const FUND_ID = "fund-19";
const START_DATE_YYYYMM = "2024-01";

async function main() {
  const key = `funds:${TENANT}`;
  const funds = (await kv.get(key)) as Record<string, unknown>[] | null;

  if (!funds || !Array.isArray(funds)) {
    console.error("Could not read funds from KV");
    process.exit(1);
  }

  const fund = funds.find((f: Record<string, unknown>) => f.id === FUND_ID) as Record<string, unknown> | undefined;
  if (!fund) {
    console.error(`Fund ${FUND_ID} not found`);
    process.exit(1);
  }

  console.log(`\nקרן: ${fund.name} (${FUND_ID})`);
  console.log(`startDate: ${fund.startDate}`);
  console.log(`תאריך סף: ${START_DATE_YYYYMM}\n`);

  const mr = fund.monthlyReturns as Record<string, number> | undefined;
  if (!mr || Object.keys(mr).length === 0) {
    console.log("אין monthlyReturns בקרן זו ב-KV.");
    return;
  }

  const allKeys = Object.keys(mr).sort();
  const beforeKeys = allKeys.filter((k) => k < START_DATE_YYYYMM);
  const afterKeys = allKeys.filter((k) => k >= START_DATE_YYYYMM);

  console.log(`סה"כ חודשים ב-KV: ${allKeys.length}`);
  console.log(`חודשים לפני ${START_DATE_YYYYMM} (יוסרו): ${beforeKeys.length}`);
  console.log(`חודשים מ-${START_DATE_YYYYMM} ואילך (יישארו): ${afterKeys.length}`);

  if (beforeKeys.length > 0) {
    console.log("\nמפתחות שיוסרו:");
    beforeKeys.forEach((k) => console.log(`  ${k}: ${mr[k]}`));
  } else {
    console.log("\nאין מפתחות לפני תאריך הסף — לא נדרש ניקוי.");
    return;
  }

  const apply = process.argv.includes("--apply");
  if (apply) {
    const cleaned = { ...fund, monthlyReturns: Object.fromEntries(afterKeys.map((k) => [k, mr[k]])) };
    const updatedFunds = funds.map((f: Record<string, unknown>) => (f.id === FUND_ID ? cleaned : f));
    await kv.set(key, updatedFunds);
    console.log(`\nWROTE TO KV — הוסרו ${beforeKeys.length} חודשים מ-${FUND_ID}`);
  } else {
    console.log("\nDRY RUN — לא נכתב ל-KV. הרץ עם --apply להחיל.");
  }
}

main().catch(console.error);
