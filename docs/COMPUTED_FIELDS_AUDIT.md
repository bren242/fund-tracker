# Computed Fields & Date Sync — Audit

> תאריך: 2026-05-04 | Read-only audit — אין שינוי קוד או נתונים.

---

## חלק 1 — סיווג שדות מודל קרן ב-KV

### 1.1 שדות `Fund` (lib/types.ts)

| שדה | סוג | נוסחת חישוב (אם derived) | הערה |
|-----|-----|--------------------------|------|
| `id` | metadata | — | מחולל פנימית |
| `name` | metadata | — | שם קרן לתצוגה |
| `classification` | metadata | — | סיווג חופשי |
| `startDate` | metadata | — | תאריך הקמה |
| `manager` | metadata | — | שם מנהל |
| `active` | metadata | — | הסתרה/הצגה |
| `currency` | metadata | — | ILS / USD |
| `monthlyDirection` | metadata | — | LTR / RTL (סדר עמודות) |
| `aumMillions` | **raw** | — | לא ניתן לחשב ממונחלי |
| `monthlyReturns` | **raw** | — | מקור האמת. כל חישוב צריך לבוא מכאן |
| `monthlyReturn` | **derived** ⚠️ | `monthlyReturns[latestMonth]` | duplicate scalar, מסונכרן ידנית |
| `returns.ytd2026` | **derived** ⚠️ | `Π(1+r) − 1` על חודשי 2026 | מסונכרן ידנית בכל עדכון |
| `returns.y2025` | **derived** ⚠️ | `Π(1+r) − 1` על 2025-01..12 | מסונכרן ידנית בעת apply |
| `returns.y2024` | **derived** ⚠️ | idem 2024 | |
| `returns.y2023` | **derived** ⚠️ | idem 2023 | |
| `returns.y2022` | **derived** ⚠️ | idem 2022 | |
| `returns.y2021` | **derived** ⚠️ | idem 2021 | |
| `returns.y2020` | **derived** ⚠️ | idem 2020 | |
| `returns.y2019` | **derived** ⚠️ | idem 2019 | |
| `avgAnnualReturn` | **derived** ⚠️ | `mean(returns.y*)` | מחושב ב-`applyRiskMetrics()` |
| `sharpe` | **derived** ⚠️ | `(mean(r)−rf) / stdDev(r) × √12` על `monthlyReturns` | rf=0.3%/חודש |
| `stdDev` | **derived** ⚠️ | `sampleStdDev(monthlyReturns)` | sample std (÷N-1) |
| `reportingDelay` | metadata | — | פלאג דיליי ידני |
| `lastReportDate` | metadata | — | חודש דאטה, YYYY-MM |
| `lastUpdated` | metadata | — | חודש עדכון, YYYY-MM |
| `lastUpdatedAt` | metadata | — | ISO timestamp של עדכון אחרון |

### 1.2 שדות `FundsData` (השכבה הגלובלית)

| שדה | סוג | הערה |
|-----|-----|------|
| `lastUpdated` | metadata | תאריך גלובלי, YYYY-MM-DD. מופיע בכותרות |
| `categories` | container | מכיל את כל הקרנות |
| `adminPassword` | metadata | סיסמת admin |
| `superAdminPassword` | metadata | סיסמת super |

### 1.3 סיכום הפרות עיקרון raw/derived

**7 שדות derived מאוחסנים ב-KV** ויכולים לפרוח מ-`monthlyReturns`:
`monthlyReturn`, `returns.*` (8 שדות), `avgAnnualReturn`, `sharpe`, `stdDev`.

ניתוח סיכון סטלה:
- **`returns.ytd2026`** — קריטי. מוצג בכל טבלה. מסונכרן ידנית בכל עדכון חודשי.
- **`sharpe` / `stdDev`** — גבוה. הפרסר מחשב ב-`applyRiskMetrics()` ומאחסן. עדכון ידני (scripts/update-monthly.ts) **לא מחשב מחדש**.
- **`avgAnnualReturn`** — בינוני. מחושב ב-`applyRiskMetrics()` מ-`returns.y*` (לא מ-`monthlyReturns`).
- **`monthlyReturn`** (scalar) — נמוך. תמיד מסונכרן יחד עם `monthlyReturns[month]`.

---

## חלק 2 — קריאת שדות derived בקוד

### 2.1 `fund.sharpe`

| קובץ | שורה | שימוש | מקור |
|------|------|--------|------|
| `components/FundCard.tsx` | 345 | תצוגה "שארפ" בכרטיסיית קרן | KV |
| `components/CompareTable.tsx` | 133 | שורת "שארפ" בטבלת השוואה (V1) | KV |
| `components/PrintReport.tsx` | 106 | עמודת שארפ בדוח מודפס | KV |
| `components/CompareSummary.tsx` | 30 | שורת "שארפ" ב-compare summary | KV |
| `app/admin/page.tsx` | 1832 | form editing בניהול קרן | KV |
| `app/api/parse/route.ts` | 285 | כתיבת ערך מחושב לאחר apply | → KV |
| `app/analysis/_Backup/page_1.tsx` | 188 | מיון לפי שארפ (דף ניתוח גנוז) | KV |

**אין** קומפוננטה שמחשבת sharpe on-the-fly מ-`monthlyReturns` לצורך תצוגה. הכל קורא מ-KV.

**חריגה:** `components/CompareTable.tsx:42-55` — `computeBmStats()` מחשב sharpe לבנצ'מרקים on-the-fly מ-`returns.y*` השנתיים. אבל לקרנות קורא מ-KV.

### 2.2 `fund.stdDev`

| קובץ | שורה | שימוש | מקור |
|------|------|--------|------|
| `components/CompareTable.tsx` | 134 | שורת "סטיית תקן" | KV |
| `components/PrintReport.tsx` | 107 | עמודת סטד בדוח | KV |
| `components/CompareSummary.tsx` | 31 | שורת "סטיית תקן" | KV |
| `app/admin/page.tsx` | 1833 | form editing | KV |
| `app/api/parse/route.ts` | 288 | כתיבה לאחר apply | → KV |

### 2.3 `fund.avgAnnualReturn`

| קובץ | שורה | שימוש | מקור |
|------|------|--------|------|
| `components/FundCard.tsx` | 325 | "ממוצע שנתי" בכרטיסיית קרן | KV |
| `components/CompareTable.tsx` | 132 | שורת "ממוצע שנתי" | KV |
| `components/PrintReport.tsx` | 105 | עמודת ממוצע שנתי | KV |
| `components/CompareSummary.tsx` | 29 | שורת "ממוצע שנתי" | KV |
| `app/admin/page.tsx` | 1831 | form editing | KV |
| `app/api/parse/route.ts` | 303 | כתיבה לאחר apply | → KV |

### 2.4 `fund.returns.ytd2026` / `fund.returns.y*`

| קובץ | שורה | שימוש | מקור |
|------|------|--------|------|
| `app/admin/page.tsx` | 663, 764, 770-774 | עדכון inline + תצוגה בטבלת עדכון חודשי | KV |
| `app/admin/page.tsx` | 1823-1830 | form editing | KV |
| `components/FundTableV2.tsx` | (period column) | תשואה לתקופה נבחרת | KV |
| `components/CompareTable.tsx` | 125-131 | שורות שנתיות | KV |
| `components/PrintReport.tsx` | 102-104 | עמודות שנתיות | KV |
| `components/CompareSummary.tsx` | 21-28 | שורות שנתיות | KV |
| `app/api/parse/route.ts` | (apply action) | כתיבה אחרי apply | → KV |

### 2.5 `fund.monthlyReturn` (scalar)

| קובץ | שורה | שימוש |
|------|------|--------|
| `components/FundTable.tsx` | (monthly col) | עמודת "תשואה חודשית" |
| `components/PrintReport.tsx` | 101 | עמודת חודשי בדוח |
| `components/CompareTable.tsx` | 132 | שורת "תשואה חודשית" |
| `app/admin/page.tsx` | 662, 750 | עדכון inline + תצוגה |

---

## חלק 3 — חישוב on-the-fly: מה קיים, מה חסר

### 3.1 פונקציות קיימות ב-`lib/consistency.ts`

| מטריקה | פונקציה | שורה | קלט |
|---------|---------|------|-----|
| עקביות vs בנצ'מרק (score, wins, IR, avgGap) | `calcConsistencyVsBenchmark()` | 194 | `monthlyReturns` |
| עקביות vs קטגוריה | `calcConsistencyVsCategory()` | 212 | `monthlyReturns` |
| ממוצע קטגוריה לחודש | `calcCategoryAverage()` | 228 | `monthlyReturns` |
| בניית מפת ממוצע קטגוריה | `buildCategoryAvgReturns()` | 242 | `monthlyReturns` |
| MaxDrawdown (עם peak, trough, recovery) | `computeMaxDrawdown()` | 675 | `monthlyReturns[]` |
| מטריקות חלון (IR, up/down capture, rank) | `computeWindowMetrics()` | 811 | `monthlyReturns` |
| כל 5 חלונות (YTD/12M/24M/36M/lifetime) | `computeAllWindows()` | 919 | `monthlyReturns` |
| חלון קצוות דינמי | `getWindowEndMonth()` | 580 | `monthlyReturns` |
| מיקום קרן בקטגוריה לחודש | `computeSameMonthCohortPosition()` | 527 | `monthlyReturns` |
| blend בנצ'מרקים | `blendBenchmarkReturns()` | 101 | `benchmarks.monthlyReturns` |

### 3.2 פונקציות חסרות (לצורך מיגרציה לחישוב on-the-fly)

| מטריקה | פונקציה קיימת? | פער |
|---------|---------------|-----|
| YTD (geometric compounding) | ✅ `wGeoReturn()` — private ב-consistency.ts | לא exported. נדרש export ל-lib/returns.ts |
| תשואה שנתית (y2025, y2024...) | ✅ logic קיים ב-consistency.ts | לא exposed כ-helper |
| stdDev חודשית (sample) | ✅ `wSampleStd()` — private | לא exported |
| Sharpe (annualized) | ✅ חישוב קיים ב-parse/route.ts `calculateRiskMetrics()` | לא ב-lib, רק ב-route |
| avgAnnualReturn | ❌ אין helper מוקדש | קיים inline ב-`applyRiskMetrics()` |
| MaxDrawdown | ✅ `computeMaxDrawdown()` — exported | מלא |
| IR (annualized) | ✅ ב-`computeWindowMetrics()` | רק בתוך computeWindowMetrics |

**פער עיקרי:** אין `lib/returns.ts` (או שם דומה) שמרכז חישובי תשואה בסיסיים (YTD, שנתי, stdDev, sharpe) כ-exported helpers. הלוגיקה מפוצלת בין `parse/route.ts` ו-`consistency.ts`.

---

## חלק 4 — מיפוי תאריכי עדכון בכל המערכת

### 4.1 טבלה מלאה

| מסך / קומפוננטה | קובץ:שורה | שדה נקרא | פורמט מצופה | מה מוצג |
|----------------|-----------|----------|-------------|---------|
| **כותרת דף ראשי** | `app/page.tsx:98` | `data.lastUpdated` | YYYY-MM-DD | `עדכון: {formatDate(...)}` → תאריך לוקאלי |
| **PrintReport prop** | `app/page.tsx:159` | `data.lastUpdated` | YYYY-MM-DD | מועבר ל-PrintReport |
| **גרפים — header מסך** | `app/charts/page.tsx:281` | `data.lastUpdated` | YYYY-MM-DD | `עדכון: {formatDate(...)}` |
| **גרפים — header print** | `app/charts/page.tsx:301` | `data.lastUpdated` | YYYY-MM-DD | `עדכון: {formatDate(...)}` |
| **גרפים — footer print A4** | `app/charts/page.tsx:399` | `data.lastUpdated` | YYYY-MM-DD | `מעודכן ל: {formatDate(...)}` |
| **Data-completion subtitle** | `app/data-completion/page.tsx:211` | `data.lastUpdated` | YYYY-MM-DD | `עדכון: {formatDate(...)}` |
| **Admin header** | `app/admin/page.tsx:357` | `data.lastUpdated` | כל פורמט | מוצג as-is (בלי formatDate!) |
| **כרטיסיית קרן (FundCard)** | `components/FundCard.tsx:306` | `fund.lastReportDate` | כל פורמט | `עדכון {formatReportDate(...)}` → MM/YYYY |
| **טבלת קרנות (FundTable)** | `components/FundTable.tsx:183` | `fund.lastReportDate` | כל פורמט | `formatReportDate(...)` → MM/YYYY |
| **FundTableV2 — עמודת עדכון** | `components/FundTableV2.tsx:27-32` | `fund.lastUpdated` (primary) / `fund.lastReportDate` (fallback) | YYYY-MM (primary) | MM/YYYY. אם lastUpdated לא YYYY-MM → fallback |
| **PrintReport — עמודת תאריך** | `components/PrintReport.tsx:100` | `fund.lastReportDate` | כל פורמט | `formatReportDate(...)` → MM/YYYY |
| **CompareTable — מתחת לתשואה חודשית** | `components/CompareTable.tsx:259` | `fund.lastReportDate` | כל פורמט | `formatReportDate(...)` → MM/YYYY |
| **Compare card** | `app/compare/page.tsx:224` | `fund.lastReportDate` | כל פורמט | `מעודכן ל: {formatReportDate(...)}` |
| **מסך סטטוס — "עדכון אחרון"** | `app/fund-status/page.tsx:140` | `fund.lastReportDate` | כל פורמט | `fmtKey(...)` → MM/YYYY |
| **מסך סטטוס — "חודש אחרון"** | `app/fund-status/page.tsx:148` | `fund.monthlyReturns` (getLatestKey) | YYYY-MM | `fmtKey(...)` → MM/YYYY |
| **מסך סטטוס — חישוב ירוק/צהוב/אדום** | `app/fund-status/page.tsx:46` | `fund.lastUpdated` ?? `getLatestKey` | כל פורמט (slice 0-7) | לוגיקה בלבד, לא תצוגה |
| **Admin — אזהרת +3 חודשים** | `app/admin/page.tsx:1218` | `fund.lastReportDate` | YYYY-MM (+ "-01") | ⚠️ X חודשים ללא עדכון |
| **Admin — עמודת "חודש עדכון" בשורה** | `app/admin/page.tsx:671-675` | `fund.lastUpdated` | YYYY-MM | date picker month input |
| **Consistency single view — snap endMonth** | `app/consistency/page.tsx:778` | `fund.lastReportDate` | YYYY-MM (split "-") | setter לחלון זמן |
| **Consistency compare — snap latestDate** | `app/consistency/compare/page.tsx:135` | `fund.lastReportDate` | YYYY-MM (>) | setter לחלון זמן |
| **API: staleness guard (פרסר)** | `app/api/parse/route.ts:2299` | `fund.lastUpdated` | ISO timestamp (string compare) | חוסם apply אם fund עודכן |
| **API indications — stamp** | `app/api/indications/route.ts:46,57` | כותב `fund.lastUpdated` + `data.lastUpdated` | YYYY-MM / YYYY-MM-DD | — |

### 4.2 טבלת אי-עקביות (inconsistencies)

| תפקיד | מקומות שקוראים שדה A | מקומות שקוראים שדה B | בעיה |
|--------|---------------------|---------------------|------|
| **"מתי הקרן עודכנה לאחרונה" — הלוגיקה** | `fund-status:46` קורא `fund.lastUpdated` לסטטוס | `fund-status:140` מציג `fund.lastReportDate` לתצוגה | שני שדות שונים לאותו מושג. ירוק/אדום מבוסס lastUpdated, טקסט המוצג מבוסס lastReportDate |
| **"עדכון אחרון" — גרסה FundTableV2** | `FundTableV2:27` קורא `fund.lastUpdated` (YYYY-MM) ראשון | `FundTableV2:32` fallback ל-`lastReportDate` | שני מקורות לאותה עמודה. אחרי parser: ISO timestamp → fallback. אחרי scripts/update-monthly.ts: YYYY-MM → primary |
| **`fund.lastUpdated` — פורמט לא אחיד** | Parser כותב ISO (`2026-04-10T17:12:39.684Z`) | indications/update-monthly כותבים YYYY-MM (`2026-04`) | FundTableV2 regex מסנן ISO, staleness guard מתבסס על string-compare שנשבר עם YYYY-MM |
| **`data.lastUpdated` — ערך לאחר עדכון** | indications כותב `${monthKey}-01` (YYYY-MM-DD) | parser כותב `new Date(${reportMonth}-01).toISOString()` (ISO full) | שני פורמטים, שניהם עוברים `formatDate()` אבל admin header מציג as-is |
| **sharpe/stdDev — benchmarks vs funds** | CompareTable.tsx מחשב sharpe/stdDev לבנצ'מרקים on-the-fly | CompareTable.tsx קורא sharpe/stdDev לקרנות מ-KV | אי-עקביות methodологית: benchmark=on-the-fly, fund=stored |
| **אזהרת 3 חודשים ב-admin** | `admin:1218` מנסה `new Date(fund.lastReportDate + "-01")` | אם lastReportDate הוא "04/2026" (MM/YYYY מהפרסר): `new Date("04/2026-01")` → Invalid Date → אזהרה לא תופיע | parser שוכח לסנכרן עם הפורמט שadmin מצפה |

---

## חלק 5 — UX מומלץ למסך עדכון חודשי

### 5.1 מבנה שורה ב-admin tab "עדכון חודשי"

```
מימין ← שמאל (RTL):

┌──────────────────┬──────────┬──────────┬─────────────────┬──────────────────────┬─────────────┬──────────┐
│  שם קרן          │ 2024     │ 2025     │ תשואה חודשית    │ YTD מחושב            │ חודש עדכון  │ שמור     │
│  (read-only)     │ read-only│ read-only│ [INPUT %]        │ [READ-ONLY, צבעוני]  │ [DATE PICK] │ [BUTTON] │
└──────────────────┴──────────┴──────────┴─────────────────┴──────────────────────┴─────────────┴──────────┘
```

### 5.2 כללי ה-YTD המחושב

**חישוב:**
```
YTD_preview = Π(1 + r_k) − 1
לכל r_k ∈ monthlyReturns שנה שוטפת + הערך החדש (לא שמור עדיין)
```

**תצוגה:**
- ❶ אם YTD_preview ≠ YTD_stored (קיים) בפרש >0.5% → צהוב + tooltip: "שונה מהמאוחסן (X%)"
- ❷ Tooltip: "מחושב מ-N חודשים: ינואר, פברואר, ..."
- ❸ עדכון בזמן אמת תוך 100ms מהקלדה

**חישוב אופציונלי (preview בלבד, לא נשמר):**
- stdDev מעודכנת (sample, מכל monthlyReturns + הנוכחי)
- Sharpe מעודכן (annualized, rf=0.3%/חודש)

### 5.3 שמירה — patch אטומי

```
שדות הנכתבים ב-KV בשמירה:
  fund.monthlyReturn = value
  fund.monthlyReturns[YYYY-MM] = value
  fund.lastReportDate = YYYY-MM    ← חודש הדאטה
  fund.lastUpdated = YYYY-MM       ← חודש הדאטה
  data.lastUpdated = YYYY-MM-01    ← גלובלי

שדות שלא נכתבים (derived — נחשבים on-the-fly):
  fund.returns.ytd2026             ← מחושב ב-UI בלבד (אם מחליטים להסיר מ-KV)
  fund.sharpe                      ← אם מחליטים להסיר
  fund.stdDev                      ← אם מחליטים להסיר
  fund.avgAnnualReturn             ← אם מחליטים להסיר
```

**הערה חשובה:** אם `returns.ytd2026` נשמר ב-KV (כפי שהוא כיום), הוא גם חייב להתעדכן בשמירה. אחרת נוצרת חוסר-עקביות. ראה חלק 7 לגבי ההחלטה.

---

## חלק 6 — סדר רפקטור מוצע

### שלב א — Low risk, High value: תיקון פורמט `fund.lastUpdated`

**מה:** אחד פורמט הכתיבה של `fund.lastUpdated` ל-YYYY-MM בכל מקרה (parser + indications + update-monthly).

**קבצים מושפעים:**
- `app/api/parse/route.ts:2464` — שינוי `new Date().toISOString()` → YYYY-MM
- `app/api/indications/route.ts:46` — כבר YYYY-MM ✓

**סיכון:** הסטלאנס גארד ב-`parse/route.ts:2299` מניח ISO vs ISO. לאחר שינוי: YYYY-MM vs ISO — הגארד יכשל (never trigger). אפשרות: לשנות גם את הגארד ל-`fundLastUpdated.slice(0,7) > diffComputedAt.slice(0,7)`.

**בדיקה:** FundTableV2 מציג YYYY-MM בפרמט MM/YYYY לכל הקרנות, כולל מעודכנות-על-ידי-פרסר.

---

### שלב ב — Medium risk: הוצאת helpers ל-`lib/returns.ts`

**מה:** צור `lib/returns.ts` עם:
```ts
export function computeYTD(monthlyReturns, year): number | null
export function computeAnnualReturn(monthlyReturns, year): number | null
export function computeStdDev(monthlyReturns): number | null
export function computeSharpe(monthlyReturns, rf?): number | null
export function computeAvgAnnualReturn(returns): number | null
```

**קבצים מושפעים:**
- `app/api/parse/route.ts` — קורא ל-helpers במקום duplicate logic
- ממשק עדכון חודשי חדש — משתמש ב-helpers ל-preview

**סיכון:** נמוך — לא משנה behavior, רק מחלץ לוגיקה.

**בדיקה:** `tsc --noEmit`. אין UI change.

---

### שלב ג — High value, Medium risk: עדכון חודשי on-the-fly ב-admin UI

**מה:** טאב "עדכון חודשי" מחשב YTD on-the-fly ומציג preview לפני שמירה.

**קבצים מושפעים:**
- `app/admin/page.tsx` — לוגיקת YTD preview בעת הקלדה
- `app/api/funds/route.ts` — הוספת endpoint PATCH לעדכון שדה חודשי אטומי (ללא full-replace)

**סיכון:** בינוני — צריך לוודא שה-PATCH החדש לא נפגש עם `PUT` גלובלי.

**בדיקה:** dry-run + UI ב-admin.

---

### שלב ד — Longer term: החלטה על derived fields ב-KV

תלוי בהחלטות מחלק 7. שינוי ל-fully derived (לא שמור ב-KV) הוא הרפקטור הכי רחב והכי מסוכן.

**קבצים מושפעים אם מוציאים `returns.*` מ-KV:**
- כל route ש-render נתונים (4+ routes)
- כל component שמציג תשואות שנתיות (5+ components)
- PrintReport, CompareTable, FundTableV2, FundCard, CompareSummary
- Migration script לניקוי KV

---

## חלק 7 — החלטות שדורשות אישורך

### ❶ האם `returns.ytd2026` (ו-`y*`) נשמרים ב-KV או מחושבים on-the-fly?

**אפשרות A — שמור ב-KV (מצב נוכחי + patch בכל עדכון):**
- יתרון: פשוט לקריאה. כל component קורא שדה.
- חיסרון: חייב לסנכרן ידנית. גורם לכל הבאגים הנוכחיים.
- נדרש: scripts/update-monthly.ts וממשק Admin תמיד יכתבו ytd.

**אפשרות B — on-the-fly בלבד (מחק מ-KV):**
- יתרון: לא יתכן חוסר-סנכרון.
- חיסרון: כל component שמציג ytd צריך לחשב. 5+ components שונים. Migration נדרש.
- נדרש: לכל קומפוננטה להוסיף חישוב מ-monthlyReturns.

**אפשרות C — שמור ב-KV, מחשב מחדש בכל כתיבה (hybrid):**
- כל storageWrite ל-funds עובר דרך helper שמחשב מחדש את כל derived fields.
- יתרון: שימוש נוח כ-KV cache, אבל תמיד נכון.
- חיסרון: כל write מחשב את כל הקרנות (overhead קטן).

**המלצתי: אפשרות C** — הוסף `recomputeDerivedFields(fund)` שנקרא בכל שמירה.

---

### ❷ האם `sharpe` / `stdDev` נשמרים ב-KV?

**מצב נוכחי:** נשמרים, מחושבים מחדש רק בעת apply מהפרסר. `scripts/update-monthly.ts` לא מחשב מחדש.

**ההמלצה:** שמור ב-KV, אבל הוסף חישוב מחדש ב-`update-monthly.ts` (קריאה ל-`calculateRiskMetrics()`). או הפוך ל-on-the-fly אם בונים `lib/returns.ts`.

---

### ❸ האם `scripts/update-monthly.ts` נשאר ככלי גיבוי?

**המלצתי: כן.** גם אם יבנה ממשק UI, הסקריפט נשאר לעדכונים מהירים מה-CLI, debug ו-KV fixes.

**שינוי נדרש בסקריפט:** הוסף חישוב מחדש של `sharpe`/`stdDev`/`avgAnnualReturn` לאחר כתיבה (קריאה לפונקציה שתחולץ ל-lib/returns.ts).

---

### ❹ האם ממשק עדכון חודשי ב-admin משופר במקום או נבנה מסך נפרד?

**אפשרות A — שיפור הטאב הקיים (`monthly-history` tab ב-admin):**
- הוספת שורת INPUT לכל קרן + YTD preview
- שמירה דרך PATCH חדש (לא PUT גלובלי)

**אפשרות B — מסך ייעודי `/green/monthly-update`:**
- ממשק clean, ללא שאר ה-admin noise
- גישה עם סיסמת admin (לא super)

**המלצתי: אפשרות A** — פחות קוד, אותו context. הסקנה חסכונית.

---

### ❺ פורמט `fund.lastUpdated` — ISO או YYYY-MM?

**מצב נוכחי:** לא עקבי. פרסר כותב ISO, indications/update-monthly כותבים YYYY-MM.

**המלצתי: אחד ל-YYYY-MM בכל מקום.** שינוי הפרסר ב-parse/route.ts:2464 + עדכון הסטלאנס גארד. זה שלב א מחלק 6.

---

### ❻ מה עם `data.lastUpdated` הגלובלי — האם נשאר?

**מצב נוכחי:** 7 מקומות תלויים בו לתצוגת "עדכון אחרון" בכותרות.

**המלצתי: נשאר.** הוא metadata לגיטימי (מתי כל המערכת עודכנה). רק לוודא שנכתב ב-YYYY-MM-DD בכל ה-write paths.
