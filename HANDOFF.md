# HANDOFF.md — סשן 10/05/2026 לילה

## מה הושלם היום

### 1. Credit-Exhausted UX ✅
- `lib/credit-error.ts` — `isCreditExhaustedError(status, body)`, `CREDIT_EXHAUSTED_SENTINEL`, `creditExhaustedBody()`
- זיהוי HTTP 402 + body keywords ("credit balance" / "billing") — לא 502 גנרי
- `__tests__/parse-credit.test.ts` — 3 describe blocks, 7 tests
- הועבר ל-`app/api/parse/route.ts`

### 2. Diagnose Duplicates Script ✅
- `scripts/diagnose-duplicates.ts` — script לאבחון כפילויות בKV (ללא כתיבה)
- מנרמל שמות (Levenshtein ≤3), מוציא checklist ידני
- מחפש `.env.production.local` מ-cwd עד 6 levels למעלה (תואם worktrees)

### 3. avgAnnualReturn ×100 Fix ✅
- בעיה: שדה נשמר כ-fraction (0.05) אבל הוצג ×100 ← הוצג כ-5% תמיד במקום 500%
- תוקן ב-`app/api/funds/route.ts` → שמירה כ-fraction, display ×100 נכון

### 4+5. UI Unification — AppHeader + /analysis + /admin ✅
**AppHeader redesign (components/AppHeader.tsx):**
- 52px, sticky, background:#ffffff, logo + tabs (קרנות/ניתוח/כלים) + gear + print

**/analysis (app/analysis/page.tsx) — 7 איטרציות sticky:**
- שורה 1 (44px): sub-tabs עם feature locking (ימין) + sort/NOX year-select (שמאל)
- שורה 2 (40px): groups+categories (ימין) + currency (שמאל)
- thead `top:136` סטטי (52+44+40) — ללא ResizeObserver
- כל קוד אבחוני הוסר

**/admin (app/admin/page.tsx):**
- הוסר header ישן, הוחלף ב-pill bar sticky top:52
- כפתור "שמירה ופרסום" בתוך ה-pill bar

### 6. NOX Sub-tab Locking ✅ (ממרץ עם NOX worktree)
- `brand.features.comparison/chartPage/consistencyAnalysis === false` → pill נעול + 🔒
- NOX year multi-select (2020-2025 + YTD26) ב-row 1

---

## לקחים שנלמדו (מפורטים ב-LESSONS.md)
- backdropFilter שובר sticky background → תמיד background סולידי
- RTL flex + overflow-x חותך קצה שמאלי → 2 שורות נפרדות, לא דחיסה לאחת
- ResizeObserver unstable → גבהים קבועים + top סטטי עדיף תמיד
- overflow:clip (לא hidden) על table wrapper
- "לא לחפור פעמיים" — מדידה אמיתית לפני ניסיון שלישי

---

## מה פתוח לסשן 3

**קבצים:** `/charts`, `/compare`, `/consistency/v2`  
**מה נדרש:**
- הוסף sub-tabs row (דירוג/השוואה/גרף/עקביות) עם "גרף" / "השוואה" / "עקביות" active
- עדכן כל controls wrapper ל-`top:52`
- עדכן כל thead / sticky elements בהתאם
- בדוק print layouts לא נשברו

---

## מה פתוח לסשן 4

**קבצים:** `/indications`, `/fund-status`  
**מה נדרש:**
- top:52 על כל controls
- סטנדרט pill אחיד

---

## מה פתוח לסשן 5 (polish)

- Hover states על כל הכפתורים
- Transition animations
- Spacing consistency בין דפים
- Mobile breakpoints (low priority)

---

## Design Review — /consistency/v2 (4 בעיות פתוחות)

1. **בורר תקופה לא מובן** — "תקופה" vs "חלון" — שינוי copy + tooltip
2. **12M מחזיר "אין נתונים"** — כי סף מינימום הוא 24M — להוריד ל-12M או להסביר למשתמש
3. **Checkbox ב-leaderboard** — בלי label / context — לשפר UX
4. **תאריך משתנה במעבר ל-compare** — race condition שתוקן (commit 4dbeb5f) אבל יש לאמת ב-prod

---

## מצב Git ומבחנים

| | |
|---|---|
| **tests** | 107/107 ✅ |
| **branch main** | `5c42ed7` merge: 2-row analysis controls |
| **worktree branch** | `claude/quirky-matsumoto-467e52` (rebased on main) |
| **Vercel** | auto-deploy on push to main |

---

*Generated: 2026-05-10 לילה | UI Unification Sessions 1+2*
