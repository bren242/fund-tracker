/**
 * Re-run just the compare test with 2500 tokens.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { jsonrepair } from "jsonrepair";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

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
  } catch { /* skip */ }
}

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  return JSON.parse((await res.json()).result);
}

const CATEGORY_BLEND = {
  "equity-hedged":  { "bm-ta125": 1.0 },
  "bond-hedged":    { "bm-ta125": 0.15, "bm-telbond-maagar": 0.85 },
  "multi-strategy": { "bm-ta125": 0.30, "bm-telbond-maagar": 0.70 },
};
const HEB_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const hebrewLabel = (ym) => { const [y,m] = ym.split("-"); return `${HEB_MONTHS[+m-1]} ${y}`; };
function wm(endMonth, count) {
  const [ey,em]=endMonth.split("-").map(Number);
  const r=[];
  for(let i=count-1;i>=0;i--){const t=ey*12+em-1-i;r.push(`${Math.floor(t/12)}-${String((t%12)+1).padStart(2,"0")}`);}
  return r;
}
function blendBM(blend,bms){const r={};for(const[id,w]of Object.entries(blend)){const bm=bms.find(b=>b.id===id);for(const[m,v]of Object.entries(bm?.monthlyReturns??{}))r[m]=(r[m]??0)+v*w;}return r;}
function calcCons(fw,ref,min,withIR){const ms=Object.keys(fw).filter(m=>ref[m]!=null).sort();if(ms.length<min)return null;const gaps=ms.map(m=>fw[m]-ref[m]);const wins=gaps.filter(g=>g>0).length;const avg=gaps.reduce((s,v)=>s+v,0)/gaps.length;let ir=null;if(withIR&&gaps.length>=2){const std=Math.sqrt(gaps.reduce((s,g)=>s+(g-avg)**2,0)/(gaps.length-1));ir=std>0?Math.round(avg/std*1000)/1000:null;}return{score:Math.round(wins/gaps.length*10000)/100,wins,total:gaps.length,avgGap:Math.round(avg*1e6)/1e6,ir};}
function catAvg(funds){const s={},c={};for(const f of funds)for(const[m,v]of Object.entries(f.monthlyReturns??{})){s[m]=(s[m]??0)+v;c[m]=(c[m]??0)+1;}const r={};for(const m of Object.keys(s))r[m]=s[m]/c[m];return r;}
function catAvg3(funds,m){const vs=funds.map(f=>f.monthlyReturns?.[m]).filter(v=>v!=null);return vs.length>=3?vs.reduce((s,v)=>s+v,0)/vs.length:null;}
function worst(fund,bw,catF,wms){let k=null,e=Infinity;for(const m of wms){const fr=fund.monthlyReturns?.[m],br=bw[m];if(fr==null||br==null)continue;const x=fr-br;if(x<e){e=x;k=m;}}if(!k)return null;return{monthLabelHebrew:hebrewLabel(k),fundReturn:fund.monthlyReturns[k],benchmarkReturn:bw[k],categoryAverageReturn:catAvg3(catF,k),fundVsBenchmark:e};}
function cohort(fund,catF,m){const fr=fund.monthlyReturns?.[m];if(fr==null)return null;const o=catF.filter(f=>f.id!==fund.id).map(f=>f.monthlyReturns?.[m]).filter(v=>v!=null);if(!o.length)return null;const a=o.filter(r=>r>fr).length,b=o.filter(r=>fr>r).length;return{rank:1+a,total:o.length+1,percentile:Math.round(b/o.length*100)};}
function catStats(funds,bw,wms){const fs=[];for(const f of funds){const fw={},bww={};for(const m of wms){if(f.monthlyReturns?.[m]!=null)fw[m]=f.monthlyReturns[m];if(bw[m]!=null)bww[m]=bw[m];}const r=calcCons(fw,bww,12,true);if(r?.ir!=null)fs.push({fundId:f.id,ir:r.ir});}fs.sort((a,b)=>b.ir-a.ir);return{fundCount:fs.length,averageIR:fs.length?Math.round(fs.reduce((s,f)=>s+f.ir,0)/fs.length*1000)/1000:0,funds:fs};}

function pctStr(v,d=1){if(v==null)return"אין נתונים";const val=(v*100).toFixed(d);return v>=0?`+${val}%`:`${val}%`;}
function irStr(v){return v==null?"אין נתונים":v.toFixed(2);}

async function callAI(sys, usr, maxTokens=2500) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01"},
    body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:maxTokens,temperature:0.4,system:sys,messages:[{role:"user",content:usr},{role:"assistant",content:"{"}]}),
    signal:AbortSignal.timeout(90000),
  });
  if(!res.ok){console.error("AI error:",res.status);return null;}
  const body=await res.json();
  const raw="{"+body.content.filter(b=>b.type==="text").map(b=>b.text??"").join("").trim();
  try{return JSON.parse(raw);}catch{try{return JSON.parse(jsonrepair(raw));}catch{console.error("JSON repair failed");return null;}}
}

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

async function main() {
  const [fundsData, benchmarks] = await Promise.all([kvGet("funds:green"), kvGet("benchmarks:green")]);
  const allFunds = fundsData.categories.flatMap(c=>c.funds);

  // Get window
  const fundData = allFunds.map(f=>{const ms=Object.keys(f.monthlyReturns??{}).sort();return ms.length?{id:f.id,last:ms[ms.length-1]}:null;}).filter(Boolean);
  const sorted = fundData.map(f=>f.last).sort();
  const consensus = sorted[Math.floor(sorted.length/2)];
  const relevBms = new Set(Object.values(CATEGORY_BLEND).flatMap(b=>Object.keys(b)));
  const bmLast = [...relevBms].map(id=>{const bm=benchmarks.find(b=>b.id===id);const ms=Object.keys(bm?.monthlyReturns??{}).sort();return ms.length?ms[ms.length-1]:null;}).filter(Boolean);
  const ceiling = bmLast.length?bmLast.reduce((a,b)=>a<b?a:b):consensus;
  const endMonth = consensus<ceiling?consensus:ceiling;
  const windowMonths = wm(endMonth, 24);

  const compareIds = ["fund-24","fund-22","fund-23"];
  let cat;

  const funds = compareIds.map(id => {
    for(const c of fundsData.categories){const f=c.funds.find(f=>f.id===id);if(f){if(!cat)cat=c;const blend=CATEGORY_BLEND[c.id];const bw=blend?blendBM(blend,benchmarks):{};const bww={},fw={};for(const m of windowMonths){if(bw[m]!=null)bww[m]=bw[m];if(f.monthlyReturns?.[m]!=null)fw[m]=f.monthlyReturns[m];}const cav=catAvg(c.funds),caw={};for(const m of windowMonths)if(cav[m]!=null)caw[m]=cav[m];const vsB=blend?calcCons(fw,bww,12,true):null;const vsC=calcCons(fw,caw,12,false);const w=blend?worst(f,bww,c.funds,windowMonths):null;const coh=w?cohort(f,c.funds,w.monthKey??Object.keys(bww)[0]):null;return{fund:f,vsB,vsC,worst:w,cohort:coh};}}
    return null;
  }).filter(Boolean);

  const blend=CATEGORY_BLEND[cat.id],bwAll=blendBM(blend,benchmarks),bwWindow={};
  for(const m of windowMonths)if(bwAll[m]!=null)bwWindow[m]=bwAll[m];
  const cs=catStats(cat.funds,bwWindow,windowMonths);

  const userMsg = [
    `השוואה | קטגוריה: ${cat.name}`,
    `בנצ'מרק: ת"א 125`,
    `חלון ניתוח: 24 חודשים (${hebrewLabel(windowMonths[0])} – ${hebrewLabel(endMonth)})`,
    ``,
    ...funds.flatMap(({fund,vsB,vsC,worst:w,cohort:coh}) => [
      `── ${fund.name} ──`,
      `  Information Ratio: ${irStr(vsB?.ir)}`,
      vsB?`  חודשים מעל בנצ'מרק: ${vsB.wins} מתוך ${vsB.total} (${vsB.score.toFixed(1)}%)`:'',
      vsB?`  ממוצע פער חודשי: ${pctStr(vsB.avgGap)}`:'',
      vsC?`  חודשים מעל ממוצע קטגוריה: ${vsC.score.toFixed(1)}%`:'',
      w?`  החודש הקשה: ${w.monthLabelHebrew} — קרן: ${pctStr(w.fundReturn)}, בנצ'מרק: ${pctStr(w.benchmarkReturn)}, פער: ${pctStr(w.fundVsBenchmark)}`:'',
      w?.categoryAverageReturn!=null?`    ממוצע קטגוריה: ${pctStr(w.categoryAverageReturn)}`:'',
      coh?`    דירוג בחודש הזה: ${coh.rank}/${coh.total}`:'',
      ``,
    ]).filter(l=>l!=''),
    `הקשר קטגוריה (${cs.fundCount} קרנות עם IR): ממוצע IR ${irStr(cs.averageIR)}`,
    ``,
    `כתוב ניתוח השוואתי כ-JSON תקין בלבד.`,
  ].join("\n");

  console.log("[USER MESSAGE]:\n" + userMsg);
  console.log("\n[AI RESPONSE] (2500 tokens):");
  const ai = await callAI(SYSTEM_COMPARE, userMsg, 2500);
  console.log(JSON.stringify(ai, null, 2));
}

main().catch(console.error);
