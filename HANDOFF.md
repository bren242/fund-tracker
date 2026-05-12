# HANDOFF.md — סשן 12/05/2026 — Session 3ב.9: Claude model update + centralized config

## מה הושלם היום — Session 3ב.9 ✅

**קבצים:** `lib/anthropic-config.ts` (חדש), `app/api/parse/route.ts`, `app/api/parse/bulk/route.ts`, `app/api/fund-report/route.ts`, `app/api/consistency-ai/route.ts`, `app/api/consistency-compare-ai/route.ts`, `lib/consistency-v2/ai-caller.ts`
**Commit:** `f623314`, merge `8dbacbb`

**הבעיה:** `/api/parse?action=parse-file` החזיר "AI service error (400)". Root cause: `model: "claude-sonnet-4-5"` deprecated ב-6 קבצים נפרדים. אנתרופיק דחה כל קריאה עם 400, שנעטפה ל-502 ל-UI.

**הפתרון:**
1. **`lib/anthropic-config.ts`** — קובץ config מרכזי: `ANTHROPIC_API_URL`, `ANTHROPIC_API_VERSION`, `CLAUDE_MODELS.SONNET/OPUS/HAIKU`. עדכון עתידי = שינוי string אחד.
2. **6 קבצים** — החלפת hard-coded model strings + URL + version לייבוא מ-config.
3. **Error UX** — parse-file error response מנסה לחלץ את `error.message` מתוך גוף ה-400 של אנתרופיק → הודעה ברורה יותר ל-UI.

**Audit ✓:**
- `grep claude-sonnet-4-5` → 0 התאמות ✅
- `grep claude-sonnet-4-20250514` → 0 התאמות ✅
- `npm test` → 114/114 ✅
- `tsc --noEmit` → clean ✅

---

## מה הושלם היום — Session 3ב.8 ✅

**קבצים:** `lib/useFilters.ts`, `app/charts/page.tsx`, `__tests__/useFilters.test.ts`
**Commit:** `3c428c1`, merge `1fff465`

**הבעיה:** Group dropdown לא עבד ב-/charts. `onChange` קרא לשני `setFilter` סינכרוניים — שניהם קראו אותו snapshot ישן של `searchParams`. הקריאה השנייה דרסה את הראשונה, ו-group לא נשמר.

**הפתרון:**
1. **`buildFilterParams()`** — pure helper function מיוצאת: מקבלת URLSearchParams + updates, מחזירה URLSearchParams חדשה. ניתן לטסט בלי React/Next.js.
2. **`setFilters()`** — batch API חדשה ב-`useFilters`: עדכון מספר keys בקריאה אחת ל-`router.replace`. מונעת snapshot bug.
3. **Group onChange ב-charts:** `{ setFilter("group"..); setFilter("category"..); }` → `setFilters({ group: ..., category: ALL })`.

**Tests:** 7 tests חדשים ב-`__tests__/useFilters.test.ts` — סה"כ 114/114.

**Audit ✓:**
- default: 23 קרנות ✅
- group=קרנות גידור ישראל: 16 קרנות, 3 category options ✅
- group+cls=לונג מניות: 2 קרנות (רק מהקבוצה) ✅
- clear → 23 קרנות ✅

---

## סשן 3ב — הושלם סופית ✅

| Session | נושא | Commit |
|---------|------|--------|
| 3ב.1 | Completeness filter + semantic quadrants | `b482a42` |
| 3ב.2 | Controls Row 2 always visible | `eb99e62` |
| 3ב.5 | Watermark philosophy | `e07e8d5` |
| 3ב.6 | Senior polish — 5 composition issues | `cb77fa8` |
| 3ב.7 | X-axis label fits inside container | `8a8d2db` |
| 3ב.8 | useFilters snapshot bug — group filter | `3c428c1` |
| 3ב.9 | Claude model sonnet-4-6 + centralized config | `f623314` |

---

## מה פתוח לסשן 3ג — /compare + /consistency/v2

**קבצים:** `app/compare/page.tsx`, `app/consistency/v2/...`
**מה נדרש:**
- הוסף sub-tabs row (דירוג/השוואה/גרף/עקביות) עם הרלוונטי active
- עדכן controls wrapper ל-`top:52`
- עדכן thead / sticky elements
- בדוק print layouts לא נשברו

---

## מה פתוח לסשן 4

**קבצים:** `/indications`, `/fund-status` — top:52 + סטנדרט pill אחיד

## מה פתוח לסשן 5 (polish)

Hover states, animations, spacing, mobile breakpoints (low priority)

---

## Design Review — /consistency/v2 (4 בעיות פתוחות)

1. בורר תקופה לא מובן
2. 12M מחזיר "אין נתונים"
3. Checkbox ב-leaderboard בלי context
4. תאריך משתנה במעבר ל-compare

---

## מצב Git ומבחנים

| | |
|---|---|
| **tests** | 114/114 ✅ |
| **branch main** | `1fff465` |
| **Vercel** | auto-deploy on push to main |

*Generated: 2026-05-12 | Session 3ב.8*
