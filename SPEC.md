# Fund Tracker — SPEC.md
> מצב נכון ל: 2026-04-12 (ריצת לילה) | Cache v45 | גרסה אחרונה: compare chart fixes

---

## מטרת הפרויקט

כלי פנימי ל-GREEN Wealth Management (ובעתיד גם לגורמים אחרים) למעקב אחר תשואות קרנות השקעה.

**מה הכלי עושה:**
- מציג טבלת תשואות חודשיות ושנתיות לכל הקרנות בתיק
- מאפשר השוואה בין קרנות (2–4 קרנות, עם גרפים)
- מציג גרף פיזור סיכון–תשואה
- מאפשר העלאת דוחות PDF/PNG — הכלי מחלץ את הנתונים אוטומטית דרך Claude API
- פרינט מסודר לדוח A4 (עברית, RTL)

**מי משתמש:**
- אייל + יועל + שותפים ב-GREEN
- בעתיד: לקוחות white-label נוספים (NOX וכו')

---

## סטאק טכני

| שכבה | טכנולוגיה |
|------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5.8 |
| UI | React 19 + Tailwind CSS 4 |
| Charts | Recharts 3.8 |
| Storage (prod) | Vercel KV (Redis) |
| Storage (local) | Filesystem JSON (`/data/{clientKey}/`) |
| AI Parsing | Anthropic Claude API (claude-3-5-sonnet + vision) |
| Deployment | Vercel (auto-deploy on git push) |
| Auth | Two-tier password system (admin + super-admin) |

**URLs:**
- Production: `https://fund-tracker-zeta.vercel.app`
- GREEN: `/green` → `/?client=green`
- NOX: `/nox` → `/?client=nox`

---

## מה עובד כרגע ✅

### ממשק משתמש
- **טבלת קרנות ראשית** — עם פילטרים מדורגים (קבוצה > קטגוריה > סיווג + חיפוש חופשי)
- **מיון עמודות** — לחיצה על כל כותרת עמודה (שם, מנהל, תשואה חודשית, YTD, 2025–2019, ממוצע, שארפ, סטיות) ממיינת עולה/יורד. כשמיון פעיל — תצוגה שטוחה ללא כותרות קטגוריה. כפתור ✕ מאפס מיון
- **השוואת קרנות** — בסיסי (טבלה) ומתקדם (עם גרפי קו + כרטיס מוביל)
- **גרף סיכון–תשואה** — scatter chart לפי נתונים שנתיים
- **פרינט** — A4 portrait, headers חוזרים, footer קבוע עם disclaimer
- **Dark/Light mode** — toggle גלובלי
- **White-label** — כל לקוח מקבל brand נפרד (צבעים, לוגו, כותרת, disclaimer)

### AI Parser — Three-Pass Architecture
מנגנון הלב של הפרויקט. מקבל PDF או PNG של דוח קרן ומחזיר נתוני תשואה מובנים.

**Pass-1 (Holistic):** Claude רואה את המסמך כולו → מחזיר JSON עם `fundName`, `reportMonth`, `returnBasis`, ורשימת `fields` (מפתחות מובנים + ערכים).

**Pass-2 (Raw Table Extraction):** Claude מחלץ טבלאות גולמיות (headers + שורות + `table_label`) → `mapRawTablesToFields()` ממפה דטרמיניסטית לפי headers. הפרומפט מכיל 6 שלבים מפורשים: זיהוי עמודת שנה, כיוון RTL/LTR, שמירת null בשורות חלקיות, זיהוי סוג עמודה, מספרים שליליים, ודוגמה RTL קונקרטית.

**Pass-3 (Validation):** `validateParsedEntry()` — מחשב compound גיאומטרי של החודשים ומשווה לשנתי המדווח. סף valid<0.5%, warning<2%, error≥2%. תוצאות ב-`validation[]` + `validationStatus` ב-response.

**Benchmark Filter:** `isBenchmarkTable()` מסנן טבלאות שה-`table_label` שלהן מכיל מדד/benchmark/index/כללי — לפני `mapRawTablesToFields`.

**Highlighted Cells:** RULES clause ב-`buildRawExtractionPrompt` — Claude מקבל הוראה מפורשת שתאים מודגשים/צבועים הם עדיין ערכים חודשיים רגילים (לא לדלג).

**Fallback:** אם Pass-2 לא מצא טבלאות (למשל כרטיס חודשי יחיד) — בונה `dualCurrencyData` מנתוני Pass-1 כולל חישוב YTD מצטבר מחודשים.

**Cache:** תוצאות נשמרות לפי hash של הקובץ. גרסה נוכחית: **v45**. כל cache ישן ממנה בטל.

**מה מחולץ בהצלחה (קבצים שנבדקו):**
| קובץ | סטטוס | הערות |
|------|--------|-------|
| CLO_IBI.png | ✅ | ILS + USD, 49 חודשים |
| IBI CLO.pdf | ✅ | ILS + USD, entry שלישי ריק מסונן |
| ogen J.png | ✅ | 2 קלאסים, 85 חודשים |
| keren-ogen jan26.pdf | ✅ | הפניקס קפיטל קרן עוגן |
| aspm dec25.pdf | ✅ | 2 קלאסים (Class A + B), ללא YTD (ראה באגים) |
| Creative Value Feb.pdf | ✅ | 5 ghost entries מסוננים, entry אחד תקין |
| Noked Bonds March 2026.pdf | ✅ | מרץ=1.19%, YTD=-0.53%, 2025=11.42% |

### Admin Panel
- CRUD מלא לקרנות וקטגוריות
- עריכת brand config (צבעים, לוגו, כותרת, disclaimer)
- AI Parser drafts — review → apply/reject
- לוג פעולות (audit log)
- גיבוי/שחזור JSON
- מעקב שימוש בטוקנים (monthly cap)
- ניהול benchmarks
- **תיוג מטבע** — טאב Monthly Data מציג badge מטבע (ILS/USD) לכל קרן. קרנות ללא מטבע מסומנות ברקע צהוב עם dropdown לבחירה + כפתור שמירה

### Data Completion
- חישוב אוטומטי של Sharpe Ratio, StdDev מנתוני תשואה חודשיים קיימים
- מזהה שדות חסרים ומציע למלא
- **נוסחאות מתוקנות:**
  - stdDev: sample (÷N-1) לא population
  - avgAnnualReturn: ממוצע גיאומטרי `(∏(1+y_i))^(1/n) - 1`
  - Sharpe: `((μ_monthly - 0.003) / σ_monthly) × √12` עם cap `|sharpe| > 5 → null`
  - Sharpe מחושב רק אם יש ≥12 חודשי נתון

### שדה מטבע (Currency)
- `Fund.currency?: "ILS" | "USD"` — שדה חדש ב-types.ts
- נשמר בעת Apply מ-AI Parser (`returnBasis` → `currency`)
- עריכה ידנית דרך `PATCH /api/funds?action=set-currency`
- 85 קרנות GREEN צריכות תיוג ידני (בתהליך)

---

## מה לא עובד / תקוע ❌

### בעיות ידועות

| # | חומרה | בעיה | קבצים מושפעים |
|---|-------|------|--------------|
| 1 | Low | **Missing YTD לדוחות דצמבר** — כשהחודש הוא דצמבר, YTD מחושב לעיתים תחת label שלא נמצא ב-`YTD_ALIASES`. Annual total קיים אך לא ממופה כ-YTD | aspm dec25 |
| 2 | Info | **PDFs מרובי-עמודים / tracker-PDFs** — מחזירים 400 מ-Claude API. אלה לא דוחות קרן יחידה — הם out of scope | כל קבצי מעקב קרנות, NOX tracker |
| 3 | Info | **שם קרן לא מחולץ לקבצי PNG** — Pass-1 מחזיר `fundName` ריק לתמונות ללא לוגו/כותרת. Fallback: שם הקובץ ללא extension | CLO_IBI, ogen J |
| 4 | Low | **morefeb.png** — קובץ כרטיס חודשי יחיד (45KB). Fallback עובד (YTD מחושב), אך מחולץ רק חודש אחד — היסטוריה לא קיימת בקובץ | morefeb |

### אין עדיין
- אימות אמיתי (SSO/OAuth) — כרגע username/password פשוט
- ייצוא Excel
- mobile UX מלא (upload עובד, אבל הממשק הראשי לא optimized למובייל)
- מסך history/timeline לכל קרן
- התראות אוטומטיות כשמגיע דוח חדש

---

## Compare Page — v1.0 (נעול)

### גרף
- קומפוננטה: `components/CompareCharts.tsx`
- מצב חודשי: עד 24 חודשים — חודשי מלא
- מצב חצי-שנתי: מעל 24 חודשים — כל חודש שני (`index % 2 === 0`)
- קרן ללא `monthlyReturns`: `annual/12` עם קו מקווקו (`strokeDasharray="6 3"`)
- Legend: `verticalAlign="top"`
- גובה: `340px`
- YAxis: שמאל, `width=45`

### פלטה
- `PALETTE` (קרנות): `["#1B3A2F", "#B8975A", "#2563eb", "#9333ea"]`
- `BM_PALETTE` (בנצ'מרקים): `["#0891b2", "#f59e0b"]`
- מסונכרן ב: `CompareCharts.tsx`, `CompareTable.tsx`, `page.tsx` (FUND_COLORS)

### כרטיסיות
- `borderLeft: 3px solid color` (RTL נכון)
- מובילה: `↑ מובילה` בלבד, ללא הסבר

### טבלה
- כותרות קרנות: צבע לפי `FUND_COLORS[i]` (prop `fundColors`)
- `BM_COLORS`: `["#0891b2", "#f59e0b"]`
- `isBest`: כוכב בלבד, לא דורס צבע תשואה

### כללי זהב
- לא לשנות PALETTE בלי לעדכן את שלושת הקבצים
- לא לשנות גובה גרף בלי לבדוק שהקווים לא נחתכים
- Recharts `dataKey` חייב להיות `fund_${id}` — לא שם קרן

---

## עדכון אחרון (2026-04-12 — ריצת לילה: compare chart fixes)

### /compare — 3 תיקונים ✅

**מה בוצע:**

**1. יישור גרף (chart alignment)**
- הוסרו כל ה-hacks שנצברו: `margin: "0 24px 8px"` + `paddingLeft/Right: 24` על `ResponsiveContainer`
- הגרף עכשיו לוקח `width="100%"` של ה-content div שכבר מכיל `padding: "0 24px"` — יישור מלא עם הכרטיסים

**2. לוגיקת תאריכים גוללת + גרף חודשי**
- `CompareCharts` מקבל עכשיו `from?: string; to?: string` (YYYY-MM) במקום `selectedYears: string[]`
- `buildLineData()` משתמש ב-`monthlyReturns` כשקיים, fallback שנתי כשלא
- `rangeToDateRange()`: 3Y = 36 חודשים אחורה בדיוק (אפריל 2023), לא ינואר שנה N
- X-axis: תוויות עבריות קצרות ("אפ'23"), interval דינמי (max ~8 תוויות)
- Custom range: מציג עד YYYY-MM מדויק, לא עד סוף שנה
- נקודות (dots): מוצגות עד 12 data points, מוסתרות לנתונים צפופים (monthly)

**3. פרינט מסונכרן**
- `ComparePrint` מקבל `chartFrom/chartTo` ומעביר לחרטיב `CompareCharts compact`
- אותו interval חכם גם בדף הדפסה

**Commits:** `633e720`, `e656f51`

---

## עדכון קודם (2026-04-11 — סשן שמיני)

### UX — 6 משימות ✅

**מה בוצע:**
- **Task 1 — Feature Lock:** `NavTab` component ברמה עליונה. טאבים מושבתים: 🔒 + opacity 0.5 + tooltip
- **Task 2 — Year Filter:** Toggle הכל/שנה בודדת/טווח על טבלת הקרנות הראשית. `screenVisibleYears` → `FundTable.visibleYears`
- **Task 3 — View Toggle:** הוסרה "השוואה" מ-nav. נוסף View Toggle strip לדפי analysis+compare. Navigation דו-כיווני
- **Task 4 — ILS Tag:** בוצע בריצה קודמת (flex:1 על span שם קרן)
- **Task 5 — Scatter Tooltip:** קיים מריצה קודמת (CustomTooltip)
- **Task 6 — Consistency Warning:** SummaryCard מדעיך ומוסיף אזהרה כשפחות מ-5 קרנות עם נתונים

**Commits:** `3f4d02d`, `1ac3709`, `1a4b570`

---

## עדכון קודם (2026-04-11 — סשן שביעי)

### פרסינג תלת-ממדי + v45 ✅

**מה בוצע:**
- **פרסינג תלת-ממדי (CROSS year+month+value):** STEP 4 בפרומפט Pass-2 — כל תא מעוגן ל-YYYY-MM לפי עמודה+שורה. פתר בעיית קרנות שמתחילות באמצע שנה (null בחודשים לפני ההקמה, לא הזזה)
- **ITD מושבת:** הוסרה חלוטין מהפרסינג — מחושב דינמית מ-monthlyReturns
- **fixMonthShiftError:** נוסף (מוגבל — עוזר רק כשהכפל שונה בין שני המצבים)
- **suspicious months:** חודשים מאוחרים מ-reportMonth מוסרים מה-fields לפני שמירה
- **recomputeValidation בזמן אמת:** תלוי ב-`[view]` כדי שה-ref יהיה ב-DOM
- **badge מטבע בולידציה:** מוצג ב-review UI
- **מסך סטטוס קרנות:** `app/fund-status/page.tsx` (ראה סשן שישי)

**קרנות שעלו תקין בסשן זה:**
- גולדן ברידג' ✅
- Creative Value ✅
- Alpha Opportunities ✅
- רידינג קפיטל ✅
- מגן ארה"ב (ILS + USD) ✅

---

## עדכון קודם (2026-04-10 — סשן שישי)

### מסך סטטוס קרנות ✅

**מה נוסף:**
- `app/fund-status/page.tsx` — מסך חדש: סטטוס עדכון לכל הקרנות
- Feature flag `fundStatus` ב-`config/brand.ts` + toggle באדמין (Branding → Features)
- טאב "סטטוס" בניווט הראשי (מופיע רק כשהפיצ'ר מופעל)
- `middleware.ts` עודכן לכלול `/fund-status`
- `upload/page.tsx` — תמיכה ב-`?fundId=`/`?fundName=` לבחירת קרן מראש + באנר ירוק

**לוגיקת סטטוס:**
- חודש צפוי = החודש הקלנדרי הקודם (computed dynamically)
- ✅ עודכן — latestKey ≥ expected
- ⚠️ חסר חודש — latestKey = expected - 1
- ❌ לא עודכן — latestKey ≤ expected - 2 או ללא monthlyReturns

**ממשק:**
- Header: 3 כרטיסי סטטיסטיקה (סה"כ / עודכנו / ממתינות)
- פילטר מהיר: הכל / עודכנו ✅ / ממתינות ⚠️ / ישנות ❌
- טבלה RTL: שם קרן | קטגוריה | מטבע | חודש אחרון | תאריך עדכון | סטטוס | פעולה
- "העלה דוח" → `/upload?fundId=...&fundName=...`

---

## עדכון קודם (2026-04-10 — סשן חמישי)

### fixAnnualJanSwapPerYear on Pass-2 fields + YTD_ALIASES cleanup (v40) ✅

**הבאג:** `fixAnnualJanSwapPerYear` הוגדרה כ-closure בתוך `parseCloudeResponse` ורצה על Pass-1 fields. Pass-2 דרס את `result.fields` עם `mappedEntries[0].fields` — fields חדשות שלא עברו תיקון swap.

**הפתרון (v40):**
- הוצאת `fixAnnualJanSwapPerYear` לפונקציה עצמאית ברמת מודול עם `corrections` כפרמטר
- הוספת Pass-2.5: קריאה לפונקציה על כל `mappedEntries[i].fields` לאחר Pass-2, לפני Pass-3
- הסרת `'dec','december','דצמבר',"דצמ'"` מ-`YTD_ALIASES` (December הוא חודש, לא YTD)
- החזרת סדר `headerMap` לקדמותו (YTD ראשון — תקין עכשיו שדצמבר לא ב-YTD_ALIASES)
- **Cache v40** — מבטל v39 ומטה

**אומת ב-API:**
- **Alpha Opportunities (מרץ 2026):** 12/12 לכל שנות 2011–2025, 3/12 ל-2026, validationStatus: valid ✅
- **Creative Value (מרץ 2026):** 2019: 6 חודשים + y2019=3.42% (שנה חלקית) ✅; 2020–2025: 12/12 + yearly_swap תוקן לכל השנים ✅; y2021=28.88% (תוקן מ-11.48%)

### Parser bug fixes + Admin UI year chips (סשן קודם)

**באג קריטי תוקן — Dec header mapped to YTD (v39):**
- **שורש הבעיה:** `YTD_ALIASES` הכיל `'dec'` ו-`'december'`. `headerMap()` בדק YTD_ALIASES לפני MONTH_ALIASES. תוצאה: כל PDF עם "Dec" כ-header של עמודה חודשית איבד את דצמבר — 11/12 לכל השנים
- **פתרון:** הזזת בדיקת `MONTH_ALIASES` לפני `YTD_ALIASES` ב-`mapRawTablesToFields()`. עכשיו "Dec" → 12, לא 'ytd'
- **Cache v39** — כל cache ישן מ-v38 ומטה בטל
- **אומת:** Alpha Opportunities 2011–2025 — כל השנים 12/12 ✅

**fixDecemberYtdSwap (v36 → v38 — disabled):**
- נוסף (v36) לטיפול בקרנות שה-YTD שלהן הוצב בחריץ דצמבר
- הגבלת scope נוספה (v37): מופעל רק אם `nonDecMonths.length < 6`
- בוטל (v38): false positives גרמו לבלבול. הבאג האמיתי היה header priority (v39)

**STEP 7 בפרומפט Pass-2 (v38):**
- נוסף כלל: "אם שורה מכילה מספרי עמודות (0-11 או 1-12), התעלם ממנה"
- מונע חילוץ שורות index כ-נתוני תשואה

**Admin UI — year chips במקום monthly tags:**
- במקום עשרות תגיות `monthlyReturns.YYYY-MM` — שורה אחת לכל שנה
- כל chip מציג: `שנה | N/12 (ירוק=12, צהוב=10-11, אדום<10) | שנתי%`
- שאר השדות (returns.yXXXX, manager וכו') ממשיכים להופיע כתגיות רגילות
- **אומת בדפדפן:** Alpha Opportunities archive — כל שנות 2011–2025 מוצגות כ-12/12 ✅

**Call limit issue אובחן ותוקן (v35 era):**
- שגיאת "API error" לאחר deploy v35 הייתה `callCount: 100 >= limit: 100` (429)
- תוקן: GREEN call limit הועלה ל-500 ב-KV (`brand:green.tokenLimits`)

### Pass-3 Validation + Parser improvements (סשן קודם)
- **`validateParsedEntry()`** — פונקציה חדשה: compound גיאומטרי מחודשים vs שנתי מדווח. valid<0.5%, warning<2%, error≥2%
- **`buildRawExtractionPrompt()` שוכתב** — 6 שלבים מפורשים (זיהוי כיוון, null preservation, דוגמה RTL)
- **Admin UI — שכבת ולידציה** — טבלת `שנה | חודשים | שנתי מדווח | שנתי מחושב | פער | סטטוס` עם color coding + monthly chips בהרחבה
- **regex תוקן** — `(y|ytd)` → `(ytd|y)` כדי ש-`returns.ytd2019` יכנס ל-`annualByYear`
- **Cache v35** — כל cache ישן בטל
- **Call limit מוגדל** — GREEN: 100 → 500 קריאות/חודש (ב-KV)
- **Creative Value אובחן** — KV ישן היה שגוי (swap bug v33). דרפט חדש מרץ 2026 תקין לחלוטין (validation: all valid, gaps ≤ 0.01%)

### Scatter Chart — שדרוג מלא
- **Premium UI redesign:** טיפוגרפיה משודרגת, hero title, unified filter area (קטגוריה/תקופה/מטבע), SharpeBadge component, rank cards עם עיגולי מיקום
- **Year range selector:** בחירת טווח שנים (2019–2026), תשואה מחושבת כממוצע גיאומטרי
- **Currency filter:** הכל/ILS/USD — פילטר פנימי בדף scatter
- **Period display:** שורת מידע "מציג נתונים לתקופה: X–Y | N קרנות"
- **Deterministic insights:** 4 תובנות אוטומטיות (טווח תשואות, גביע קדוש, קרן בולטת, אזהרת מטבע מעורב)
- **AUM bubble size:** גודל נקודה לפי AUM — `dotRadius()` function (5/7/10px)
- **Hover card:** tooltip משודרג עם שם, תשואה, ס"ת, שארפ, AUM, מטבע
- **Dark mode מלא:** כל רכיב תומך dark — גרף (`#1E2A2A` רקע, `#2D3748` גריד, `#CBD5E1` צירים), כרטיסים, טבלה, insights, פילטרים
- **Card colors fix:** מובילות `#DCFCE7`, מפגרות `#FEE2E2`
- **Dedup fix:** `buildScatterData` מסנן כפילויות לפי שם קרן (Set)
- **Bottom logic fix:** BOTTOM = שארפ נמוך ביותר רק אם תשואה מתחת לממוצע הקטגוריה. תשואה מעל ממוצע → "normal"

### FundCard (ריצת לילה קודמת)
- גרף עמודות משודרג: gradient, אנימציה, tooltip
- גרף קו חודשי
- tooltip (i) התאוששות, תאריך חודש גרוע, לוגיקת "טרם הושגה התאוששות"

### כלליים
- **פילטר מטבע** בדף ניתוח (הכל/ILS/USD)
- **ריצת לילה:** `run-night.bat` + `night-report.md` מופק אוטומטית
- **test-data/:** תיקייה עם README + `.gitignore`

## עדכונים קודמים
<details>
<summary>2026-04-08 — סשנים 1+2</summary>

- Scatter quadrant labels: 4 `div` מוחלטים (position:relative על chart-card)
- test-data/ directory עם README
- FundCard: tooltip, "טרם הושגה", תאריך חודש גרוע, גרף עמודות gradient/אנימציה, גרף קו חודשי
- פילטר מטבע בדף ניתוח
- Scatter: תוויות ריבועים, בלוק הסבר, הצללת ריבועים
- בדיקת רגרסיה: תוצאות 04-07 אושרו
</details>

## ריצת לילה 2026-04-11 — מה בוצע

### מסך עקביות (app/consistency/page.tsx)
- **צבעי גרף לפי מוד:** dark=`#4ade80`/`#B8975A`, light=`#1B3A2F`/`#B8975A`. Recharts props בhex (לא CSS vars).
- **ColTooltip component:** ? ליד כותרות עמודות (חודשים, עקביות, avgGap, IR, ציון כולל) + משקולות בנצ'מרק בשורת המידע.
- **SummaryCard:** 3 קלפים מעל הטבלה — IR ממוצע, % מעל 50% עקביות, קרן מובילה.
- **Consistency config API:** `/api/consistency-config` + טאב הגדרות באדמין (משקולות ו-thresholds).
- **Time range filters:** rolling (12M/24M/36M/60M) + calendar (2020-2024/מ-2020).

### FundTable
- **תגית ILS/USD:** מודחקת לסוף השורה (flex:1 על שם הקרן) — מיושרת אנכית בעמודה.

### API חדש
- `app/api/consistency-config/route.ts` — GET/POST, שומר ל-KV `consistency-config:{client}`

---

## הצעד הבא

**עדיפות גבוהה:**
1. **המשך העלאת דוחות מרץ 2026** — קרנות שעוד לא עלו
2. **בנצ'מרק פנימי + ת"א 125 היסטורי** (שיחה נפרדת)
3. **MDD — Maximum Drawdown**
4. **לוגו NOX**
5. **מסך עדכון חודשי — תאריך עדכון גלובלי לתקן**

**עדיפות בינונית:**
6. **UI לניהול קרנות** — עריכת fund נוכחית היא raw JSON. לשפר לטופס מסודר עם validation
7. **Pre-check לגודל PDF** — לפני שליחה ל-Claude, לבדוק מספר עמודים. >5 → error ידידותי

**עדיפות נמוכה:**
8. **Mobile dashboard** — טבלה ראשית לא קריאה במובייל (ידוע, לא בפוקוס)

---

## החלטות עיצוביות חשובות שכבר התקבלו

### 1. Two-Pass Parsing (לא One-Pass)
**החלטה:** AI לא מנסה לחלץ הכל בפעם אחת. Pass-1 = הבנה כוללת, Pass-2 = חילוץ טבלאות גולמי → מיפוי דטרמיניסטי.

**למה:** One-pass גרם ל-hallucination על ערכי YTD וחישובים שגויים. Two-pass מפריד בין "מה Claude מבין" לבין "מה הקוד מחשב".

### 2. Cache לפי File Hash (לא לפי שם)
**החלטה:** `sha256(fileBuffer)` → cache key. שם הקובץ לא רלוונטי.

**למה:** אותו קובץ עם שם שונה מחזיר cache hit. עדכון לתוכן הקובץ = cache miss אוטומטי.

**Cache Version:** `v30`. כל שינוי ל-parsing logic → bump גרסה → כל cache ישן בטל.

### 3. mapRawTablesToFields — דטרמיניסטי, לא AI
**החלטה:** לאחר Pass-2, המיפוי מ-raw tables לשדות מבוצע בקוד TypeScript בלבד — ללא AI.

**למה:** reproducibility. שינוי ב-prompt של Pass-2 לא אמור לשנות אם ערך הוא "חודשי" או "שנתי".

### 4. Filter — Ghost Entries
**החלטה:** entries עם `fields.length === 0` מסוננים לפני החזרה מ-`mapRawTablesToFields`.

**למה:** PDFs מרובי-עמודים יצרו entries ריקים (Creative Value: 5 ghost entries, IBI CLO: 1).

### 5. Benchmark Isolation בחילוץ
**החלטה:** `table_label` ב-Pass-2 + `isBenchmarkTable()` סינון לפני מיפוי. CRITICAL RULES clause בפרומפט לתאים מודגשים.

**למה:** Noked Bonds PDF הכיל שורת "מדד קונצרני כללי" שנחלצה במקום שורת הקרן. תאים מודגשים (חודש נוכחי) גרמו ל-March = 0 עד לתיקון.

### 6. White-Label Architecture
**החלטה:** כל לקוח הוא `clientKey` (`green`, `nox`). כל הנתונים, הגדרות הbranding, הדרפטים והלוגים מבודדים לפי `clientKey`.

**למה:** NOX ו-GREEN הם לקוחות שונים עם קרנות שונות, צבעים שונים, ודיסקליימר שונה.

**Middleware:** `/green/compare` → rewrite ל-`/compare?client=green`. CLIENT_KEYS ב-`lib/clientKey.ts` הוא מקור האמת.

### 7. No Database — JSON ב-Vercel KV
**החלטה:** אין DB רלציוני. כל הנתונים הם JSON blobs ב-Vercel KV (Redis) עם filesystem fallback בlocal.

**למה:** קטן, פשוט, serverless-first. אין צורך ב-schema migrations.

### 8. Two-Tier Auth (Admin + Super-Admin)
**החלטה:**
- `admin` password — ניהול רגיל (קרנות, דרפטים)
- `super` password — שינוי brand config, ניהול משתמשים

**למה:** אייל הוא admin ו-super-admin. יועל ושותפים הם admin בלבד. אי-אפשר לשנות צבעים ו-disclaimer בטעות.

### 9. dualCurrencyData — ריבוי מטבעות
**החלטה:** תוצאת הparse מכילה `dualCurrencyData: DualCurrencyEntry[]` — entry נפרד לכל מטבע/קלאס שנמצא בדוח.

**למה:** קרנות רבות מדווחות ILS + USD. קרנות אחרות מדווחות Class A + Class B. המבנה גמיש לשניהם.

### 10. Fallback Cascade
**החלטה:** אם Pass-2 חזר עם טבלאות ריקות — Fallback בונה `dualCurrencyData` מנתוני Pass-1, כולל חישוב YTD מצטבר מחודשים.

**למה:** `morefeb.png` הוא כרטיס חודשי יחיד ללא טבלה — Pass-2 לא מצא כלום. Pass-1 כן הבין שיש תשואה חודשית.

### 11. Sharpe Cap + Sample StdDev
**החלטה:** `|sharpe| > 5` או `stdDev < 0.001` → sharpe = null. StdDev מחושב sample (÷N-1). avgAnnualReturn = ממוצע גיאומטרי.

**למה:** קרנות אג"ח מאוד יציבות (StdDev≈0) יצרו Sharpe של אלפים. 17 ערכים אבסורדיים נוקו מ-KV ישירות דרך Upstash REST API.

**חשוב:** שתי מימושים (`route.ts` + `data-completion/page.tsx`) חייבים להשתמש באותן נוסחאות בדיוק.

### 12. Currency Field — שלב 0
**החלטה:** `Fund.currency?: "ILS" | "USD"` — שדה אופציונלי. נשמר בעת Apply מ-parser. עריכה ידנית דרך PATCH API. תיוג ידני ל-85 קרנות קיימות דרך Admin UI.

**למה:** אייל רוצה לסנן/להציג קרנות לפי מטבע בעתיד. מידע זה לא תמיד מחולץ אוטומטית מדוחות ישנים.

### 13. FundTable Sort — Global Flat Sort
**החלטה:** מיון פעיל → תצוגה שטוחה (ללא כותרות קטגוריה). בלי מיון → תצוגה מקובצת רגילה. עמודות טקסט — ברירת מחדל עולה. עמודות מספריות — ברירת מחדל יורד.

**למה:** מיון בתוך קבוצות לא שימושי — אייל רוצה לראות את הקרנות הטובות ביותר בראש רשימה בלי קשר לקטגוריה.

---

## מבנה קבצים קריטי

```
fund-tracker/
├── app/
│   ├── page.tsx                  # ממשק ראשי — טבלת קרנות
│   ├── compare/page.tsx          # השוואת קרנות
│   ├── charts/page.tsx           # גרף סיכון–תשואה
│   ├── admin/page.tsx            # לוח ניהול (כולל תיוג מטבע)
│   ├── upload/page.tsx           # העלאה מובייל
│   ├── data-completion/page.tsx  # השלמת נתונים חסרים
│   └── api/
│       ├── parse/route.ts        ⭐ מנוע ה-AI Parser (Two-Pass)
│       ├── funds/route.ts        # CRUD קרנות + PATCH currency
│       ├── brand/route.ts        # CRUD brand config
│       └── benchmarks/route.ts  # CRUD benchmarks
├── components/
│   └── FundTable.tsx             ⭐ טבלת קרנות עם מיון עמודות
├── lib/
│   ├── types.ts                  # Fund (+ currency field), Category, Benchmark types
│   ├── parseTypes.ts             # ParseDraft, ParseLogEntry, APPLY_WHITELIST
│   ├── storage.ts                # KV / filesystem abstraction
│   ├── clientKey.ts              # CLIENT_KEYS — מקור האמת ללקוחות
│   └── format.ts                 # pct(), formatDate(), returnColorInline()
├── data/
│   ├── green/funds.json          # נתוני קרנות GREEN
│   ├── green/brand.json          # brand GREEN
│   └── nox/...                   # נתוני NOX (מבנה זהה)
├── middleware.ts                 # URL rewriting: /green → /?client=green
├── test-data/                    # קבצי דוחות לבדיקת רגרסיה (לא ב-repo)
│   └── README.md                 # הנחיות הוספת קבצים ידנית
├── SPEC.md                       # ← המסמך הזה
└── MILESTONE_v2.md               # סיכום milestone אפריל 2026
```

---

## פרמטרים חשובים

| קבוע | ערך | מיקום |
|------|-----|--------|
| Cache version | `45` | `route.ts` L167, L2896 |
| Monthly token limit | `500,000` input tokens (default) | `route.ts` L34 |
| GREEN token limit | `2,000,000` input tokens | KV `brand:green.tokenLimits` |
| Monthly call limit | `100` calls (default) | `route.ts` L35 |
| GREEN call limit | `500` calls | KV `brand:green.tokenLimits` |
| Risk-free rate (Sharpe) | `0.3% / month (~3.6% annual)` | `route.ts` L226 |
| Min observations (Sharpe) | `12 months` | `route.ts` L227 |
| Sharpe cap | `|sharpe| > 5 → null` | `route.ts`, `data-completion/page.tsx` |
| StdDev formula | sample (÷N-1) | `route.ts`, `data-completion/page.tsx` |
| avgAnnualReturn | geometric mean | `route.ts`, `data-completion/page.tsx` |
| Super-admin password | `super2026` | `route.ts` L7 |
| Default admin password | `admin2026` | `route.ts` L8 |
| Cache TTL | `30 days` | `route.ts` (כ-`CACHE_TTL_DAYS`) |
| Known clients | `green`, `nox` | `lib/clientKey.ts` |
