# Monthly Update Audit — Fund Tracker

## 1. הקשר עסקי

עדכון חודשי = רישום תשואת חודש מסוים לקרן ספציפית.
**חוק ברזל:** `--month` הוא חודש הנתונים, לא חודש ההרצה.

```
מצב אופייני: מתחילת מאי 2026 מעדכנים תשואת אפריל 2026
→ --month 2026-04   (חודש הדאטה)
→ lastReportDate יהיה "2026-04", לא "2026-05"
```

---

## 2. מפת שדות תאריך במערכת

### 2.1 שדות מקור האמת ב-KV (`funds:{client}`)

| שדה | רמה | פורמט | תפקיד |
|-----|-----|--------|--------|
| `data.lastUpdated` | FundsData גלובלי | `YYYY-MM-DD` | כותרת ראשית בכל הדוחות |
| `fund.lastReportDate` | קרן בודדת | `YYYY-MM` | חודש הדוח האחרון לתצוגה |
| `fund.lastUpdated` | קרן בודדת | `YYYY-MM` | עדכון מועדף ב-FundTableV2 + חישוב סטטוס |
| `fund.monthlyReturn` | קרן בודדת | `number` | תשואה חודשית scalar (תצוגה בטבלה) |
| `fund.monthlyReturns[YYYY-MM]` | קרן בודדת | `number` | היסטוריה חודשית (גרפים, עקביות) |
| `fund.returns.ytdYYYY / yYYYY` | קרן בודדת | `number` | YTD / שנה שלמה |

### 2.2 למה שני פורמטים ב-data.lastUpdated לעומת fund.lastUpdated?

- `data.lastUpdated` עובר דרך `formatDate()` שמייצרת תאריך מלא (לוקאלי)  
  → חייב להיות `YYYY-MM-DD` כדי ש-`new Date(...)` יעבוד
- `fund.lastUpdated` עובר דרך FundTableV2 עם regex `/^\d{4}-\d{2}$/`  
  → חייב להיות בדיוק `YYYY-MM`

---

## 3. מיפוי תצוגות — כל מקום שמציג תאריך עדכון

### 3.1 תאריך גלובלי (`data.lastUpdated`)

| קובץ | שורה | טקסט מוצג | הערה |
|------|------|-----------|------|
| `app/page.tsx` | 98 | `עדכון: {formatDate(data.lastUpdated)}` | כותרת משנה ראשית (כשאין custom subtitle) |
| `app/page.tsx` | 159 | prop ל-PrintReport | נשלח לרכיב הדפוס |
| `app/charts/page.tsx` | 281 | `עדכון: {formatDate(...)}` | כותרת גרפים (מסך) |
| `app/charts/page.tsx` | 301 | `עדכון: {formatDate(...)}` | כותרת גרפים (הדפסה) |
| `app/charts/page.tsx` | 399 | `מעודכן ל: {formatDate(...)}` | כותרת גרפים A4 (הדפסה) |
| `app/data-completion/page.tsx` | 211 | `עדכון: {formatDate(...)}` | עמוד data-completion |
| `app/admin/page.tsx` | 357 | `עדכון: {data.lastUpdated}` | ממשק ניהול — header |

### 3.2 תאריך דוח לקרן (`fund.lastReportDate`)

| קובץ | שורה | טקסט מוצג | הערה |
|------|------|-----------|------|
| `components/FundCard.tsx` | 306 | `עדכון {formatReportDate(...)}` | כרטיסיית קרן |
| `components/FundTable.tsx` | 183 | `{formatReportDate(...)}` | עמודת תאריך בטבלה הראשית |
| `components/FundTableV2.tsx` | 32 | fallback אחרי בדיקת `lastUpdated` | רק אם lastUpdated לא YYYY-MM |
| `components/PrintReport.tsx` | 100 | `{formatReportDate(...)}` | עמודת תאריך בדוח מודפס |
| `components/CompareTable.tsx` | 259 | מתחת לתשואה חודשית | בטבלת השוואה |
| `app/compare/page.tsx` | 224 | `מעודכן ל: {formatReportDate(...)}` | כרטיסיית השוואה |
| `app/fund-status/page.tsx` | 140 | `displayDate = rdk` | עמוד מצב קרנות |
| `app/admin/page.tsx` | 1222 | אזהרת "לא עודכנה X חודשים" | מחשב ≥3 חודשים |
| `app/consistency/page.tsx` | 778 | snaps endMonth picker | single-view עקביות |
| `app/consistency/compare/page.tsx` | 135 | snaps date picker ל-latestDate | compare עקביות |

### 3.3 תאריך עדכון לקרן (`fund.lastUpdated`)

| קובץ | שורה | תפקיד | עדיפות |
|------|------|--------|--------|
| `components/FundTableV2.tsx` | 27–31 | תא תאריך ב-FundTableV2 | ראשון (לפני lastReportDate) |
| `app/fund-status/page.tsx` | 46 | effectiveKey → ירוק/צהוב/אדום | חישוב סטטוס |
| `app/api/parse/route.ts` | 2299 | staleness guard | חוסם apply מהפרסר אם fund עודכן |

---

## 4. סיכון דריסה — הבנה קריטית

`PUT /api/funds` מחליף את **כל ה-FundsData**. לעולם אל תשתמש בו לעדכון חלקי.

`PATCH /api/funds?action=set-last-updated` — עדכון YYYY-MM בלבד, לא תשואות.

הדרך הבטוחה היחידה לעדכון תשואות ידני: **`scripts/update-monthly.ts`** שבנינו.

---

## 5. פורמט שדות — טבלת קוהרנטיות

| שדה | פורמט נכון | דוגמה | מה יישבר בפורמט שגוי |
|-----|-----------|-------|----------------------|
| `data.lastUpdated` | `YYYY-MM-DD` | `2026-04-01` | `formatDate()` תחזיר `"—"` |
| `fund.lastReportDate` | `YYYY-MM` | `2026-04` | consistency page: `split("-")` → NaN |
| `fund.lastUpdated` | `YYYY-MM` | `2026-04` | FundTableV2 regex לא ימצא, fallback ל-lastReportDate |
| `fund.monthlyReturns` key | `YYYY-MM` | `2026-04` | גרפים ו-consistency לא יראו את הנתון |

---

## 6. הרצת update-monthly.ts

### 6.1 רשימת מקומות במערכת שמציגים תאריך עדכון

ראה סעיף 3 לרשימה המלאה. בסך הכל **20 מקומות** מציגים תאריך עדכון:
- 7 תלויים ב-`data.lastUpdated` (גלובלי)
- 10 תלויים ב-`fund.lastReportDate` (קרן)
- 3 תלויים ב-`fund.lastUpdated` (קרן, עדיפות גבוהה)

הסקריפט מעדכן את **כולם** בהרצה אחת.

### 6.2 שדות שמתעדכנים בכל הרצה

| שדה | נתיב ב-KV | ערך לפני (דוגמה) | ערך אחרי (דוגמה) |
|-----|-----------|-----------------|-----------------|
| `fund.monthlyReturn` | `funds:green → cat → fund` | `0.0177` | `0.0120` |
| `fund.monthlyReturns["2026-04"]` | idem | לא קיים | `0.0120` |
| `fund.returns.ytd2026` | idem | `0.0177` | `0.0450` |
| `fund.lastReportDate` | idem | `"2026-02"` | `"2026-04"` |
| `fund.lastUpdated` | idem | `"2026-02"` | `"2026-04"` |
| `data.lastUpdated` | `funds:green` root | `"2026-02-28"` | `"2026-04-01"` |

**לא נגעים:** שאר הקרנות, benchmarks, parse-drafts, parse-log, token-usage, indications.

### 6.3 דוגמאות הרצה

**Dry-run (בדיקה בלי כתיבה):**
```bash
npx tsx scripts/update-monthly.ts \
  --client green \
  --fund fund-22 \
  --month 2026-04 \
  --value 0.012 \
  --ytd 0.045 \
  --dry-run
```

**הרצה רגילה:**
```bash
npx tsx scripts/update-monthly.ts \
  --client green \
  --fund fund-22 \
  --month 2026-04 \
  --value 0.012 \
  --ytd 0.045
```

**עם report-month מותאם (כשחודש הדוח שונה מחודש הנתונים):**
```bash
npx tsx scripts/update-monthly.ts \
  --client green \
  --fund fund-22 \
  --month 2026-04 \
  --value 0.012 \
  --ytd 0.045 \
  --report-month 04/2026
```

**Force — לחודש שכבר קיים:**
```bash
npx tsx scripts/update-monthly.ts \
  --client green \
  --fund fund-22 \
  --month 2026-04 \
  --value 0.013 \
  --ytd 0.046 \
  --force
```

### 6.4 Checklist אימות אחרי הרצה

```
[ ] דף ראשי (/green) — כותרת משנה מציגה תאריך חדש
[ ] מסך סטטוס (/green/fund-status) — קרן מסומנת ירוק
[ ] ממשק ניהול (/green/admin) — header מציג תאריך חדש
[ ] FundTableV2 — עמודת "עדכון" מציגה MM/YYYY נכון
[ ] Consistency single view — endMonth picker מוגדר לחודש הנכון
[ ] גרף חודשי — עמודת החודש החדש מופיעה
[ ] דוח מודפס (Ctrl+P) — עמודת תאריך נכונה
```

---

## 7. שחזור מ-Backup

אם משהו השתבש, הסקריפט שומר backup לפני כל כתיבה:

```
/tmp/kv-backup-funds-green-2026-05-04T10-30-00-000Z.json
```

שחזור ידני:
```bash
# 1. ראה את הנתיב בפלט הסקריפט
# 2. הרץ migrate-to-kv.ts עם הקובץ (ידנית)
# 3. או ב-Vercel Dashboard → Storage → KV → set key ידנית
```

---

## 8. הוספת שנה חדשה (2027 ואילך)

כשמתחילים שנה חדשה (e.g. 2027), יש לעדכן:

1. `lib/types.ts` — הוסף `ytd2027: number | null` ל-`returns` בטיפוס `Fund`
2. `lib/types.ts` — הוסף `ytd2027: number | null` ל-`returns` בטיפוס `Benchmark`
3. הסקריפט ייבחר אוטומטית `ytd2027` (שנה שוטפת) ← לא דורש שינוי
