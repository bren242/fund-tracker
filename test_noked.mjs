import fs from 'fs';
import path from 'path';

const FILE_PATH = 'C:/Users/Agam/Desktop/איתן/Noked Bonds - March 2026.pdf';
const API_URL = 'http://localhost:3000/api/parse';

async function test() {
  const fileBuffer = fs.readFileSync(FILE_PATH);
  const fileName = path.basename(FILE_PATH);

  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });
  formData.append('file', blob, fileName);

  console.log(`Uploading: ${fileName} (${(fileBuffer.length/1024).toFixed(1)} KB)`);

  const res = await fetch(API_URL + '?client=green&action=parse-file', {
    method: 'POST',
    body: formData,
    headers: { 'x-admin-password': 'green2026' },
  });
  const json = await res.json();

  if (!res.ok) {
    console.error('HTTP Error:', res.status, JSON.stringify(json, null, 2));
    return;
  }

  console.log('\n=== RAW RESPONSE (top-level) ===');
  console.log('fundName:', json.fundName);
  console.log('reportMonth:', json.reportMonth);
  console.log('returnBasis:', json.returnBasis);
  console.log('dualCurrencyData entries:', json.dualCurrencyData?.length ?? 0);

  if (json.dualCurrencyData) {
    for (const [i, entry] of json.dualCurrencyData.entries()) {
      console.log(`\n--- Entry ${i+1} (${entry.returnBasis}) ---`);
      const fields = entry.fields ?? [];
      const amr = entry.allMonthlyReturns ?? {};

      // March 2026
      const mar2026 = amr['2026-03'] ?? fields.find(f => f.key === 'monthlyReturns.2026-03')?.value;
      // YTD 2026
      const ytd2026 = fields.find(f => f.key === 'returns.ytd2026')?.value;
      // Annual 2025
      const y2025 = fields.find(f => f.key === 'returns.y2025')?.value;

      const pct = v => v != null ? `${(v*100).toFixed(4)}%` : 'NOT FOUND';

      console.log('March 2026 monthly:', pct(mar2026), mar2026 != null ? (Math.abs(mar2026 - 0.0119) < 0.001 ? '✅' : `❌ expected 1.19%`) : '❌');
      console.log('YTD 2026:         ', pct(ytd2026), ytd2026 != null ? (Math.abs(ytd2026 - (-0.0053)) < 0.001 ? '✅' : `❌ expected -0.53%`) : '❌');
      console.log('Annual 2025:      ', pct(y2025), y2025 != null ? (Math.abs(y2025 - 0.1142) < 0.003 ? '✅' : `❌ expected 11.42%`) : '❌');

      console.log('\nAll monthlyReturns keys:', Object.keys(amr).sort().join(', ') || '(none)');
      const ytdFields = fields.filter(f => f.key?.startsWith('returns.'));
      console.log('Returns fields:', ytdFields.map(f => `${f.key}=${(f.value*100).toFixed(2)}%`).join(', ') || '(none)');
    }
  } else {
    console.log('\nNo dualCurrencyData! Fields:', JSON.stringify(json.fields?.slice(0,10), null, 2));
  }
}

test().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
