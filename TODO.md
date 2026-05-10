# Fund Tracker — TODO.md
> עדכון אחרון: 2026-05-09

## Pending Work

1. **84 vs 81 inconsistency** — 3 קרנות כפולות: Fund Access ASPM Apollo, ואר אקוויטי, קפלר קפיטל. בנוסף: בירור טיפול ב-`active=false` בספירות

2. **Navigation links audit** — `/fund-status → /indications` היה באג שתוקן. לבדוק את כל נתיבי הניווט ברחבי האפליקציה

4. **Stage B Phases 2-4** — הפיכת raw `fund.*` fields לשימוש ב-`lib/metrics.ts` / `lib/fundDerived.ts`:
   - Phase 2: Charts (`app/charts/page.tsx`)
   - Phase 3: Compare (`app/compare/page.tsx`)
   - Phase 4: Analysis, Aggregate, BulkApply API, FundReport API
   - ~10h עבודה בסה"כ

5. **44 קרנות (Category D)** — עדיין ללא `monthlyReturns`. לפרסר היסטוריה מ-PDFs

6. **3 קרנות כפולות** — מיזוג או מחיקה (תלוי בפריט 1 לעיל)

7. **TRIO (fund-24)** — אין `monthlyReturns`. דרוש re-parse מ-PDF

8. **אידאה (fund-eq2-3)** — לאמת `y2019` ב-`monthlyReturns`. הפרסר אישר שה-PDF מראה 26.08% — האם נכנס נכון ל-KV?

9. **Push commit `3d5ff7a`** — פיצ'ר bulk-update עדיין local only, לא עלה ל-remote

10. **Dead code** — `components/FundCard.tsx` ו-`components/FundTable.tsx` לא מיובאים בשום מקום. למחוק

11. **[HIGH] שתי קרנות CLO ב-KV חסרות currency** —
    - `fund-1778317451353-3b9f` (עוגן קלאס A) — לקבוע ILS/USD
    - `fund-1778318344637-aa3r` (מור CLO) — לקבוע ILS/USD
    - תיקון נקודתי דרך `PATCH /api/funds?action=set-currency`
    - Fix 1 (create-fund) רלוונטי רק לקרנות חדשות מכאן והלאה

12. **[LOW] בדיקה ארכיטקטונית: מתי קטגוריה מקבלת BM?** —
    שקול להוסיף ל-`CATEGORY_BLEND` קריטריון מינימום (לדוגמה ≥5 קרנות).
    נדרש כשתתווסף קטגוריה חדשה כדי לקבוע אם היא מקבלת BM או לא.

13. **[MED] Error UX — 402 credit balance banner** — כשה-Claude API מחזיר 402 (credit balance exhausted), `app/api/parse/route.ts` צריך לתפוס את השגיאה ולהחזיר הודעה ברורה בממשק: "יתרת קרדיט Anthropic אזלה — יש לטעון יתרה ב-console.anthropic.com"

14. **[LOW] Health check endpoint** — `/api/health/anthropic` — פינג ל-Claude API עם prompt קצר, מחזיר `{ status: "ok"|"error", latencyMs, model }`. שימושי לאבחון כשהפרסר לא מגיב.
