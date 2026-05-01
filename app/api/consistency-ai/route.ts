/**
 * POST /api/consistency-ai
 *
 * Receives the full FundConsistencyData payload from the client,
 * builds a Hebrew financial analysis prompt, and returns { analysis: string }.
 */
import { NextRequest, NextResponse } from "next/server";

/* ── types ──────────────────────────────────────────────────────────────── */
interface ConsistencyPayload {
  fund: { id: string; name: string; classification: string; lastReportDate: string | null };
  category: { id: string; name: string; fundsCount: number; fundsWithMonthlyData: number };
  endMonth: string;
  ir: number | null;
  vsBenchmark: {
    monthsAbove: number; monthsBelow: number; totalMonths: number;
    percentageAbove: number; benchmarkName: string; insufficientData: boolean;
  };
  vsCategory: {
    monthsAbove: number; monthsBelow: number; totalMonths: number;
    percentageAbove: number; insufficientData: boolean;
  };
  monthly:    { fundReturn: number | null; categoryAvg: number | null; diff: number | null };
  ytd:        { fundReturn: number | null; categoryAvg: number | null; diff: number | null; fromMonth: string };
  rolling24m: { fundReturn: number | null; categoryAvg: number | null; diff: number | null; fromMonth: string };
}

interface AnthropicMessage {
  content: { type: string; text?: string }[];
}

/* ── helpers ────────────────────────────────────────────────────────────── */

/** Format a decimal fraction as a percentage string (e.g. 0.035 → "3.5%") */
function pct(v: number | null): string {
  if (v == null) return "אין נתונים";
  return `${(v * 100).toFixed(1)}%`;
}

/** Format a percentage-scale value (e.g. 46.0 → "46.0%") */
function pctScale(v: number): string {
  return `${v.toFixed(1)}%`;
}

/** Format IR — already a ratio, no conversion */
function fmtIR(v: number | null): string {
  if (v == null) return "אין נתונים";
  return v.toFixed(2);
}

/* ── route handler ──────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  let payload: ConsistencyPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const { category, ir, vsBenchmark, vsCategory, monthly, ytd, rolling24m } = payload;

  /* ── build prompt fields ─────────────────────────────────────────────── */
  const bmPct   = vsBenchmark.insufficientData ? "אין נתונים" : pctScale(vsBenchmark.percentageAbove);
  const bmTotal = vsBenchmark.insufficientData ? "אין נתונים" : String(vsBenchmark.totalMonths);
  const catPct  = vsCategory.insufficientData  ? "אין נתונים" : pctScale(vsCategory.percentageAbove);
  const catTotal = vsCategory.insufficientData ? "אין נתונים" : String(vsCategory.totalMonths);

  const systemPrompt = `אתה אנליסט פיננסי שכותב ניתוחים קצרים בעברית לקרנות גידור.
חוקי ברזל:
1. השתמש רק במספרים שמופיעים ב-INPUT. אסור להמציא נתונים נוספים, אסור לשער, אסור להזכיר תקופות שלא ב-INPUT.
2. אל תזכיר את שם הקרן או הקטגוריה. ה-UI כבר מציג אותם.
3. אורך: 3-4 משפטים. ללא bullet points. פסקה אחת.
4. סגנון: מקצועי, ענייני, ללא שיווק. בלי "הקרן מציגה ביצועים מרשימים".
5. אם insufficientData=true באחד הכרטיסים — ציין זאת.
6. ציטוט מספרים: עיגול לאחוז אחד אחרי הנקודה (12.3%), לא יותר.
7. סיים תמיד במשפט יחיד שמסכם את האיכות הכללית של הקרן מול הקטגוריה.
8. IR (Information Ratio) הוא יחס דצימלי, לא אחוז. הצג אותו עם 2 ספרות אחרי הנקודה (לדוגמה: -0.15) ולעולם אל תוסיף לו סימן אחוז.
9. אחוז חודשים מעל בנצ'מרק ואחוז חודשים מעל קטגוריה הם שני מדדים נפרדים. גם אם המספר זהה — התייחס לכל אחד בנפרד. אסור לאחד אותם למשפט אחד.`;

  const userPrompt = `INPUT:
- IR (24M, יחס דצימלי, לא אחוז): ${fmtIR(ir)}
- אחוז חודשים מעל בנצ'מרק (24M): ${bmPct}, סך ${bmTotal} חודשים
- אחוז חודשים מעל ממוצע קטגוריה (24M): ${catPct}, סך ${catTotal} חודשים
- ממוצע קטגוריה מבוסס על: ${category.fundsWithMonthlyData} מתוך ${category.fundsCount} קרנות
- חודשי (חודש נבחר): קרן ${pct(monthly.fundReturn)}, קטגוריה ${pct(monthly.categoryAvg)}, הפרש ${pct(monthly.diff)}
- מצטבר מתחילת שנה: קרן ${pct(ytd.fundReturn)}, קטגוריה ${pct(ytd.categoryAvg)}, הפרש ${pct(ytd.diff)}
- Rolling 24M: קרן ${pct(rolling24m.fundReturn)}, קטגוריה ${pct(rolling24m.categoryAvg)}, הפרש ${pct(rolling24m.diff)}

כתוב פסקת ניתוח.`;

  /* ── call Anthropic REST API ────────────────────────────────────────── */
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "x-api-key":       apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-20250514",
        max_tokens: 800,
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
    console.error("consistency-ai error:", err);
    return NextResponse.json({ error: "AI unavailable" }, { status: 500 });
  }
}
