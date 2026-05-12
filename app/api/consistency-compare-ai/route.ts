/**
 * POST /api/consistency-compare-ai
 *
 * Receives a multi-fund comparison payload and returns { analysis: string }
 * with a Hebrew comparative analysis.
 */
import { NextRequest, NextResponse } from "next/server";
import { ANTHROPIC_API_URL, ANTHROPIC_API_VERSION, CLAUDE_MODELS } from "@/lib/anthropic-config";

/* ── types ──────────────────────────────────────────────────────────────── */
interface FundData {
  fund:        { name: string; classification: string };
  ir:          number | null;
  vsBenchmark: { percentageAbove: number; totalMonths: number; benchmarkName: string; insufficientData: boolean };
  vsCategory:  { percentageAbove: number; totalMonths: number; insufficientData: boolean };
  monthly:     { fundReturn: number | null; categoryAvg: number | null };
  ytd:         { fundReturn: number | null; categoryAvg: number | null };
  rolling24m:  { fundReturn: number | null; categoryAvg: number | null };
}

interface ComparePayload {
  categoryInfo: { name: string; fundsCount: number; fundsWithMonthlyData: number };
  endMonth:     string;
  funds:        FundData[];
}

interface AnthropicMessage {
  content: { type: string; text?: string }[];
}

/* ── helpers ────────────────────────────────────────────────────────────── */
function pct(v: number | null): string {
  if (v == null) return "אין נתונים";
  return `${(v * 100).toFixed(1)}%`;
}
function fmtIR(v: number | null): string {
  if (v == null) return "אין נתונים";
  return v.toFixed(2);
}
function pctScale(v: number): string {
  return `${v.toFixed(1)}%`;
}

/* ── route handler ──────────────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  let payload: ComparePayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const { categoryInfo, endMonth, funds } = payload;

  /* ── build per-fund block ─────────────────────────────────────────────── */
  const fundsBlock = funds.map((fd, i) => {
    const bm  = fd.vsBenchmark.insufficientData ? "אין נתונים" : pctScale(fd.vsBenchmark.percentageAbove);
    const cat = fd.vsCategory.insufficientData  ? "אין נתונים" : pctScale(fd.vsCategory.percentageAbove);
    return `קרן ${i + 1}: ${fd.fund.name}
  - IR (24M, יחס דצימלי, לא אחוז): ${fmtIR(fd.ir)}
  - אחוז חודשים מעל בנצ'מרק (24M): ${bm}
  - אחוז חודשים מעל ממוצע קטגוריה (24M): ${cat}
  - חודשי: ${pct(fd.monthly.fundReturn)} (קטגוריה: ${pct(fd.monthly.categoryAvg)})
  - YTD: ${pct(fd.ytd.fundReturn)} (קטגוריה: ${pct(fd.ytd.categoryAvg)})
  - Rolling 24M: ${pct(fd.rolling24m.fundReturn)} (קטגוריה: ${pct(fd.rolling24m.categoryAvg)})`;
  }).join("\n\n");

  const systemPrompt = `אתה אנליסט פיננסי שכותב ניתוחי השוואה קצרים בעברית בין קרנות גידור באותה קטגוריה.
חוקי ברזל:
1. השתמש רק במספרים שמופיעים ב-INPUT.
2. אזכר את הקרנות בשמותיהן (זה מסך השוואה — השם רלוונטי).
3. אורך: 4-6 משפטים, פסקה אחת.
4. סדר חובה: (א) מי הכי עקבית מול הקטגוריה ולמה; (ב) מי הציגה את התשואה הגבוהה ביותר; (ג) משפט מסכם — איזה סוג משקיע יתאים לכל קרן.
5. IR הוא יחס דצימלי (לא אחוז), הצג עם 2 ספרות אחרי הנקודה.
6. אם קרן אחת חורגת משמעותית — ציין זאת מפורשות.
7. מקצועי, ענייני, ללא שיווק.`;

  const userPrompt = `קטגוריה: ${categoryInfo.name} (${categoryInfo.fundsWithMonthlyData} מתוך ${categoryInfo.fundsCount} קרנות עם נתונים חודשיים)
תקופה: חלון 24M המסתיים ב-${endMonth}

${fundsBlock}

כתוב פסקת ניתוח השוואתי.`;

  /* ── call Anthropic ───────────────────────────────────────────────────── */
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model:      CLAUDE_MODELS.SONNET,
        max_tokens: 1000,
        system:     systemPrompt,
        messages:   [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      console.error("Anthropic error:", res.status, await res.text());
      return NextResponse.json({ error: "AI unavailable" }, { status: 500 });
    }

    const msg: AnthropicMessage = await res.json();
    const analysis = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();

    return NextResponse.json({ analysis });
  } catch (err) {
    console.error("consistency-compare-ai error:", err);
    return NextResponse.json({ error: "AI unavailable" }, { status: 500 });
  }
}
