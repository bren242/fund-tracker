#!/usr/bin/env node
// Regression test: Two-Pass Architecture
// Uploads each fund report to Vercel API, documents results in test-results.md

import https from 'https';
import fs from 'fs';
import path from 'path';

const API_HOST = 'fund-tracker-zeta.vercel.app';
const API_PATH = '/api/parse?action=parse-file&client=green';
const PASSWORD = 'super2026';

const FILES = [
  // Fund performance report images / PDFs
  { path: 'C:/Users/Agam/CLO_IBI.png',                                                       label: 'CLO_IBI (root)' },
  { path: 'C:/Users/Agam/Desktop/איתן/CLO IBI.png',                                          label: 'CLO IBI png' },
  { path: 'C:/Users/Agam/Desktop/איתן/IBI CLO.pdf',                                          label: 'IBI CLO pdf' },
  { path: 'C:/Users/Agam/Desktop/איתן/ogen J.png',                                           label: 'ogen J png' },
  { path: 'C:/Users/Agam/Desktop/איתן/keren-ogen_jan26 class a.pdf',                         label: 'keren-ogen jan26' },
  { path: 'C:/Users/Agam/Desktop/איתן/aspm_dec25.pdf',                                       label: 'aspm dec25' },
  { path: 'C:/Users/Agam/Desktop/איתן/Sphera Master Fund Q1 2026.pdf.pdf',                   label: 'Sphera Q1 2026' },
  { path: 'C:/Users/Agam/Desktop/איתן/Creative Value עלון פברואר.pdf',                       label: 'Creative Value Feb' },
  { path: 'C:/Users/Agam/Desktop/איתן/morefeb.png',                                          label: 'morefeb png' },
  { path: 'C:/Users/Agam/Desktop/איתן/מעקב קרנות CLO.pdf',                                   label: 'מעקב CLO' },
  { path: 'C:/Users/Agam/Desktop/איתן/מעקב קרנות גידור לונג.pdf',                            label: 'מעקב גידור לונג' },
  { path: 'C:/Users/Agam/Desktop/מעקב קרנות/2.26 NOX מעקב קרנות השקעה.pdf',                 label: 'NOX 2.26' },
  { path: 'C:/Users/Agam/Desktop/מעקב קרנות/NOX - מעקב קרנות השקעה.pdf',                    label: 'NOX tracker' },
  { path: 'C:/Users/Agam/Desktop/מעקב קרנות/מעקב קרנות השקעה.pdf',                           label: 'מעקב קרנות' },
  { path: 'C:/Users/Agam/Desktop/מעקב קרנות/מעקב 1קרנות השקעה.pdf',                          label: 'מעקב קרנות 1' },
  { path: 'C:/Users/Agam/Desktop/מעקב קרנות/השוואה.pdf',                                     label: 'השוואה' },
  { path: 'C:/Users/Agam/Desktop/מעקב קרנות/מעקב קרנות גרף.pdf',                             label: 'מעקב גרף' },
  { path: 'C:/Users/Agam/Desktop/מעקב קרנות/מעקב קרנות השקעה גרף11.pdf',                     label: 'מעקב גרף11' },
  { path: 'C:/Users/Agam/Desktop/מעקב קרנות/מעקב קרנות השקעה סיכון מול תשואה .pdf',          label: 'מעקב סיכון-תשואה' },
  { path: 'C:/Users/Agam/Desktop/מעקב קרנות/מכתב תודה על תרומת חברת גרין 3.26.pdf',          label: 'מכתב תודה גרין' },
];

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function uploadFile(filePath, label) {
  return new Promise((resolve) => {
    const nativePath = filePath.replace(/\//g, path.sep);
    if (!fs.existsSync(nativePath)) {
      resolve({ label, filePath, error: 'FILE_NOT_FOUND', result: null, statusCode: null });
      return;
    }

    let fileBuffer;
    try {
      fileBuffer = fs.readFileSync(nativePath);
    } catch (e) {
      resolve({ label, filePath, error: 'READ_ERROR: ' + e.message, result: null, statusCode: null });
      return;
    }

    const fileName = path.basename(nativePath);
    const mimeType = getMimeType(nativePath);
    const boundary = '----FormBoundary' + Date.now();
    const header = Buffer.from(
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="file"; filename="' + encodeURIComponent(fileName) + '"\r\n' +
      'Content-Type: ' + mimeType + '\r\n\r\n'
    );
    const footer = Buffer.from('\r\n--' + boundary + '--\r\n');
    const body = Buffer.concat([header, fileBuffer, footer]);

    const options = {
      hostname: API_HOST,
      path: API_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': body.length,
        'x-admin-password': PASSWORD,
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8');
        try {
          const parsed = JSON.parse(data);
          resolve({ label, filePath, mimeType, fileSize: fileBuffer.length, statusCode: res.statusCode, result: parsed, error: null });
        } catch (e) {
          resolve({ label, filePath, mimeType, fileSize: fileBuffer.length, statusCode: res.statusCode, error: 'JSON_PARSE_ERROR', rawBody: data.slice(0, 300), result: null });
        }
      });
    });

    req.on('error', (e) => resolve({ label, filePath, error: e.message, result: null, statusCode: null }));

    // Write in chunks to avoid overwhelming the socket
    const CHUNK_SIZE = 64 * 1024;
    let offset = 0;
    function writeNext() {
      while (offset < body.length) {
        const chunk = body.subarray(offset, offset + CHUNK_SIZE);
        offset += CHUNK_SIZE;
        if (!req.write(chunk)) {
          req.once('drain', writeNext);
          return;
        }
      }
      req.end();
    }
    writeNext();
  });
}

function analyzeResult(r) {
  if (r.error) return { status: 'ERROR', detail: r.error };
  if (r.statusCode !== 200) {
    const errMsg = r.result?.error || r.rawBody || '';
    return { status: 'HTTP_' + r.statusCode, detail: errMsg };
  }

  const res = r.result;
  if (res.error) return { status: 'API_ERROR', detail: res.error };

  const dual = res.dualCurrencyData;
  if (!dual || dual.length === 0) {
    return { status: 'NO_DATA', detail: 'dualCurrencyData empty or missing' };
  }

  const entries = dual.map((entry, i) => {
    const currency = entry.returnBasis || 'null';
    const fields = entry.fields || [];
    const amr = entry.allMonthlyReturns || {};

    // Monthly return fields: key = "monthlyReturns.YYYY-MM"
    const monthFields = fields.filter(f => f.key && f.key.startsWith('monthlyReturns.'));
    // YTD fields: key = "returns.ytdYYYY"
    const ytdFields = fields.filter(f => f.key && f.key.match(/returns\.ytd\d{4}/));
    // Annual fields: key = "returns.yYYYY"
    const annualFields = fields.filter(f => f.key && f.key.match(/returns\.y\d{4}$/));
    // ITD field
    const itdField = fields.find(f => f.key === 'returns.itd');
    // Other fields
    const otherFields = fields.filter(f => !f.key?.startsWith('monthlyReturns.') && !f.key?.match(/returns\.(ytd|y\d{4}|itd)/) );

    // Extract unique years from monthly keys
    const yearSet = new Set();
    monthFields.forEach(f => {
      const m = f.key.match(/monthlyReturns\.(\d{4})-/);
      if (m) yearSet.add(m[1]);
    });
    // Also from allMonthlyReturns
    Object.keys(amr).forEach(k => {
      const m = k.match(/^(\d{4})-/);
      if (m) yearSet.add(m[1]);
    });

    const years = [...yearSet].sort();

    // Value format analysis: decimal (<1) vs percent (>1)
    const allNumVals = monthFields.map(f => f.value).filter(v => typeof v === 'number' && v !== 0);
    const absVals = allNumVals.map(Math.abs);
    const valueFormat = allNumVals.length === 0 ? 'no values'
      : absVals.every(v => v < 1.0) ? 'decimal (<1)'
      : absVals.every(v => v >= 1.0) ? 'percent (≥1)'
      : 'mixed';

    const nullCount = monthFields.filter(f => f.value === null || f.value === undefined).length;

    // Sample monthly values (first 3)
    const sampleMonths = monthFields.slice(0, 3).map(f => `${f.key.replace('monthlyReturns.', '')}=${f.value}`);

    // Per-year month coverage (how many months per year)
    const monthsPerYear = {};
    monthFields.forEach(f => {
      const m = f.key.match(/monthlyReturns\.(\d{4})-/);
      if (m) monthsPerYear[m[1]] = (monthsPerYear[m[1]] || 0) + 1;
    });

    // YTD details
    const ytdDetails = ytdFields.map(f => {
      const yearMatch = f.key.match(/ytd(\d{4})/);
      return { year: yearMatch?.[1], value: f.value };
    });

    return {
      index: i,
      currency,
      years,
      monthCount: monthFields.length,
      nullCount,
      valueFormat,
      sampleMonths,
      monthsPerYear,
      ytdFields: ytdDetails,
      hasYTD: ytdFields.length > 0,
      annualFields: annualFields.map(f => ({ key: f.key, value: f.value })),
      itd: itdField ? { value: itdField.value } : null,
      otherFieldKeys: otherFields.map(f => f.key),
      amrCount: Object.keys(amr).length,
    };
  });

  return {
    status: 'OK',
    fundName: res.fundName || '',
    reportMonth: res.reportMonth,
    fromCache: !!res.fromCache,
    tokenUsage: res.tokenUsage,
    cacheVersion: res._cacheVersion,
    entries,
  };
}

function entryToMarkdown(entry) {
  const lines = [];
  lines.push(`  **Currency**: ${entry.currency}`);
  lines.push(`  **Years**: ${entry.years.join(', ') || '(none)'}`);
  lines.push(`  **Monthly fields**: ${entry.monthCount} (${entry.nullCount} null)`);

  const coverageStr = Object.entries(entry.monthsPerYear).map(([y, n]) => `${y}:${n}m`).join(', ');
  lines.push(`  **Coverage**: ${coverageStr || '—'}`);
  lines.push(`  **Value format**: ${entry.valueFormat}`);
  lines.push(`  **Sample values**: ${entry.sampleMonths.join(', ') || '—'}`);

  if (entry.hasYTD) {
    const ytdStr = entry.ytdFields.map(y => `${y.year}=${y.value}`).join(', ');
    lines.push(`  **YTD**: ✅ ${ytdStr}`);
  } else {
    lines.push(`  **YTD**: ❌`);
  }

  if (entry.annualFields.length > 0) {
    lines.push(`  **Annual totals**: ${entry.annualFields.map(f => `${f.key.replace('returns.y','')}=${f.value}`).join(', ')}`);
  }

  if (entry.itd) {
    lines.push(`  **ITD**: ✅ ${entry.itd.value}`);
  }

  if (entry.otherFieldKeys.length > 0) {
    lines.push(`  **Other fields**: ${entry.otherFieldKeys.join(', ')}`);
  }

  return lines.join('\n');
}

async function main() {
  console.log(`\nTwo-Pass Regression Test — ${FILES.length} files\n${'='.repeat(50)}`);

  const results = [];

  for (const file of FILES) {
    process.stdout.write(`[${String(results.length + 1).padStart(2,'0')}/${FILES.length}] ${file.label.padEnd(25)} `);
    const raw = await uploadFile(file.path, file.label);
    const analysis = analyzeResult(raw);
    results.push({ ...file, raw, analysis });

    if (analysis.status === 'OK') {
      const currencies = analysis.entries.map(e => e.currency).join('/');
      const years = [...new Set(analysis.entries.flatMap(e => e.years))].sort();
      const ytd = analysis.entries.some(e => e.hasYTD) ? '✅YTD' : '❌YTD';
      const fmt = analysis.entries[0]?.valueFormat || '?';
      console.log(`✅  ${currencies} | ${years[0]}–${years[years.length-1]} | ${ytd} | ${fmt}${analysis.fromCache ? ' [cached]' : ''}`);
    } else {
      console.log(`❌  ${analysis.status}: ${String(analysis.detail).slice(0, 80)}`);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  // === Build test-results.md ===
  const ok = results.filter(r => r.analysis.status === 'OK');
  const noData = results.filter(r => r.analysis.status === 'NO_DATA');
  const errors = results.filter(r => !['OK','NO_DATA'].includes(r.analysis.status));

  const lines = [];
  lines.push('# Regression Test Results — Two-Pass Architecture');
  lines.push(`> Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| ✅ OK | ${ok.length} |`);
  lines.push(`| ⚠️ No Data | ${noData.length} |`);
  lines.push(`| ❌ Error | ${errors.length} |`);
  lines.push(`| **Total** | **${results.length}** |`);
  lines.push('');

  // Quick reference table
  lines.push('## Quick Reference');
  lines.push('');
  lines.push('| File | Fund Name | Currency | Years | Months | YTD | Value Format | Notes |');
  lines.push('|------|-----------|----------|-------|--------|-----|--------------|-------|');

  for (const r of results) {
    const a = r.analysis;
    if (a.status === 'OK') {
      for (const entry of a.entries) {
        const yRange = entry.years.length > 0 ? `${entry.years[0]}–${entry.years[entry.years.length-1]}` : '—';
        const ytd = entry.hasYTD ? '✅' : '❌';
        const notes = a.fromCache ? 'cached' : '';
        lines.push(`| ${r.label} | ${a.fundName || '?'} | ${entry.currency} | ${yRange} | ${entry.monthCount} (${entry.nullCount} null) | ${ytd} | ${entry.valueFormat} | ${notes} |`);
      }
    } else {
      lines.push(`| ${r.label} | — | — | — | — | — | — | ❌ ${a.status}: ${String(a.detail).slice(0,60)} |`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Detailed Results');
  lines.push('');

  for (const r of results) {
    const a = r.analysis;
    lines.push(`### ${r.label}`);
    lines.push('');
    lines.push(`- **Path**: \`${r.filePath}\``);
    lines.push(`- **Size**: ${r.raw.fileSize ? Math.round(r.raw.fileSize/1024) + ' KB' : 'N/A'}`);
    lines.push(`- **Status**: ${a.status}`);
    lines.push('');

    if (a.status === 'OK') {
      lines.push(`- **Fund name**: ${a.fundName || '(not extracted)'}`);
      lines.push(`- **Report month**: ${a.reportMonth || '?'}`);
      lines.push(`- **Cache version**: ${a.cacheVersion}`);
      lines.push(`- **From cache**: ${a.fromCache}`);
      if (a.tokenUsage) {
        lines.push(`- **Tokens**: input=${a.tokenUsage.input_tokens}, output=${a.tokenUsage.output_tokens}`);
      }
      lines.push('');
      lines.push(`- **Entries**: ${a.entries.length}`);
      lines.push('');
      for (const entry of a.entries) {
        lines.push(`**Entry ${entry.index + 1}** (${entry.currency}):`);
        lines.push('');
        lines.push(entryToMarkdown(entry));
        lines.push('');
      }
    } else {
      lines.push(`- **Error**: \`${a.detail}\``);
      if (r.raw.result) {
        lines.push(`- **Response**: \`${JSON.stringify(r.raw.result).slice(0, 200)}\``);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## Issues Found');
  lines.push('');

  // Collect issues
  const issues = [];
  for (const r of results) {
    const a = r.analysis;
    if (a.status !== 'OK') {
      issues.push(`- **${r.label}**: ${a.status} — ${String(a.detail).slice(0,100)}`);
      continue;
    }
    for (const entry of a.entries) {
      if (entry.nullCount > 0) {
        issues.push(`- **${r.label}** (${entry.currency}): ${entry.nullCount} null monthly values`);
      }
      if (entry.valueFormat === 'mixed') {
        issues.push(`- **${r.label}** (${entry.currency}): mixed decimal/percent values — needs investigation`);
      }
      if (entry.valueFormat === 'percent (≥1)') {
        issues.push(`- **${r.label}** (${entry.currency}): values appear to be percentages (≥1) instead of decimals`);
      }
      if (!entry.hasYTD) {
        issues.push(`- **${r.label}** (${entry.currency}): no YTD extracted`);
      }
    }
  }

  if (issues.length === 0) {
    lines.push('None.');
  } else {
    lines.push(...issues);
  }

  lines.push('');

  const outputPath = path.join('C:', 'Users', 'Agam', 'Desktop', 'מעקב קרנות', 'fund-tracker', 'test-results.md');
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results written: ${outputPath}`);
  console.log(`OK: ${ok.length} | No data: ${noData.length} | Errors: ${errors.length}`);
}

main().catch(console.error);
