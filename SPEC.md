# Fund Tracker — SPEC.md
> מצב נכון ל: 2026-05-09 | Cache v47 | גרסה אחרונה: fund-status v2 + Stage B Phase 1
> **עדיפות:** Stage B Phases 2-4 (Charts/Compare/Analysis APIs) | fund-status UX
> **פתוח:** 84 vs 81 inconsistency (3 כפילויות) | Stage B Phases 2-4 עדיין raw fields

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

**Cache:** תוצאות נשמרות לפי hash של הקובץ. גרסה נוכחית: **v47**. כל cache ישן ממנה בטל.

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

## עדכון אחרון (2026-05-09 — Stage B Phase 1 + fund-status v2 + KV migration) ✅

### Stage A — Pure Metric Functions (Completed)
- `lib/constants.ts`: `RISK_FREE_RATE_ANNUAL=0.03`, `SHARPE_CAP=5`, `MIN_MONTHS_FOR_RISK_METRICS=12`
- `lib/metrics.ts`: 9 pure functions — `computeYTD`, `computeAnnualReturn`, `computePeriodReturn`, `computeAvgAnnualReturn` (CAGR), `computeSharpe`, `computeStdDev`, `computeStartMonth`, `computeLatestMonth`, `computeLatestMonthly`, `hasMinimumHistory`
- 32 unit tests in `__tests__/metrics.test.ts`

### Stage B — UI Migration (In Progress)
**Step 3 (Completed):** `FundTableV2`, `FundRowV2` use `lib/fundDerived` helpers

**Phase 1 (Completed):** `getLastUpdated(fund)` replaces raw `fund.lastUpdated` in 4 files:
- `app/admin/page.tsx` — staleness badge
- `app/api/consistency-data/route.ts`
- `app/api/consistency-compare-data/route.ts`
- `app/fund-status/page.tsx`

**Remaining (Phases 2-4):** Charts, Compare, Analysis, Aggregate, BulkApply API, FundReport API
**Roadmap:** `/tmp/stage-b-roadmap.md`

### Stage C — Admin Monthly Update UI (Completed)
- No global `lastUpdated` picker — each fund self-reports
- No editable YTD/yearly fields — all read-only, computed live
- Single MTD input + month dropdown per fund
- Live preview chips (YTD/CAGR/Sharpe/StdDev)
- Delete button (✕) for existing months
- New PATCH actions: `set-monthly-return`, `delete-monthly-return`

### fund-status v2 (Completed — 2026-05-09)
- **Fix 1:** Removed "עדכן ידנית" button linking to /indications. Replaced with inline MTD form per row (month dropdown + % input + save)
- **Fix 2:** Unified summary counts — 3 statuses: `updated` | `waiting` | `delay` (merged old warning+old→waiting). `updated+waiting+delay===total` always holds
- **Fix 3:** Fixed broken delay toggle (was calling non-existent `/api/funds/${id}`) → new `PATCH /api/funds?action=set-delayed-flag`

### KV Migrations Completed
- `reportingDelay → delayed` (10 GREEN funds, May 2026)
- backup: `kv-backup-green-2026-05-09T06-12-16-243Z.json` (in `/tmp`)
- `lib/types.ts`: `reportingDelay` field removed; `delayed` is the single source of truth

### Architecture Principle
**Single Source of Truth: `fund.monthlyReturns`**
All derived metrics computed on-the-fly via `lib/metrics.ts`.
Fallback to legacy KV fields for funds without monthly history.

---

## עדכון קודם (2026-05-03 — consistency v2 Compare View) ✅

### Compare View — production-ready

**מה בוצע (6 rounds):**

**1. תיקוני Compare View — עיצוב ומספרים**
- ITD column בהיטמאפ: ניטרלי (אפור), לא ירוק/אדום
- Max Drawdown `higherIsBetter: true` — פחות שלילי = טוב יותר
- Capture formatting: `Math.abs(v)` — תמיד חיובי
- Max Drawdown formatting: תמיד `-X.X%` מפורש
- הסרת `CompareDeepData` placeholder section

**2. תיקון cold start**
- בעיה: KV transient failure → `storageRead` מחזיר [] → כל החלונות null → מקפים בכל מקום
- פתרון dual-layer: API retry (3 ניסיונות, 200ms/400ms) + client retry (2 ניסיונות, 1000ms) + `hasValidWindows()` validation
- Compare page הוסב ל-Client-side fetch עם Skeleton + Error state

**3. תיקוני ניווט ו-UX נוספים**
- ניווט Compare URL מ-IdleView: absolute path עם `client` param
- `revalidate = 0` ל-page.tsx
- Months count: תמיד חיובי (היה מחזיר שלילי)
- GlossarySection מוצג גם ב-Compare View
- Tooltips ⓘ על כל מדד (CSS-only, `data-tip` attribute)
- כפתור הדפס ב-Toolbar של Compare

**4. Benchmark labels עם משקולות**
- `formatBenchmarkLabel(categoryId)` ב-`lib/consistency.ts` — מחשב מ-`CATEGORY_BLEND` בזמן ריצה
- equity-hedged → `ת"א 125` (בלי אחוז כי 100%)
- bond-hedged → `15% ת"א 125 + 85% תל בונד מאגר`
- מחליף `BENCH_SHORT` סטטי שהיה בשתי routes

**5. DisclaimerBlock משותף**
- `DisclaimerBlock.tsx` — קומפוננט משותף עם disclaimer מלא (כולל "אגם לידרים — סוכנות הפניקס")
- שימוש ב-SingleView וב-CompareView
- CSS print pagination: `page-break-inside: avoid` על כל section גדול
- C (logo running header) — נדלג, Chrome לא תומך `@top-right` ב-`@page`

**Commits:** `9d8613b`, `0d3d979`, `5c79953`, `51ba6ee`, `7009f32`, `6293056`

### הצעד הבא
- מעקב בפרודקשן: לוודא Compare View עובד ב-cold start אמיתי
- בדיקת benchmark labels בכל הקטגוריות
- לשקול retroactive validation של monthly history קיים

---

## עדכון קודם (2026-05-03 — consistency v2.5) ✅

### Consistency V2.5 — multi-window facts-only redesign

**מה בוצע:**

**1. `lib/consistency.ts` — computeWindowMetrics + computeAllWindows**
- `WindowLabel` type: `'YTD' | '12M' | '24M' | '36M' | 'lifetime'`
- `WindowMetrics` interface: תשואה, IR, Up/Down Capture, MDD, דירוג בקטגוריה
- `computeWindowMetrics(fundReturns, bmReturns, catReturns, monthKeys, windowLabel, categoryIRs)` — metrics לחלון בודד
- `computeAllWindows(...)` — מחשב את כל 5 החלונות בבת אחת
- Logic: YTD = כל החודשים בשנה של החודש האחרון; 12M/24M/36M = slice אחרון; lifetime = הכל

**2. `__tests__/consistency.test.ts` — 26 unit tests חדשים**
- 10 קיימים ל-computeMaxDrawdown
- 16 חדשים ל-computeWindowMetrics + computeAllWindows
- כוסו: YTD slicing, IR formula, Up/Down Capture, rank עם שוויון, null על חלון קצר מדי

**3. API route — `app/api/consistency/v2/fund/[fundId]/route.ts`**
- מחושבים כל 5 חלונות בקריאה אחת
- דירוג קטגוריה מחושב per-window (IR של כל קרן אחרת בקטגוריה לאותו חלון)
- Response: `{ fund, benchmarkShortName, endMonthLabel, windows, ai }`
- אין יותר `window` param — כל החלונות מוחזרים תמיד

**4. AI — facts-only system prompt + forbidden words**
- `SYSTEM_PROMPT_FUND`: 2-4 משפטים עובדתיים, ללא תחזית/המלצה
- `FUND_FORBIDDEN_WORDS`: ["צפוי", "תחזית", "ריבית", "אינפלציה", "ממליץ", "כדאי", "עתיד", "בעתיד"]
- `callAIWithForbidden()` ב-ai-caller.ts: מנסה עד 3 פעמים אם מילים אסורות מופיעות
- `FundAIOutput`: `{ insightParagraph: string }` (בוטל verdictLabel/storyParagraphs/worstMonth)

**5. `WindowsTable.tsx` — NEW component**
- 5 עמודות (YTD | 12M | 24M | 36M | כל הנתונים) × 10 שורות
- תשואה, בנצ'מרק, עודף, IR, מעל בנצ'מרק, מעל קטגוריה, MDD, Up/Down Capture, דירוג
- Color coding: positive=ירוק, negative=אדום
- חלון לא זמין → "—" (null gracefully)

**6. `SingleView.tsx` — rewrite**
- הסרת: StoryProse, WorstMonth, PerformanceChart, CategoryDotPlot, NumbersTable, DrawdownSection
- נשאר: Hero + WindowsTable + AI insight paragraph + Disclaimer

**7. `Hero.tsx` — updated**
- הוסר: verdictLabel, windowSize
- נוסף: endMonthLabel

**8. `IdleView.tsx` + `Toolbar.tsx` + `page.tsx`**
- IdleView: כותרת ניטרלית, IR display בכל קרן, URL ללא window param
- Toolbar: הוסרה search box ב-idle state
- page.tsx: מיון לפי IR (לא score)

**Commits:** `f9cfb5f`
**Bundle:** `/consistency/v2` — 3.09 kB (היה 5.95 kB, –48%)

### הצעד הבא
- Compare view (4c) — עדיין disabled, להוסיף אחרי אישור V2.5 בפרודקשן
- לבדוק MDD בפרודקשן: drawdownPct=0 כשאין ירידה מוצג כ"—" (נכון)

---

## עדכון קודם (2026-04-15 — NOX v1.1 release) 🔒

### NOX — סגור ונעול ✅

תיקוני UI מלאים + פיצ'רים חדשים ל-NOX בלבד. GREEN לא נגעה.

**1. Feature-flag-based navigation (data-driven)**
- `components/AppHeader.tsx` — סאב-טאבים מוגדרים עם `flag?: keyof AppFeatures`
- `filterSubs()` מסנן לפי `brand.features` — tab עם 0 תת-טאבים גלויים מוסתר גם הוא
- NOX מקבל רק: קרנות | ניתוח (השוואה בלבד) | כלים (אינדיקציה + סטטוס) | ניהול (קרנות בלבד)
- לא חסום לפי `clientKey === "nox"` — כל לקוח מקבל UI לפי ה-flags שלו

**2. Year-mode על דפי קרנות ו-/compare**
- זוהה אוטומטית: אם אין אף קרן עם `monthlyReturns` → מעבר למצב שנתי (NOX)
- Detection running once per mount דרך `useRef` — לא חוזר על עצמו
- **`FundTableV2.tsx`**: YearSelector (2020–2025 + YTD 2026 + ממוצע) במקום SegmentedControl
- **`/compare`**:
  - **Multi-select year buttons** (toggle) — ברירת מחדל `2025`, מינימום אחד חייב להישאר
  - **`CompareYearBars.tsx`** — BarChart חדש: X = קרנות, Y = תשואה %, כל שנה בצבע נפרד (`YEAR_COLORS` map)
  - טבלה וכרטיסיות → מבוססות על `selectedYearKeys[0]` (השנה הראשונה שנבחרה)
  - Sorted chronologically לפני העברה לגרף

**3. Dynamic per-tenant favicon**
- `BrandConfig.favicon?: string` — שדה חדש
- `AppHeader` מזריק `<link rel="icon">` דינמית ב-`useEffect` לפי `brand.favicon`
- NOX: `/branding/nox/favicon.svg` (N על רקע לבן, `#1a365d`)
- GREEN: fallback ל-`/favicon.svg` הקיים

**4. Changelog modal חד-פעמי אחרי לוגין**
- `components/NoxChangelogModal.tsx` — self-guarding (מחזיר null אם `clientKey !== "nox"`)
- רץ רק תחת `authed=true` ב-`ClientGate` (לא במסך הסיסמה)
- Dismiss key: `sessionStorage["nox-changelog-seen-apr2026"]` — versioned, שינוי גרסה → מופיע שוב
- עיצוב: modal מרכזי, border-top זהב `#c8a96b`, כפתור "הבנתי" בזהב, RTL
- איש קשר: `brennere@gmail.com` (mailto קליקבילי)

**5. תיקוני באגים נלווים שעלו אגב הסשן**
- Admin nav — `prefix` השתמש ב-prop `client` שלא עבר (קיבל `""`) → תיקון ל-`useClientKey()` ישירות
- לוגו NOX — קוד קשיח בעבר החזיר "NOX" כטקסט על רקע לבן → עבר ל-`useBrand(clientKey)` דינמי
- Suspense boundary ל-`useSearchParams` ב-`AppHeader` — נוסף ב-`layout.tsx` כדי לאפשר SSG

**קבצים חדשים:**
- `components/CompareYearBars.tsx` — BarChart מקובץ לפי שנה
- `components/NoxChangelogModal.tsx` — modal עם versioned dismiss
- `public/branding/nox/favicon.svg`

**קבצים ששונו מהותית:**
- `components/AppHeader.tsx` — feature-flag filtering + dynamic favicon + dynamic logo + prefix fix
- `app/compare/page.tsx` — year-mode + multi-select year buttons + bar chart swap
- `components/FundTableV2.tsx` — year-mode (YearSelector)
- `components/ClientGate.tsx` — מרנדר את NoxChangelogModal ב-authed branch
- `config/brand.ts` — `favicon?: string` נוסף ל-BrandConfig
- `data/nox/brand.json` — features + favicon + צבעי NOX (`#1a365d`, `#c8a96b`)
- `lib/useBrand.ts` — ברירת מחדל `indications: true`

**Commits:** `5db762c` (year-mode + favicon), `e0ccd58` (YTD 2026 button), `a8f40dc` (chart sync), `3f584b8` (multi-select + bar), `dd9ad15` (remove init route), `2c14f8c` (changelog modal), `9f39c07` (contact email)

**NOX status:** 🔒 נעול. כל הפיצ'רים מאומתים בפרודקשן.

---

## עדכון קודם (2026-04-14 — analysis page redesign)

### דף ניתוח (analysis) — עיצוב מחדש ✅

**מה בוצע:**

**1. UI redesign מלא — `app/analysis/page.tsx`**
- Pills: `background: transparent` כשלא active, `padding: 6px 16px`, `fontSize: 13px`
- Sort bar: 4 כפתורים בלבד (ללא label/ספירה), `padding: 7px 18px`, `borderRadius: 22px`, active מציג `label + ↓`
- מספרים: `fontVariantNumeric: tabular-nums` + `letterSpacing: -0.2px`
- מספרי שורה: `#b0bac4` (top), `#ffb3ae` (80+)
- compare bar: כפתור ניקוי `נקה` (במקום ×)
- סדר תקופות: מאז הקמה → 60M → 36M → 24M → YTD

**2. AppHeader**
- הוסף header זהה לדף הראשי: פס צבע brand, לוגו, כותרת, תאריך עדכון, nav tabs (ניתוח = active), ThemeToggle
- nav tabs מקוצר: קרנות | ניתוח | גרפים | ניהול

**3. תיקון filter pill overflow**
- wrapper: `overflowX: auto` + `whiteSpace: nowrap` + `scrollbarWidth: none`
- inner: `display: inline-flex` (במקום flex שגרם לגלישה)

**Commits:** `9f8f5e2`, `9b88faf`

---

## עדכון קודם (2026-04-13 — תיקוני פרסר: model + validation)

### 3 תיקונים קריטיים ✅

**1. מודל שבור — claude-sonnet-4-20250514 → claude-sonnet-4-5**
- שורש כל ה-502 במהלך הסשן. המודל הישן deprecated/broken.
- תוקן בשני מקומות: `callClaude` + `callClaudeVision`.

**2. Validation — reportMonth blocking חודשים תקינים**
- `validateParsedEntry` חסמה חודשים שאחרי `reportMonth` כ-"suspicious".
- כשה-AI החזיר `reportMonth="2026-01"` (שגוי) לדוח מרץ — פברואר ומרץ נחסמו, הולידציה הראתה 1/12 ובלמה Apply.
- תוקן: `effectiveReportMonth = max(detected, latest_in_data)`. גם prompt עודכן: Priority 1 = כותרת הדוח, Priority 2 = החודש האחרון בשורה הנוכחית.

**3. Cache v47**
- v45 ו-v46 בוטלו. תוצאות ישנות (שנשמרו עם ולידציה שגויה) מחייבות re-parse.

**אומת:** 9 קרנות מרץ 2026 — כולן 3/12 + validationStatus: valid ✅

**נותר:** קיפלר — non-determinism של ה-AI עם הקובץ הספציפי הזה. Workaround: re-upload.

**Commits:** `4ff391a`, `7f7c703`, `670ebd8`, `ff62234`

---

## עדכון קודם (2026-04-12 — ריצת לילה: compare chart fixes)

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

## כללי זהב טכניים

- עמודות ממוספרות 1-12 נתמכות ב-MONTH_ALIASES (ספרה בודדת ועם אפס מוביל)
- כוכבית (`*`) וסופרסקריפט (`e`/`E`) מוסרים לפני פרסינג בתוך `mapRawTablesToFields`
- `maxDuration=300` חייב להיות בשורה 1 של `route.ts` — לפני כל imports
- תאים ריקים נשמרים במיקומם — לא מוזזים לעמדה ריקה סמוכה (STEP 4 בפרומפט)

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
