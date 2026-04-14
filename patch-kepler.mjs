/**
 * One-time patch: plant full Kepler Capital data into KV (funds:green).
 * Source: Pass-2 raw extraction from KEPLER.pdf (March 2026 report).
 * Run: node patch-kepler.mjs
 */

const KV_URL   = "https://upright-asp-87838.upstash.io";
const KV_TOKEN = "gQAAAAAAAVceAAIncDEwNjZlZTFiMTQ3Y2I0YjRhODMwYTkzZWNhZjFjZDIxZnAxODc4Mzg";

// ── Verified data from Pass-2 (LTR test, March 2026 report) ────────────────
// All values as decimals (e.g. 2.22% → 0.0222)
const KEPLER_MONTHLY = {
  "2018-03": 0.0215,
  "2018-04": -0.0194,
  "2019-01": 0.0468, "2019-02": -0.0329, "2019-03": -0.0071, "2019-04": 0.0184,
  "2019-05": -0.0502, "2019-06": 0.0208, "2019-07": -0.0358, "2019-08": 0.0072,
  "2019-09": 0.0647, "2019-10": 0.0462, "2019-11": -0.0332, "2019-12": 0.0112,
  "2020-01": -0.0126, "2020-02": -0.0122, "2020-03": -0.1390, "2020-04": 0.1420,
  "2020-05": 0.0083, "2020-06": -0.0091, "2020-07": 0.0740, "2020-08": 0.0998,
  "2020-09": -0.0086, "2020-10": 0.0405, "2020-11": 0.0479, "2020-12": 0.0274,
  "2021-01": 0.1500, "2021-02": 0.0542, "2021-03": 0.0220, "2021-04": 0.0434,
  "2021-05": 0.0052, "2021-06": 0.0131, "2021-07": -0.0146, "2021-08": 0.0041,
  "2021-09": 0.0143, "2021-10": 0.0160, "2021-11": 0.0092, "2021-12": 0.0273,
  "2022-01": -0.0113, "2022-02": 0.0027, "2022-03": 0.0161, "2022-04": 0.0091,
  "2022-05": -0.0300, "2022-06": -0.0267, "2022-07": 0.0233, "2022-08": -0.0106,
  "2022-09": -0.0400, "2022-10": 0.0178, "2022-11": 0.0123, "2022-12": -0.0539,
  "2023-01": 0.0269, "2023-02": -0.0070, "2023-03": -0.0166, "2023-04": 0.0237,
  "2023-05": 0.0071, "2023-06": -0.0097, "2023-07": 0.0148, "2023-08": 0.0513,
  "2023-09": -0.0152, "2023-10": -0.0476, "2023-11": 0.0145, "2023-12": 0.0636,
  "2024-01": 0.0208, "2024-02": 0.0302, "2024-03": 0.0406, "2024-04": 0.0362,
  "2024-05": 0.0245, "2024-06": -0.0202, "2024-07": 0.0140, "2024-08": 0.0112,
  "2024-09": 0.0325, "2024-10": 0.0021, "2024-11": 0.0217, "2024-12": 0.0600,
  "2025-01": 0.0178, "2025-02": 0.0127, "2025-03": -0.0032, "2025-04": 0.0356,
  "2025-05": 0.0817, "2025-06": 0.0322, "2025-07": 0.0273, "2025-08": 0.0272,
  "2025-09": 0.0236, "2025-10": 0.0228, "2025-11": -0.0001, "2025-12": 0.0404,
  "2026-01": 0.0222, "2026-02": -0.0149, "2026-03": -0.0507,
};

const KEPLER_ANNUAL = {
  ytd2026: -0.0441,
  y2025: 0.3653,
  y2024: 0.3077,
  y2023: 0.1054,
  y2022: -0.0908,
  y2021: 0.3920,
  y2020: 0.2571,
  y2019: 0.0496,
  y2018: 0.0017,
};

// ── KV helpers ─────────────────────────────────────────────────────────────
async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const json = await res.json();
  if (json.error) throw new Error(`KV GET error: ${json.error}`);
  return json.result ? JSON.parse(json.result) : null;
}

async function kvSet(key, value) {
  const res = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(JSON.stringify(value)),
  });
  const json = await res.json();
  if (json.error) throw new Error(`KV SET error: ${json.error}`);
  return json.result;
}

// ── Risk metrics calculation ──────────────────────────────────────────────
function calcRiskMetrics(monthlyReturns) {
  const vals = Object.values(monthlyReturns).filter(v => typeof v === 'number' && !isNaN(v));
  if (vals.length < 12) return null;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1);
  const stdDev = Math.sqrt(variance);
  const RISK_FREE = 0.003;
  let sharpe = null;
  if (stdDev >= 0.001) {
    const raw = ((mean - RISK_FREE) / stdDev) * Math.sqrt(12);
    if (Math.abs(raw) <= 5) sharpe = Math.round(raw * 100) / 100;
  }
  return { sharpe, stdDev: Math.round(stdDev * 10000) / 10000 };
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("📥 Fetching funds:green from KV...");
  const data = await kvGet("funds:green");
  if (!data || !data.categories) throw new Error("No funds data found");

  // Find Kepler
  let keplerFund = null;
  for (const cat of data.categories) {
    for (const fund of cat.funds || []) {
      if (fund.id === "fund-50" || fund.name === "קפלר קפיטל") {
        keplerFund = fund;
        break;
      }
    }
    if (keplerFund) break;
  }
  if (!keplerFund) throw new Error("Kepler fund not found!");
  console.log(`✅ Found: ${keplerFund.name} (id: ${keplerFund.id})`);
  console.log(`   Before: monthlyReturn=${keplerFund.monthlyReturn}, ytd2026=${keplerFund.returns?.ytd2026}, lastReportDate=${keplerFund.lastReportDate}`);

  // Patch
  keplerFund.monthlyReturn = -0.0507; // March 2026
  keplerFund.lastReportDate = "2026-03-31";
  keplerFund.startDate = "2018-03-01";
  keplerFund.returns = { ...KEPLER_ANNUAL };
  keplerFund.monthlyReturns = { ...KEPLER_MONTHLY };

  // Recalc avgAnnualReturn
  const yearlyVals = Object.entries(KEPLER_ANNUAL)
    .filter(([k, v]) => /^y\d{4}$/.test(k) && typeof v === 'number')
    .map(([, v]) => v);
  if (yearlyVals.length >= 2) {
    keplerFund.avgAnnualReturn = Math.round(
      (yearlyVals.reduce((s, v) => s + v, 0) / yearlyVals.length) * 10000
    ) / 10000;
  }

  // Recalc Sharpe + StdDev
  const metrics = calcRiskMetrics(KEPLER_MONTHLY);
  if (metrics) {
    keplerFund.sharpe = metrics.sharpe;
    keplerFund.stdDev = metrics.stdDev;
  }

  console.log(`\n📊 Patched values:`);
  console.log(`   monthlyReturn : ${keplerFund.monthlyReturn} (March 2026)`);
  console.log(`   ytd2026       : ${keplerFund.returns.ytd2026}`);
  console.log(`   y2025         : ${keplerFund.returns.y2025}`);
  console.log(`   y2024         : ${keplerFund.returns.y2024}`);
  console.log(`   avgAnnualReturn: ${keplerFund.avgAnnualReturn}`);
  console.log(`   sharpe        : ${keplerFund.sharpe}`);
  console.log(`   stdDev        : ${keplerFund.stdDev}`);
  console.log(`   monthlyReturns: ${Object.keys(keplerFund.monthlyReturns).length} entries`);

  console.log("\n📤 Writing back to KV...");
  await kvSet("funds:green", data);
  console.log("✅ Done. Kepler Capital updated in production.");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
