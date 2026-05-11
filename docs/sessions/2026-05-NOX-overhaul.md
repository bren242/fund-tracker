# NOX Overhaul — מאי 2026

**תאריך:** 11/05/2026  
**Branch:** main  
**סטטוס:** הושלם, deployed, build ירוק, 107 טסטים עוברים

---

## מצב התחלתי — למה NOX לא עבד

NOX היה "לקוח" ברמה ארכיטקטורלית (client=nox), אבל בפועל:

- **דליפת UI:** כפתורי `עקביות`, `גרף`, `השוואה` הופיעו ב-NOX אף שהפיצ'רים לא קיימים
- **לוגו שגוי:** PageWrapper הציג לוגו GREEN גם ב-NOX
- **אדמין שבור:** MonthlyRow ניסה לקרוא מ-`fund.monthlyReturns` שלא קיים ל-NOX
- **עמודת עקביות ריקה:** הדירוג הציג עמודה עם `—` בכל שורה
- **favicon מהבהב:** GREEN favicon הופיע רגע לפני NOX favicon
- **ניסיון monthlyReturns2026** (נזרק): dictionary עם מפתחות `"01"-"12"` שיצר מורכבות מיותרת ולא תאם לתהליך העסקי

---

## ארכיטקטורת NOX סופית

### KV Schema — שדות NOX-ספציפיים

```json
{
  "returns": {
    "ytd2026": 0.042,
    "y2025": 0.087,
    "y2024": 0.063,
    ...
  },
  "noxMtdLog": {
    "2026-01": 0.018,
    "2026-02": -0.004,
    "2026-03": 0.031,
    "2026-04": 0.015
  },
  "lastMonth": "2026-04",
  "lastUpdatedAt": "2026-05-11T18:32:00.000Z"
}
```

| שדה | תפקיד |
|-----|--------|
| `returns.ytd2026` | **source of truth ל-YTD** — מתעדכן בכל שמירת MTD |
| `noxMtdLog` | היסטוריית MTD חודשי — לתצוגה באקורדיון ולפעולת UNDO |
| `lastMonth` | החודש האחרון שנשמר — לחישוב defaultMonth באדמין ולעמודת 'חודשי' |
| `lastUpdatedAt` | ISO timestamp של השמירה האחרונה |

### נוסחאות

**שמירת MTD:**
```
YTD_חדש = (1 + YTD_קיים) × (1 + MTD) - 1
```

**UNDO (ביטול החודש האחרון):**
```
YTD_משוחזר = ((1 + YTD_נוכחי) / (1 + MTD_אחרון)) - 1
```

### API Actions (app/api/funds/route.ts)

**`set-nox-mtd`** — PATCH, רק `client=nox`
```
input:  { fundId, month: "YYYY-MM", mtd: number }
effect: returns.ytd2026 ← compound, lastMonth ← month,
        noxMtdLog[month] ← mtd, lastUpdatedAt ← now
```

**`undo-nox-mtd`** — PATCH, רק `client=nox`
```
input:  { fundId }
effect: מוצא lastKey = max(keys(noxMtdLog)), מחשב ytd_restored,
        מוחק noxMtdLog[lastKey], lastMonth ← החודש הקודם או null
```

### Feature Flags ב-brand.json של NOX

```json
{
  "features": {
    "consistencyAnalysis": false,
    "chartPage": false,
    "comparison": false
  }
}
```

---

## קומיטים — כרונולוגי

| # | קומיט | תיאור |
|---|-------|--------|
| 1 | בידוד GREEN↔NOX | כפתור עקביות מגודר ב-FundTableV2; לוגו דינמי ב-PageWrapper; redirects ב-/consistency/v2 ו-/compare |
| 2 | נעילות + כפתורי שנים | מנעול על תת-טאבים; multi-select שנים 2020–2025 + YTD 2026; `calcNoxMultiReturn` |
| 3–4 | ניסיון monthlyReturns2026 | dictionary חודשי, קוביות אדמין — **נזרק בסשן 5** |
| 5 | `47ffa34` NOX Overhaul | מחיקת monthlyReturns2026 → noxMtdLog + lastMonth; API set-nox-mtd + undo-nox-mtd; UNDO button; AccordionPanel עם pills; עמודת 'חודשי' |
| 6 | `64a9286` post-save fix | ניקוי mtdInput + קידום dropdown לחודש הבא אחרי שמירה מוצלחת |
| 7 | `f7ad8a6` hide consistency column | ב-/nox/analysis, עמודת 'עקביות' מוסתרת לגמרי (4 עמודות); `showConsistency` מ-brand.features |
| 8 | `42a4e84` favicon fix | `generateMetadata()` async ב-app/layout.tsx; קורא `x-pathname` header מה-middleware; favicon נכון מהתגובה הראשונה |

---

## קבצים מרכזיים — מה השתנה

### קבצים עם לוגיקת NOX ייחודית

| קובץ | שינוי |
|------|-------|
| `lib/types.ts` | הוסף `Fund.noxMtdLog`, `Fund.lastMonth` |
| `lib/fundDerived.ts` | `getLastUpdated` נופל ל-`fund.lastMonth` לפני `fund.lastUpdated` |
| `app/api/funds/route.ts` | הוסף `set-nox-mtd`, `undo-nox-mtd` (מוגנים `clientKey !== "nox"`) |
| `app/admin/page.tsx` | `MonthlyRow` — `isNoxClient` branch: defaultMonth מ-lastMonth, mtdInput מ-noxMtdLog, computed live YTD preview, UNDO button |
| `app/analysis/page.tsx` | נעילת תת-טאבים; `showConsistency`; `FundRow` עם 4/5 עמודות דינמי |
| `components/FundTableV2.tsx` | `calcNoxMultiReturn`; `AccordionPanel` עם noxMtdLog pills; `derivedMonthly` מ-noxMtdLog[lastMonth] |
| `app/layout.tsx` | `generateMetadata()` — favicon ותיאור לפי NOX/GREEN |
| `components/AppHeader.tsx` | הוסר useEffect של favicon (מטופל server-side) |

### קבצים עם מנגנון feature-flag

| קובץ | מנגנון |
|------|--------|
| `app/consistency/v2/page.tsx` | redirect אם `consistencyAnalysis === false` |
| `app/consistency/v2/compare/page.tsx` | redirect אם `consistencyAnalysis === false` |
| `app/consistency/v2/components/PageWrapper.tsx` | לוגו דינמי לפי clientKey |

---

## מה **אין** ב-NOX (מושבת במכוון)

- `monthlyReturns` — dictionary ההיסטוריה השלם (GREEN-only)
- `/charts` — דף הגרפים
- `/compare` — השוואת קרנות
- `/consistency/v2` — דף ניתוח עקביות
- עמודת 'עקביות' בדירוג
- AI parser ו-upload
- Benchmarks
- טבלת Sharpe/StdDev מחושבת מ-monthlyReturns (אין לו; הערכים מגיעים ישירות מ-KV)

## מה **משותף** עם GREEN

- אותה ארכיטקטורת App Router + KV + middleware rewrite
- אותה מערכת brand config
- אותו AppHeader, ThemeProvider, FundTableV2 (עם מסלולי isNox)
- אותו אדמין — MonthlyRow עם סעיף isNoxClient
- אותו מבנה `Fund` בטיפוס (שדות NOX הם optional)

---

## נקודות המשך לסשן הבא

1. **פרינט NOX** — עמודת 'חודשי' בפרינט עדיין מציגה ערך ישן (לא מ-noxMtdLog). דורש בדיקה של קומפוננטות הפרינט ב-`app/[client]/page.tsx`.
2. **validations** — אין בדיקה שמשתמש לא מזין את אותו חודש פעמיים (noxMtdLog יכתב כפול). שיקול: לחסום ב-handleSave אם `fund.noxMtdLog?.[selectedMonth]` כבר קיים.
3. **אימות תצוגה בפרודקשן** — כניסה ב-incognito ל-/nox לוודא favicon מיידי ללא פלאש.

---

## בדיקות סטטוס סיום

```
✓ npx tsc --noEmit — ללא שגיאות
✓ npm run build — עבר
✓ npm test — 107 טסטים ירוקים
✓ git push origin main — מסונכרן
```
