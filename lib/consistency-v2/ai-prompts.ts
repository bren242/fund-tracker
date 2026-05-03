/**
 * lib/consistency-v2/ai-prompts.ts
 *
 * System prompts, input types, and user-message formatters
 * for the two AI analysis endpoints (single fund + compare).
 */

/* ══════════════════════════════════════════════════════════════════════════ */
/*  System prompts                                                            */
/* ══════════════════════════════════════════════════════════════════════════ */

export const SYSTEM_PROMPT_FUND = `\
אתה כותב תובנה עובדתית קצרה עבור דוח עקביות קרן, עבור יועץ פיננסי.

כללים מחייבים:
1. עברית בלבד.
2. עובדות בלבד — ללא תחזית, ללא המלצה, ללא ניתוח מקרו.
3. 2–4 משפטים שמסכמים את ביצועי הקרן לפי מדדי העקביות הנתונים.
4. כל מספר שמוזכר חייב להופיע בקלט. אסור להמציא מספרים.
5. אין להשתמש במילים: "צפוי", "תחזית", "ריבית", "אינפלציה", "ממליץ", "כדאי", "עתיד", "בעתיד", "יהיה", "תהיה".
6. ללא disclaimer — הוא מוצג בנפרד.

החזר JSON תקין בלבד, ללא הסברים לפני או אחרי. Schema:
{"insightParagraph": "2–4 משפטים עובדתיים"}`;

export const FUND_FORBIDDEN_WORDS = [
  "צפוי", "תחזית", "ריבית", "אינפלציה", "ממליץ", "כדאי", "עתיד", "בעתיד",
];

export const SYSTEM_PROMPT_COMPARE = `\
אתה כותב פסקאות עבור דוח השוואה של 2-4 קרנות מאותה קטגוריה, עבור יועץ פיננסי.
הסגנון: עיתונות פיננסית עברית מקצועית — The Marker meets The Economist.

כללי כתיבה:
1. עברית בלבד. לא לערבב עם אנגלית בתוך אותה שורה.
2. מונחים טכניים (Information Ratio) — להסביר בקצרה בפעם הראשונה שמופיעים.
3. ללא רשימות, ללא bullets. פסקאות שלמות, זורמות.
4. כל מספר שמוזכר חייב להופיע בקלט. אסור להמציא מספרים.
5. לא להעצים. אם כל הקרנות חלשות (IR שלילי לכולן) — אסור להציג אף אחת כ"מנצחת". השתמש בניסוח "הפחות פגיעה" או דומה.
6. מבנה קבוע של שלוש פסקאות:
   - פסקה 1: הקרן המובילה ולמה (המספרים המכריעים).
   - פסקה 2: trade-offs. קרן אחרת שמובילה במימד ספציפי — באיזה תרחיש היא הבחירה.
   - פסקה 3: קרנות מפגרות — למה אינן מובילות באף מימד.
7. Verdict line חייב לשקף מציאות: אם כולן עם IR שלילי — "הפחות פגיעה", לא "המנצחת".
8. לא לכלול disclaimer — הוא מוצג בנפרד ב-footer.

החזר JSON תקין בלבד, ללא הסברים לפני או אחרי. Schema:
{
  "winnerVerdict": "טריו מובילה בעקביות" | "טריו — הפחות פגיעה מבין השלוש" | etc,
  "decisionParagraphs": ["פסקה ראשונה", "פסקה שנייה", "פסקה שלישית"],
  "worstMonthsNarrative": "משפט-שניים שמסכם חודשים קשים — דפוסים, קורלציות",
  "categoryContextNarrative": "משפט-שניים על מיקום הקרנות בקטגוריה"
}`;

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Output types                                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface FundAIOutput {
  insightParagraph: string;
}

export interface CompareAIOutput {
  winnerVerdict: string;
  decisionParagraphs: string[];
  worstMonthsNarrative: string;
  categoryContextNarrative: string;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Input types (structured data passed from route to formatter)             */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface FundWindowAIRow {
  label: string;       // e.g. "24 חודשים"
  months: number;
  fundReturn: number | null;     // cumulative %
  excessReturn: number | null;   // %
  ir: number | null;
  aboveBmCount: number | null;
  aboveBmTotal: number | null;
  mdd: number | null;            // negative % or null
  upCapture: number | null;      // %
  downCapture: number | null;    // %
  rankInCategory: number | null;
  totalInCategory: number | null;
}

export interface FundAIInput {
  fundName: string;
  categoryName: string;
  benchmarkDescription: string;
  endMonthLabel: string;
  windows: FundWindowAIRow[];
}

export interface CompareAIInput {
  categoryName: string;
  benchmarkDescription: string;
  windowMonths: number;
  startMonthLabel: string;
  endMonthLabel: string;
  funds: Array<{
    name: string;
    ir: number | null;
    score: number | null;
    wins: number | null;
    total: number | null;
    avgGapPct: number | null;
    scoreVsCategory: number | null;
    worstMonth: {
      monthLabel: string;
      fundReturnPct: number;
      bmReturnPct: number;
      gapPct: number;
      catAvgPct: number | null;
      cohortRank: number | null;
      cohortTotal: number | null;
    } | null;
  }>;
  categoryTotal: number | null;
  categoryAvgIR: number | null;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Benchmark description helper                                             */
/* ══════════════════════════════════════════════════════════════════════════ */

const BENCHMARK_NAMES: Record<string, string> = {
  "bm-ta125":          'ת"א 125',
  "bm-telbond-maagar": "תל בונד-מאגר",
  "bm-telbond-tsuot":  "תל בונד-תשואות",
  "bm-agach-klali":    'אג"ח כללי',
  "bm-sme60":          "SME 60",
};

const CATEGORY_BLEND_LABELS: Record<string, string> = {
  "equity-hedged":  'ת"א 125',
  "bond-hedged":    'ת"א 125 (15%) + תל בונד-מאגר (85%)',
  "multi-strategy": 'ת"א 125 (30%) + תל בונד-מאגר (70%)',
};

export function getBenchmarkDescription(categoryId: string): string {
  return CATEGORY_BLEND_LABELS[categoryId] ?? "אין בנצ'מרק";
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Number formatters                                                         */
/* ══════════════════════════════════════════════════════════════════════════ */

function pctStr(v: number | null, decimals = 1): string {
  if (v == null) return "אין נתונים";
  const val = (v * 100).toFixed(decimals);
  return v >= 0 ? `+${val}%` : `${val}%`;
}

function irStr(v: number | null): string {
  if (v == null) return "אין נתונים";
  return v.toFixed(2);
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  User message builders                                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

export function buildFundUserMessage(input: FundAIInput): string {
  const lines: string[] = [
    `קרן: ${input.fundName} | קטגוריה: ${input.categoryName}`,
    `בנצ'מרק: ${input.benchmarkDescription}`,
    `נכון ל: ${input.endMonthLabel}`,
    ``,
  ];

  for (const w of input.windows) {
    lines.push(`── ${w.label} (${w.months} חודשים) ──`);
    lines.push(`  תשואה מצטברת: ${w.fundReturn != null ? `${w.fundReturn > 0 ? "+" : ""}${w.fundReturn}%` : "—"}`);
    lines.push(`  עודף על בנצ'מרק: ${w.excessReturn != null ? `${w.excessReturn > 0 ? "+" : ""}${w.excessReturn}%` : "—"}`);
    lines.push(`  Information Ratio: ${w.ir != null ? w.ir.toFixed(2) : "—"}`);
    if (w.aboveBmCount != null && w.aboveBmTotal != null) {
      lines.push(`  חודשים מעל בנצ'מרק: ${w.aboveBmCount}/${w.aboveBmTotal}`);
    }
    if (w.mdd != null) lines.push(`  ירידה מקסימלית: ${w.mdd}%`);
    if (w.upCapture != null)   lines.push(`  Up Capture: ${w.upCapture}%`);
    if (w.downCapture != null) lines.push(`  Down Capture: ${w.downCapture}%`);
    if (w.rankInCategory != null && w.totalInCategory != null) {
      lines.push(`  דירוג בקטגוריה: ${w.rankInCategory}/${w.totalInCategory + 1}`);
    }
    lines.push(``);
  }

  lines.push(`כתוב תובנה עובדתית כ-JSON תקין בלבד.`);
  return lines.join("\n");
}

export function buildCompareUserMessage(input: CompareAIInput): string {
  const lines: string[] = [
    `השוואה | קטגוריה: ${input.categoryName}`,
    `בנצ'מרק: ${input.benchmarkDescription}`,
    `חלון ניתוח: ${input.windowMonths} חודשים (${input.startMonthLabel} – ${input.endMonthLabel})`,
    ``,
  ];

  for (const f of input.funds) {
    lines.push(`── ${f.name} ──`);
    lines.push(`  Information Ratio: ${irStr(f.ir)}`);
    if (f.score != null && f.wins != null && f.total != null) {
      lines.push(`  חודשים מעל בנצ'מרק: ${f.wins} מתוך ${f.total} (${f.score.toFixed(1)}%)`);
    }
    if (f.avgGapPct != null) {
      lines.push(`  ממוצע פער חודשי: ${pctStr(f.avgGapPct)}`);
    }
    if (f.scoreVsCategory != null) {
      lines.push(`  חודשים מעל ממוצע קטגוריה: ${f.scoreVsCategory.toFixed(1)}%`);
    }
    if (f.worstMonth) {
      const w = f.worstMonth;
      lines.push(`  החודש הקשה: ${w.monthLabel} — קרן: ${pctStr(w.fundReturnPct)}, בנצ'מרק: ${pctStr(w.bmReturnPct)}, פער: ${pctStr(w.gapPct)}`);
      if (w.catAvgPct != null) {
        lines.push(`    ממוצע קטגוריה: ${pctStr(w.catAvgPct)}`);
      }
      if (w.cohortRank != null) {
        lines.push(`    דירוג בחודש הזה: ${w.cohortRank}/${w.cohortTotal}`);
      }
    }
    lines.push(``);
  }

  if (input.categoryTotal != null) {
    lines.push(`הקשר קטגוריה (${input.categoryTotal} קרנות עם IR):`);
    lines.push(`  ממוצע IR קטגוריה: ${irStr(input.categoryAvgIR)}`);
    lines.push(``);
  }

  lines.push(`כתוב ניתוח השוואתי כ-JSON תקין בלבד.`);
  return lines.join("\n");
}
