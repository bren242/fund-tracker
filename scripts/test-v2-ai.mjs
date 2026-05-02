/**
 * Tests AI integration for 3 real cases:
 *   1. fund-24 (טריו)        — IR negative, weak performer
 *   2. fund-19 (חצבים וואליו) — IR positive, top of category
 *   3. compare fund-24,22,23  — all negative IR, "least bad" framing
 *
 * Run: node scripts/test-v2-ai.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { jsonrepair } from "jsonrepair";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Load env — .env.local first, then .env.production.local overwrites KV vars
for (const envFile of [".env.local", ".env.production.local"]) {
  try {
    const envLines = readFileSync(resolve(root, envFile), "utf8").split("\n");
    for (const line of envLines) {
      const [k, ...rest] = line.split("=");
      if (k && rest.length > 0) {
        const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
        if (val) process.env[k.trim()] = val;
      }
    }
  } catch { /* file not found — skip */ }
}

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!KV_URL || !KV_TOKEN) { console.error("Missing KV vars"); process.exit(1); }
if (!ANTHROPIC_KEY)        { console.error("Missing ANTHROPIC_API_KEY"); process.exit(1); }

async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const json = await res.json();
  return json.result ? JSON.parse(json.result) : null;
}

// ── Consistency logic (mirroring lib/consistency.ts) ─────────────────────────

const CATEGORY_BLEND = {
  "equity-hedged":  { "bm-ta125": 1.0 },
  "bond-hedged":    { "bm-ta125": 0.15, "bm-telbond-maagar": 0.85 },
  "multi-strategy": { "bm-ta125": 0.30, "bm-telbond-maagar": 0.70 },
};

const BENCHMARK_LABELS = {
  "equity-hedged":  'ת"א 125',
  "bond-hedged":    'ת"א 125 (15%) + תל בונד-מאגר (85%)',
  "multi-strategy": 'ת"א 125 (30%) + תל בונד-מאגר (70%)',
};

const HEB_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const hebrewLabel = (ym) => { const [y,m] = ym.split("-"); return `${HEB_MONTHS[+m-1]} ${y}`; };

function windowMonthKeys(endMonth, count) {
  const [ey, em] = endMonth.split("-").map(Number);
  const months = [];
  for (let i = count-1; i >= 0; i--) {
    const t = ey*12 + em - 1 - i;
    months.push(`${Math.floor(t/12)}-${String((t%12)+1).padStart(2,"0")}`);
  }
  return months;
}

function getWindowEndMonth(allFunds, benchmarks) {
  const fundData = allFunds
    .map(f => { const ms = Object.keys(f.monthlyReturns??{}).sort(); return ms.length ? {id:f.id, lastMonth:ms[ms.length-1]} : null; })
    .filter(Boolean);
  if (!fundData.length) return { endMonth:"", consensusFundMonth:"", benchmarkCeiling:"", partialFundIds:[] };
  const sorted = fundData.map(f=>f.lastMonth).sort();
  const consensusFundMonth = sorted[Math.floor(sorted.length/2)];
  const relevantBmIds = new Set(Object.values(CATEGORY_BLEND).flatMap(b=>Object.keys(b)));
  const bmLast = [...relevantBmIds].map(id => {
    const bm = benchmarks.find(b=>b.id===id);
    const ms = Object.keys(bm?.monthlyReturns??{}).sort();
    return ms.length ? ms[ms.length-1] : null;
  }).filter(Boolean);
  const benchmarkCeiling = bmLast.length ? bmLast.reduce((a,b)=>a<b?a:b) : consensusFundMonth;
  const endMonth = consensusFundMonth < benchmarkCeiling ? consensusFundMonth : benchmarkCeiling;
  return { endMonth, consensusFundMonth, benchmarkCeiling, partialFundIds: fundData.filter(f=>f.lastMonth<endMonth).map(f=>f.id) };
}

function blendBM(blend, benchmarks) {
  const result = {};
  for (const [id, w] of Object.entries(blend)) {
    const bm = benchmarks.find(b=>b.id===id);
    for (const [m, v] of Object.entries(bm?.monthlyReturns??{})) result[m] = (result[m]??0) + v*w;
  }
  return result;
}

function calcConsistency(fw, ref, minMonths, withIR) {
  const months = Object.keys(fw).filter(m=>ref[m]!=null).sort();
  if (months.length < minMonths) return null;
  const gaps = months.map(m=>fw[m]-ref[m]);
  const wins = gaps.filter(g=>g>0).length;
  const avg = gaps.reduce((s,v)=>s+v,0)/gaps.length;
  let ir = null;
  if (withIR && gaps.length>=2) {
    const variance = gaps.reduce((s,g)=>s+(g-avg)**2,0)/(gaps.length-1);
    const std = Math.sqrt(variance);
    ir = std>0 ? Math.round(avg/std*1000)/1000 : null;
  }
  return { score: Math.round(wins/gaps.length*10000)/100, wins, total:gaps.length, avgGap: Math.round(avg*1e6)/1e6, ir };
}

function catAvgReturns(funds) {
  const sums={}, cnts={};
  for (const f of funds) for (const [m,v] of Object.entries(f.monthlyReturns??{})) { sums[m]=(sums[m]??0)+v; cnts[m]=(cnts[m]??0)+1; }
  const r={};
  for (const m of Object.keys(sums)) r[m]=sums[m]/cnts[m];
  return r;
}

function catAvg3(funds, monthKey) {
  const vals = funds.map(f=>f.monthlyReturns?.[monthKey]).filter(v=>v!=null);
  return vals.length>=3 ? vals.reduce((s,v)=>s+v,0)/vals.length : null;
}

function computeWorstMonth(fund, bmWindow, catFunds, windowMonths) {
  let worstKey=null, worstExcess=Infinity;
  for (const m of windowMonths) {
    const fr=fund.monthlyReturns?.[m], br=bmWindow[m];
    if (fr==null||br==null) continue;
    const excess=fr-br;
    if (excess<worstExcess) { worstExcess=excess; worstKey=m; }
  }
  if (!worstKey) return null;
  return {
    monthKey: worstKey,
    monthLabelHebrew: hebrewLabel(worstKey),
    fundReturn: fund.monthlyReturns[worstKey],
    benchmarkReturn: bmWindow[worstKey],
    categoryAverageReturn: catAvg3(catFunds, worstKey),
    fundVsBenchmark: worstExcess,
  };
}

function computeCohort(fund, catFunds, monthKey) {
  const fundReturn=fund.monthlyReturns?.[monthKey];
  if (fundReturn==null) return null;
  const others=catFunds.filter(f=>f.id!==fund.id).map(f=>f.monthlyReturns?.[monthKey]).filter(v=>v!=null);
  if (!others.length) return null;
  const strictlyAbove=others.filter(r=>r>fundReturn).length;
  const beaten=others.filter(r=>fundReturn>r).length;
  return { fundReturn, rank:1+strictlyAbove, total:others.length+1, percentile:Math.round(beaten/others.length*100) };
}

function computeCatStats(catId, catName, funds, bmWindow, windowMonths) {
  const fundStats=[];
  for (const fund of funds) {
    const fw={}, bw={};
    for (const m of windowMonths) { if(fund.monthlyReturns?.[m]!=null) fw[m]=fund.monthlyReturns[m]; if(bmWindow[m]!=null) bw[m]=bmWindow[m]; }
    const r=calcConsistency(fw,bw,12,true);
    if (r?.ir!=null) fundStats.push({fundId:fund.id,fundName:fund.name,ir:r.ir});
  }
  fundStats.sort((a,b)=>b.ir-a.ir);
  const avgIR=fundStats.length?Math.round(fundStats.reduce((s,f)=>s+f.ir,0)/fundStats.length*1000)/1000:0;
  return {categoryKey:catId,categoryLabel:catName,fundCount:fundStats.length,averageIR:avgIR,funds:fundStats};
}

// ── AI caller ─────────────────────────────────────────────────────────────────

function pctStr(v, d=1) {
  if (v==null) return "אין נתונים";
  const val=(v*100).toFixed(d);
  return v>=0?`+${val}%`:`${val}%`;
}
function irStr(v) { return v==null?"אין נתונים":v.toFixed(2); }

function buildFundMsg(input) {
  const lines=[
    `קרן: ${input.fundName} | קטגוריה: ${input.categoryName}`,
    `בנצ'מרק: ${input.benchmarkDescription}`,
    `חלון ניתוח: ${input.windowMonths} חודשים (${input.startMonthLabel} – ${input.endMonthLabel})`,
    ``,
    `ביצועים נגד בנצ'מרק:`,
    `  Information Ratio: ${irStr(input.ir)}`,
  ];
  if (input.vsB) {
    lines.push(`  חודשים שעקפה בנצ'מרק: ${input.vsB.wins} מתוך ${input.vsB.total} (${input.vsB.score.toFixed(1)}%)`);
    lines.push(`  ממוצע פער חודשי: ${pctStr(input.vsB.avgGap)}`);
  }
  lines.push(``, `ביצועים נגד ממוצע קטגוריה:`);
  if (input.vsC) lines.push(`  חודשים מעל ממוצע הקטגוריה: ${input.vsC.wins} מתוך ${input.vsC.total} (${input.vsC.score.toFixed(1)}%)`);
  if (input.worstMonth) {
    const w=input.worstMonth;
    lines.push(``, `החודש הקשה ביותר:`);
    lines.push(`  ${w.monthLabel} — קרן: ${pctStr(w.fundReturnPct)}, בנצ'מרק: ${pctStr(w.bmReturnPct)}, פער: ${pctStr(w.gapPct)}`);
    if (w.catAvgPct!=null) lines.push(`  ממוצע קטגוריה באותו חודש: ${pctStr(w.catAvgPct)}`);
    if (input.cohort) lines.push(`  דירוג הקרן בין חברות הקטגוריה: מקום ${input.cohort.rank} מתוך ${input.cohort.total} (אחוזון ${input.cohort.percentile})`);
  }
  if (input.categoryTotal!=null) {
    lines.push(``, `הקשר קטגוריה (${input.categoryTotal} קרנות עם IR):`);
    lines.push(`  ממוצע IR קטגוריה: ${irStr(input.categoryAvgIR)}`);
    if (input.categoryRank!=null) lines.push(`  דירוג הקרן ב-IR בקטגוריה: מקום ${input.categoryRank} מתוך ${input.categoryTotal}`);
  }
  lines.push(``, `כתוב ניתוח כ-JSON תקין בלבד.`);
  return lines.join("\n");
}

function buildCompareMsg(input) {
  const lines=[
    `השוואה | קטגוריה: ${input.categoryName}`,
    `בנצ'מרק: ${input.benchmarkDescription}`,
    `חלון ניתוח: ${input.windowMonths} חודשים (${input.startMonthLabel} – ${input.endMonthLabel})`,
    ``,
  ];
  for (const f of input.funds) {
    lines.push(`── ${f.name} ──`);
    lines.push(`  Information Ratio: ${irStr(f.ir)}`);
    if (f.score!=null) lines.push(`  חודשים מעל בנצ'מרק: ${f.wins} מתוך ${f.total} (${f.score.toFixed(1)}%)`);
    if (f.avgGapPct!=null) lines.push(`  ממוצע פער חודשי: ${pctStr(f.avgGapPct)}`);
    if (f.scoreVsCategory!=null) lines.push(`  חודשים מעל ממוצע קטגוריה: ${f.scoreVsCategory.toFixed(1)}%`);
    if (f.worstMonth) {
      const w=f.worstMonth;
      lines.push(`  החודש הקשה: ${w.monthLabel} — קרן: ${pctStr(w.fundReturnPct)}, בנצ'מרק: ${pctStr(w.bmReturnPct)}, פער: ${pctStr(w.gapPct)}`);
      if (w.catAvgPct!=null) lines.push(`    ממוצע קטגוריה: ${pctStr(w.catAvgPct)}`);
      if (w.cohortRank!=null) lines.push(`    דירוג בחודש הזה: ${w.cohortRank}/${w.cohortTotal}`);
    }
    lines.push(``);
  }
  if (input.categoryTotal!=null) {
    lines.push(`הקשר קטגוריה (${input.categoryTotal} קרנות עם IR): ממוצע IR ${irStr(input.categoryAvgIR)}`, ``);
  }
  lines.push(`כתוב ניתוח השוואתי כ-JSON תקין בלבד.`);
  return lines.join("\n");
}

const SYSTEM_FUND = `אתה כותב פסקאות עבור דוח עקביות של קרן בודדת, עבור יועץ פיננסי שיציג את הדוח ללקוח.
הסגנון: עיתונות פיננסית עברית מקצועית — The Marker meets The Economist.

כללי כתיבה:
1. עברית בלבד. לא לערבב עם אנגלית בתוך אותה שורה.
2. מונחים טכניים (Information Ratio) — להסביר בקצרה בפעם הראשונה שמופיעים.
3. ללא רשימות, ללא bullets. פסקאות שלמות, זורמות.
4. כל מספר שמוזכר חייב להופיע בקלט. אסור להמציא מספרים.
5. לא להעצים. אם IR שלילי — להגיד ישירות. אסור להחביא ביצועים חלשים.
6. אם consistencyScore < 50 — verdict הוא "קרן לא עקבית" או "עקביות נמוכה".
7. בעברית פיננסית רהוטה. ללא disclaimer.

ממפה verdict:
- score >= 75 ו-IR > 0.5 → "קרן עקבית מאוד"
- score >= 60 ו-IR > 0 → "קרן עקבית"
- score >= 45 או IR בין -0.2 ל-0 → "עקביות בינונית"
- אחרת → "קרן לא עקבית"

החזר JSON תקין בלבד. Schema: {"verdictLabel":"...","storyParagraphs":["...","..."],"worstMonthNarrative":"...","categoryContextNarrative":"..."}`;

const SYSTEM_COMPARE = `אתה כותב פסקאות עבור דוח השוואה של 2-4 קרנות מאותה קטגוריה.
הסגנון: עיתונות פיננסית עברית מקצועית.

כללי:
1. עברית בלבד. מונחים טכניים — להסביר בקצרה.
2. ללא bullets. פסקאות שלמות.
3. כל מספר מהקלט בלבד. אסור להמציא.
4. אם IR שלילי לכולן — להשתמש ב"הפחות פגיעה", לא "מנצחת".
5. 3 פסקאות: (1) המובילה+מספרים, (2) trade-offs, (3) מפגרות.
6. ללא disclaimer.

החזר JSON תקין בלבד. Schema: {"winnerVerdict":"...","decisionParagraphs":["...","...","..."],"worstMonthsNarrative":"...","categoryContextNarrative":"..."}`;

async function callAI(systemPrompt, userMessage, maxTokens=2000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: maxTokens,
      temperature: 0.4,
      system: systemPrompt,
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: "{" },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) { console.error("AI error:", res.status, await res.text()); return null; }
  const body = await res.json();
  const raw = "{" + body.content.filter(b=>b.type==="text").map(b=>b.text??"").join("").trim();
  try { return JSON.parse(raw); } catch {
    try { return JSON.parse(jsonrepair(raw)); } catch { console.error("JSON repair failed"); return null; }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function buildFundData(fundId, fundsData, benchmarks, windowSize=24) {
  const allFunds = fundsData.categories.flatMap(c=>c.funds);
  const { endMonth } = getWindowEndMonth(allFunds, benchmarks);
  const windowMonths = windowMonthKeys(endMonth, windowSize);

  let fund=null, category=null;
  for (const cat of fundsData.categories) {
    const f=cat.funds.find(f=>f.id===fundId);
    if (f) { fund=f; category=cat; break; }
  }
  if (!fund) throw new Error(`Fund not found: ${fundId}`);

  const blend = CATEGORY_BLEND[category.id];
  const bmAll = blend ? blendBM(blend, benchmarks) : {};
  const bmWindow = {};
  for (const m of windowMonths) if (bmAll[m]!=null) bmWindow[m]=bmAll[m];

  const fw = {};
  for (const m of windowMonths) if (fund.monthlyReturns?.[m]!=null) fw[m]=fund.monthlyReturns[m];

  const catAvg = catAvgReturns(category.funds);
  const catWindow = {};
  for (const m of windowMonths) if (catAvg[m]!=null) catWindow[m]=catAvg[m];

  const vsB = blend ? calcConsistency(fw, bmWindow, 12, true) : null;
  const vsC = calcConsistency(fw, catWindow, 12, false);
  const worst = blend ? computeWorstMonth(fund, bmWindow, category.funds, windowMonths) : null;
  const cohort = worst ? computeCohort(fund, category.funds, worst.monthKey) : null;
  const catStats = blend ? computeCatStats(category.id, category.name, category.funds, bmWindow, windowMonths) : null;
  const catRank = catStats ? (catStats.funds.findIndex(f=>f.fundId===fundId)+1)||null : null;

  return {
    fund, category, windowMonths, endMonth, windowSize,
    startLabel: hebrewLabel(windowMonths[0]),
    endLabel: hebrewLabel(endMonth),
    vsB, vsC, worst, cohort, catStats, catRank,
    bmLabel: BENCHMARK_LABELS[category.id] ?? "אין בנצ'מרק",
  };
}

async function main() {
  console.log("Loading production data...\n");
  const [fundsData, benchmarks] = await Promise.all([
    kvGet("funds:green"),
    kvGet("benchmarks:green"),
  ]);
  console.log(`Loaded ${fundsData.categories.flatMap(c=>c.funds).length} funds, ${benchmarks.length} benchmarks\n`);

  // ── TEST 1: fund-24 (טריו) — IR negative, weak ───────────────────────────
  console.log("=".repeat(70));
  console.log("TEST 1: fund-24 (טריו) — IR שלילי, ביצועים חלשים");
  console.log("=".repeat(70));

  const d24 = await buildFundData("fund-24", fundsData, benchmarks);
  const input24 = {
    fundName: d24.fund.name, categoryName: d24.category.name,
    benchmarkDescription: d24.bmLabel, windowMonths: d24.windowSize,
    startMonthLabel: d24.startLabel, endMonthLabel: d24.endLabel,
    ir: d24.vsB?.ir??null,
    vsB: d24.vsB ? {score:d24.vsB.score,wins:d24.vsB.wins,total:d24.vsB.total,avgGap:d24.vsB.avgGap} : null,
    vsC: d24.vsC ? {score:d24.vsC.score,wins:d24.vsC.wins,total:d24.vsC.total} : null,
    worstMonth: d24.worst ? {monthLabel:d24.worst.monthLabelHebrew,fundReturnPct:d24.worst.fundReturn,bmReturnPct:d24.worst.benchmarkReturn,gapPct:d24.worst.fundVsBenchmark,catAvgPct:d24.worst.categoryAverageReturn} : null,
    cohort: d24.cohort,
    categoryRank: d24.catRank, categoryTotal: d24.catStats?.fundCount??null, categoryAvgIR: d24.catStats?.averageIR??null,
  };
  console.log("\n[USER MESSAGE SENT TO AI]:\n" + buildFundMsg(input24));
  console.log("\n[AI RESPONSE]:");
  const ai24 = await callAI(SYSTEM_FUND, buildFundMsg(input24));
  console.log(JSON.stringify(ai24, null, 2));

  // ── TEST 2: fund-19 (חצבים וואליו) — IR positive, top of category ────────
  console.log("\n" + "=".repeat(70));
  console.log("TEST 2: fund-19 (חצבים וואליו) — IR חיובי, המובילה בקטגוריה");
  console.log("=".repeat(70));

  const d19 = await buildFundData("fund-19", fundsData, benchmarks);
  const input19 = {
    fundName: d19.fund.name, categoryName: d19.category.name,
    benchmarkDescription: d19.bmLabel, windowMonths: d19.windowSize,
    startMonthLabel: d19.startLabel, endMonthLabel: d19.endLabel,
    ir: d19.vsB?.ir??null,
    vsB: d19.vsB ? {score:d19.vsB.score,wins:d19.vsB.wins,total:d19.vsB.total,avgGap:d19.vsB.avgGap} : null,
    vsC: d19.vsC ? {score:d19.vsC.score,wins:d19.vsC.wins,total:d19.vsC.total} : null,
    worstMonth: d19.worst ? {monthLabel:d19.worst.monthLabelHebrew,fundReturnPct:d19.worst.fundReturn,bmReturnPct:d19.worst.benchmarkReturn,gapPct:d19.worst.fundVsBenchmark,catAvgPct:d19.worst.categoryAverageReturn} : null,
    cohort: d19.cohort,
    categoryRank: d19.catRank, categoryTotal: d19.catStats?.fundCount??null, categoryAvgIR: d19.catStats?.averageIR??null,
  };
  console.log("\n[USER MESSAGE SENT TO AI]:\n" + buildFundMsg(input19));
  console.log("\n[AI RESPONSE]:");
  const ai19 = await callAI(SYSTEM_FUND, buildFundMsg(input19));
  console.log(JSON.stringify(ai19, null, 2));

  // ── TEST 3: compare fund-24,22,23 — all negative IR ──────────────────────
  console.log("\n" + "=".repeat(70));
  console.log("TEST 3: compare fund-24,22,23 — כולן IR שלילי");
  console.log("=".repeat(70));

  const allFunds = fundsData.categories.flatMap(c=>c.funds);
  const { endMonth } = getWindowEndMonth(allFunds, benchmarks);
  const windowMonths = windowMonthKeys(endMonth, 24);
  const compareIds = ["fund-24","fund-22","fund-23"];
  const compareData = await Promise.all(compareIds.map(id => buildFundData(id, fundsData, benchmarks)));
  const cat = compareData[0].category;
  const catStats3 = compareData[0].catStats;

  const compareInput = {
    categoryName: cat.name,
    benchmarkDescription: BENCHMARK_LABELS[cat.id]??'אין',
    windowMonths: 24,
    startMonthLabel: hebrewLabel(windowMonths[0]),
    endMonthLabel: hebrewLabel(endMonth),
    funds: compareData.map(d => ({
      name: d.fund.name, ir: d.vsB?.ir??null,
      score: d.vsB?.score??null, wins: d.vsB?.wins??null, total: d.vsB?.total??null,
      avgGapPct: d.vsB?.avgGap??null, scoreVsCategory: d.vsC?.score??null,
      worstMonth: d.worst ? {
        monthLabel: d.worst.monthLabelHebrew, fundReturnPct: d.worst.fundReturn,
        bmReturnPct: d.worst.benchmarkReturn, gapPct: d.worst.fundVsBenchmark,
        catAvgPct: d.worst.categoryAverageReturn, cohortRank: d.cohort?.rank??null, cohortTotal: d.cohort?.total??null,
      } : null,
    })),
    categoryTotal: catStats3?.fundCount??null, categoryAvgIR: catStats3?.averageIR??null,
  };
  console.log("\n[USER MESSAGE SENT TO AI]:\n" + buildCompareMsg(compareInput));
  console.log("\n[AI RESPONSE]:");
  const ai3 = await callAI(SYSTEM_COMPARE, buildCompareMsg(compareInput), 2500);
  console.log(JSON.stringify(ai3, null, 2));
}

main().catch(console.error);
