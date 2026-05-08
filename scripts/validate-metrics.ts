/**
 * scripts/validate-metrics.ts
 *
 * Read-only comparison of computed metrics (lib/metrics.ts) vs stored KV values
 * for ALL GREEN funds.
 *
 * Classification thresholds (absolute difference in pp):
 *   ✓  OK          < 0.1pp   (rounding / floating-point noise)
 *   ⚠  MINOR       0.1–1pp   (small discrepancy, worth noting)
 *   ⚠⚠ SIGNIFICANT  1–5pp    (notable diff, investigate)
 *   ❌  MAJOR       > 5pp     (data quality issue)
 *   ?   NULL-MISS            (one side null, other has value)
 *   —   BOTH-NULL            (neither has value — expected)
 *
 * Usage: npx tsx scripts/validate-metrics.ts
 * Does NOT write anything to KV.
 */

import * as fs from "fs";
import * as path from "path";

// ─── Load env ────────────────────────────────────────────────────────────────

const envFile = fs.existsSync(path.join(process.cwd(), ".env.production.local"))
  ? path.join(process.cwd(), ".env.production.local")
  : path.join(process.cwd(), "..", "..", "..", ".env.production.local");

const lines = fs.readFileSync(envFile, "utf-8").split("\n");
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  process.env[trimmed.slice(0, eq).trim()] = trimmed
    .slice(eq + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
}
process.env.VERCEL = "1";

// ─── Imports ──────────────────────────────────────────────────────────────────

import { storageRead } from "../lib/storage";
import type { FundsData, Fund } from "../lib/types";
import {
  computeYTDFromMonthlyReturns,
  computeAnnualReturn,
  computeAvgAnnualReturn,
  computeSharpe,
  computeStdDev,
  computeLatestMonthly,
  computeStartMonth,
  computeLatestMonth,
  hasMinimumHistory,
} from "../lib/metrics";

// ─── Types ────────────────────────────────────────────────────────────────────

type Level = "ok" | "minor" | "sig" | "major" | "null-miss" | "both-null";

interface MetricDiff {
  label: string;
  computed: number | null;
  stored: number | null | undefined;
  abspp: number | null;   // |computed - stored| × 100
  level: Level;
  note?: string;
}

interface FundReport {
  fund: Fund;
  category: string;
  nMonths: number;
  startM: string | null;
  endM: string | null;
  status: "skipped" | "partial" | "full";
  diffs: MetricDiff[];
}

const YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function classifyDiff(
  computed: number | null,
  stored: number | null | undefined
): { level: Level; abspp: number | null } {
  const s = stored ?? null;
  if (computed == null && s == null) return { level: "both-null", abspp: null };
  if (computed == null || s == null) return { level: "null-miss", abspp: null };
  const d = Math.abs(computed - s) * 100;
  const level: Level = d < 0.1 ? "ok" : d < 1 ? "minor" : d < 5 ? "sig" : "major";
  return { level, abspp: d };
}

function makeDiff(
  label: string,
  computed: number | null,
  stored: number | null | undefined,
  note?: string
): MetricDiff {
  const { level, abspp } = classifyDiff(computed, stored);
  return { label, computed, stored: stored ?? null, abspp, level, note };
}

const LEVEL_RANK: Record<Level, number> = {
  ok: 0, "both-null": 0, "null-miss": 1, minor: 2, sig: 3, major: 4,
};

const ICON: Record<Level, string> = {
  ok: "✓", "both-null": "—", "null-miss": "?", minor: "⚠", sig: "⚠⚠", major: "❌",
};

function worstLevel(diffs: MetricDiff[]): Level {
  return diffs.reduce<Level>(
    (w, d) => (LEVEL_RANK[d.level] > LEVEL_RANK[w] ? d.level : w),
    "ok"
  );
}

function pct(v: number | null | undefined, dp = 2): string {
  if (v == null) return "null";
  return (v * 100).toFixed(dp) + "%";
}

function pp(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(3) + "pp";
}

// ─── Build fund report ────────────────────────────────────────────────────────

function buildReport(fund: Fund, category: string): FundReport {
  const mr = fund.monthlyReturns ?? {};
  const nMonths = Object.values(mr).filter((v) => typeof v === "number").length;
  const startM = computeStartMonth(mr);
  const endM = computeLatestMonth(mr);

  if (nMonths === 0) {
    return { fund, category, nMonths, startM, endM, status: "skipped", diffs: [] };
  }

  const status = hasMinimumHistory(mr, 12) ? "full" : "partial";

  const diffs: MetricDiff[] = [
    makeDiff(
      "YTD 2026",
      computeYTDFromMonthlyReturns(mr, "2026"),
      fund.returns.ytd2026
    ),
    ...YEARS.map((y) =>
      makeDiff(`y${y}`, computeAnnualReturn(mr, y), fund.returns[`y${y}` as keyof typeof fund.returns])
    ),
    makeDiff(
      "monthlyReturn",
      computeLatestMonthly(mr)?.value ?? null,
      fund.monthlyReturn
    ),
    makeDiff("sharpe", computeSharpe(mr), fund.sharpe, "RFR 3.6%→3%"),
    makeDiff("stdDev", computeStdDev(mr), fund.stdDev),
    makeDiff("avgAnnual (CAGR)", computeAvgAnnualReturn(mr), fund.avgAnnualReturn, "was arith.mean"),
  ];

  return { fund, category, nMonths, startM, endM, status, diffs };
}

// ─── Aggregate stats ──────────────────────────────────────────────────────────

interface AggStat { ok: number; minor: number; sig: number; major: number; nullMiss: number }
const METRIC_LABELS = ["YTD 2026", ...YEARS.map(y => `y${y}`), "monthlyReturn", "sharpe", "stdDev", "avgAnnual (CAGR)"];

function makeAgg(): AggStat { return { ok: 0, minor: 0, sig: 0, major: 0, nullMiss: 0 }; }

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const fundsData = await storageRead<FundsData>("funds:green", {
    lastUpdated: "",
    categories: [],
  });

  const allReports: FundReport[] = [];
  for (const cat of fundsData.categories) {
    for (const fund of cat.funds) {
      allReports.push(buildReport(fund, cat.name));
    }
  }

  const skipped  = allReports.filter(r => r.status === "skipped");
  const partial  = allReports.filter(r => r.status === "partial");
  const full     = allReports.filter(r => r.status === "full");

  const W = 88;
  const SEP  = "─".repeat(W);
  const SEP2 = "═".repeat(W);

  // ── Header ─────────────────────────────────────────────────────────────────
  console.log(`\n${SEP2}`);
  console.log(`  validate-metrics.ts — GREEN  (${allReports.length} funds total)`);
  console.log(`  Skipped (no monthlyReturns): ${skipped.length}   Partial (<12M): ${partial.length}   Full: ${full.length}`);
  console.log(SEP2);

  // ── Skipped ────────────────────────────────────────────────────────────────
  console.log(`\n${SEP}`);
  console.log(`  SKIPPED — no monthlyReturns (${skipped.length} funds)`);
  console.log(SEP);
  for (const r of skipped) {
    console.log(`  ${r.fund.name.padEnd(45)}  [${r.fund.id}]  cat: ${r.category}`);
  }

  // ── Partial ────────────────────────────────────────────────────────────────
  if (partial.length > 0) {
    console.log(`\n${SEP}`);
    console.log(`  PARTIAL — <12 months (${partial.length} funds)`);
    console.log(SEP);
    for (const r of partial) {
      console.log(`  ${r.fund.name.padEnd(45)}  [${r.fund.id}]  ${r.nMonths}M  ${r.startM}→${r.endM}`);
    }
  }

  // ── Full comparison — compact overview ─────────────────────────────────────
  console.log(`\n${SEP}`);
  console.log(`  FULL COMPARISON — ${full.length} funds`);
  console.log(`  Legend: ✓OK <0.1pp  ⚠MINOR 0.1–1pp  ⚠⚠SIG 1–5pp  ❌MAJOR >5pp  ?null-miss  —both-null`);
  console.log(SEP);
  console.log(`  ${"Fund".padEnd(43)} ${"M".padStart(3)}  ${"Range".padEnd(15)}  ytd y25 y24 y23 y22 y21 y20 y19 mly sha std cag`);
  console.log(SEP);

  const aggStats: Record<string, AggStat> = Object.fromEntries(
    METRIC_LABELS.map(l => [l, makeAgg()])
  );

  for (const r of full) {
    const worst = worstLevel(r.diffs);
    const prefix = worst === "ok" || worst === "both-null" ? "  " :
                   worst === "minor" ? "⚠ " :
                   worst === "sig"   ? "⚠⚠" : "❌";

    const icons = r.diffs.map(d => ICON[d.level]).join("  ");

    console.log(
      `${prefix} ${r.fund.name.padEnd(43)} ${String(r.nMonths).padStart(3)}  ${(r.startM + "→" + r.endM).padEnd(15)}  ${icons}`
    );

    // accumulate aggregate stats
    for (const d of r.diffs) {
      const agg = aggStats[d.label];
      if (!agg) continue;
      if (d.level === "ok" || d.level === "both-null") agg.ok++;
      else if (d.level === "minor") agg.minor++;
      else if (d.level === "sig") agg.sig++;
      else if (d.level === "major") agg.major++;
      else if (d.level === "null-miss") agg.nullMiss++;
    }
  }

  // ── Issues detail ──────────────────────────────────────────────────────────
  const withIssues = full.filter(r => {
    const w = worstLevel(r.diffs);
    return LEVEL_RANK[w] >= LEVEL_RANK["minor"];
  });

  if (withIssues.length > 0) {
    console.log(`\n${SEP}`);
    console.log(`  ISSUES DETAIL — ${withIssues.length} funds with MINOR+ differences`);
    console.log(SEP);
    for (const r of withIssues) {
      const worst = worstLevel(r.diffs);
      console.log(`\n  ${ICON[worst]} ${r.fund.name}  [${r.fund.id}]  ${r.nMonths}M  ${r.startM}→${r.endM}`);
      for (const d of r.diffs) {
        if (d.level === "ok" || d.level === "both-null") continue;
        const noteStr = d.note ? `  [${d.note}]` : "";
        console.log(
          `    ${ICON[d.level]} ${d.label.padEnd(18)} computed=${pct(d.computed, 4).padEnd(12)} stored=${pct(d.stored, 4).padEnd(12)} Δ=${pp(d.abspp).padEnd(10)}${noteStr}`
        );
      }
    }
  }

  // ── Aggregate summary ──────────────────────────────────────────────────────
  console.log(`\n${SEP2}`);
  console.log(`  AGGREGATE SUMMARY  (${full.length} funds in full comparison)`);
  console.log(SEP2);
  console.log(`  ${"Metric".padEnd(22)}  ${"✓OK".padStart(5)}  ${"⚠MIN".padStart(5)}  ${"⚠⚠SIG".padStart(6)}  ${"❌MAJ".padStart(5)}  ${"?NULL".padStart(5)}`);
  console.log(`  ${SEP.slice(0, 60)}`);
  for (const label of METRIC_LABELS) {
    const a = aggStats[label];
    console.log(
      `  ${label.padEnd(22)}  ${String(a.ok).padStart(5)}  ${String(a.minor).padStart(5)}  ${String(a.sig).padStart(6)}  ${String(a.major).padStart(5)}  ${String(a.nullMiss).padStart(5)}`
    );
  }

  // ── Formula change reminder ─────────────────────────────────────────────────
  console.log(`\n${SEP}`);
  console.log("  EXPECTED DIFFERENCES (by design, not data quality issues)");
  console.log(SEP);
  console.log("  sharpe      old RFR = 0.003/month (3.6%/yr)  →  new = 0.0025/month (3.0%/yr)");
  console.log("  avgAnnual   old = arithmetic mean y2019–y2025  →  new = CAGR from monthlyReturns");
  console.log("  stdDev      formula unchanged — any diff = data quality issue");
  console.log("  annual yNNN formula unchanged — any diff = data quality issue");
  console.log();
}

main().catch(console.error);
