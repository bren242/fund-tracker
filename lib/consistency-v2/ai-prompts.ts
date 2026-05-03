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
אתה כותב פסקאות עבור דוח עקביות של קרן בודדת, עבור יועץ פיננסי שיציג את הדוח ללקוח.
הסגנון: עיתונות פיננסית עברית מקצועית — The Marker meets The Economist.

כללי כתיבה:
1. עברית בלבד. לא לערבב עם אנגלית בתוך אותה שורה.
2. מונחים טכניים ללא תרגום שגור (Information Ratio) — להשאיר באנגלית, ולהסביר בקצרה בפעם הראשונה שמופיעים. למשל: "ה-Information Ratio של הקרן (מדד שמשקלל תשואה עודפת ביחס לתנודתיות) עומד על X.XX".
3. ללא רשימות, ללא bullets. פסקאות שלמות, זורמות.
4. כל מספר שמוזכר בטקסט חייב להופיע בקלט. אסור להמציא מספרים.
5. לא להעצים. אם הקרן לא עקבית — להגיד את זה ישירות. אם IR שלילי — להזכיר ולהסביר משמעות. אסור להחביא ביצועים חלשים מאחורי ניסוחים מתוחכמים.
6. אם consistencyScore < 50 — verdict הוא "קרן לא עקבית" או "עקביות נמוכה". אסור להשתמש ב"מתונה" או "בינונית" לקרנות עם score נמוך.
7. בעברית פיננסית רהוטה, לא דיבורית. לא לכלול disclaimer — הוא מוצג בנפרד ב-footer.

ממפה verdict לפי הקלט:
- consistencyScore >= 75 ו-IR > 0.5 → "קרן עקבית מאוד"
- consistencyScore >= 60 ו-IR > 0 → "קרן עקבית"
- consistencyScore >= 45 או IR בין -0.2 ל-0 → "עקביות בינונית"
- אחרת → "קרן לא עקבית"

החזר JSON תקין בלבד, ללא הסברים לפני או אחרי. Schema:
{
  "verdictLabel": "קרן עקבית מאוד" | "קרן עקבית" | "עקביות בינונית" | "קרן לא עקבית",
  "storyParagraphs": ["פסקה ראשונה", "פסקה שנייה", "פסקה שלישית אופציונלית"],
  "worstMonthNarrative": "משפט אחד-שניים על החודש הקשה",
  "categoryContextNarrative": "משפט אחד-שניים על המיקום בקטגוריה"
}`;

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
  verdictLabel: "קרן עקבית מאוד" | "קרן עקבית" | "עקביות בינונית" | "קרן לא עקבית";
  storyParagraphs: string[];
  worstMonthNarrative: string;
  categoryContextNarrative: string;
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

export interface FundAIInput {
  fundName: string;
  categoryName: string;
  benchmarkDescription: string;
  windowMonths: number;
  startMonthLabel: string;
  endMonthLabel: string;
  ir: number | null;
  vsB: { score: number; wins: number; total: number; avgGap: number } | null;
  vsC: { score: number; wins: number; total: number } | null;
  worstMonth: {
    monthLabel: string;
    fundReturnPct: number;
    bmReturnPct: number;
    gapPct: number;
    catAvgPct: number | null;
  } | null;
  cohort: { rank: number; total: number; percentile: number } | null;
  categoryRank: number | null;
  categoryTotal: number | null;
  categoryAvgIR: number | null;
  maxDrawdownWindow: number | null;
  maxDrawdownLifetime: number | null;
  windowSize: number;
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
    `חלון ניתוח: ${input.windowMonths} חודשים (${input.startMonthLabel} – ${input.endMonthLabel})`,
    ``,
    `ביצועים נגד בנצ'מרק:`,
    `  Information Ratio: ${irStr(input.ir)}`,
  ];

  if (input.vsB) {
    lines.push(`  חודשים שעקפה בנצ'מרק: ${input.vsB.wins} מתוך ${input.vsB.total} (${input.vsB.score.toFixed(1)}%)`);
    lines.push(`  ממוצע פער חודשי (קרן פחות בנצ'מרק): ${pctStr(input.vsB.avgGap)}`);
  } else {
    lines.push(`  אין נתונים מספיקים לחישוב`);
  }

  lines.push(``);
  lines.push(`ביצועים נגד ממוצע קטגוריה:`);
  if (input.vsC) {
    lines.push(`  חודשים מעל ממוצע הקטגוריה: ${input.vsC.wins} מתוך ${input.vsC.total} (${input.vsC.score.toFixed(1)}%)`);
  } else {
    lines.push(`  אין נתונים מספיקים לחישוב`);
  }

  if (input.worstMonth) {
    const w = input.worstMonth;
    lines.push(``);
    lines.push(`החודש הקשה ביותר:`);
    lines.push(`  ${w.monthLabel} — קרן: ${pctStr(w.fundReturnPct)}, בנצ'מרק: ${pctStr(w.bmReturnPct)}, פער: ${pctStr(w.gapPct)}`);
    if (w.catAvgPct != null) {
      lines.push(`  ממוצע קטגוריה באותו חודש: ${pctStr(w.catAvgPct)}`);
    }
    if (input.cohort) {
      lines.push(`  דירוג הקרן בין חברות הקטגוריה בחודש זה: מקום ${input.cohort.rank} מתוך ${input.cohort.total} (אחוזון ${input.cohort.percentile})`);
    }
  }

  if (input.categoryTotal != null) {
    lines.push(``);
    lines.push(`הקשר קטגוריה (${input.categoryTotal} קרנות עם IR):`);
    lines.push(`  ממוצע IR קטגוריה: ${irStr(input.categoryAvgIR)}`);
    if (input.categoryRank != null) {
      lines.push(`  דירוג הקרן ב-IR בקטגוריה: מקום ${input.categoryRank} מתוך ${input.categoryTotal}`);
    }
  }

  if (input.maxDrawdownWindow != null || input.maxDrawdownLifetime != null) {
    lines.push(``);
    lines.push(`ירידה מקסימלית (Max Drawdown):`);
    if (input.maxDrawdownWindow != null) {
      lines.push(`  ${input.windowSize} חודשים: ${input.maxDrawdownWindow.toFixed(1)}%`);
    }
    if (input.maxDrawdownLifetime != null) {
      lines.push(`  כל ההיסטוריה: ${input.maxDrawdownLifetime.toFixed(1)}%`);
    }
  }

  lines.push(``, `כתוב ניתוח כ-JSON תקין בלבד.`);
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
