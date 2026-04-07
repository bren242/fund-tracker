# Fund Tracker — SPEC.md
> מצב נכון ל: 2026-04-07 | Cache v29

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
- **השוואת קרנות** — בסיסי (טבלה) ומתקדם (עם גרפי קו + כרטיס מוביל)
- **גרף סיכון–תשואה** — scatter chart לפי נתונים שנתיים
- **פרינט** — A4 portrait, headers חוזרים, footer קבוע עם disclaimer
- **Dark/Light mode** — toggle גלובלי
- **White-label** — כל לקוח מקבל brand נפרד (צבעים, לוגו, כותרת, disclaimer)

### AI Parser — Two-Pass Architecture
מנגנון הלב של הפרויקט. מקבל PDF או PNG של דוח קרן ומחזיר נתוני תשואה מובנים.

**Pass-1 (Holistic):** Claude רואה את המסמך כולו → מחזיר JSON עם `fundName`, `reportMonth`, `returnBasis`, ורשימת `fields` (מפתחות מובנים + ערכים).

**Pass-2 (Raw Table Extraction):** Claude מחלץ טבלאות גולמיות (headers + שורות) → `mapRawTablesToFields()` ממפה דטרמיניסטית לפי headers.

**Fallback:** אם Pass-2 לא מצא טבלאות (למשל כרטיס חודשי יחיד) — בונה `dualCurrencyData` מנתוני Pass-1 כולל חישוב YTD מצטבר מחודשים.

**Cache:** תוצאות נשמרות לפי hash של הקובץ. גרסה נוכחית: **v29**. כל cache ישן ממנה בטל.

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

### Data Completion
- חישוב אוטומטי של Sharpe Ratio, StdDev מנתוני תשואה חודשיים קיימים
- מזהה שדות חסרים ומציע למלא

---

## מה לא עובד / תקוע ❌

### בעיות ידועות (מ-test-results.md)

| # | חומרה | בעיה | קבצים מושפעים |
|---|-------|------|--------------|
| 1 | Low | **Missing YTD לדוחות דצמבר** — כשהחודש הוא דצמבר, YTD מחושב לעיתים תחת label שלא נמצא ב-`YTD_ALIASES`. Annual total (0.1991) קיים אך לא ממופה כ-YTD | aspm dec25 |
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

## הצעד הבא

**עדיפות גבוהה:**
1. **YTD לדצמבר** — להרחיב `YTD_ALIASES` ו/או לזהות דצמבר כחודש מיוחד ולחשב YTD = annual. קובץ: `mapRawTablesToFields()` ב-`route.ts`.
2. **UI לניהול קרנות** — עריכת fund נוכחית היא raw JSON. לשפר לטופס מסודר עם validation.

**עדיפות בינונית:**
3. **Pre-check לגודל PDF** — לפני שליחה ל-Claude, לבדוק מספר עמודים. אם >5 → להחזיר error ידידותי במקום 400.
4. **שיפור fundName extraction** — לבקש מ-Claude לחלץ fundName בצורה אגרסיבית יותר גם מקבצי PNG.
5. **Multi-entry deduplication** — כשיש 2 entries עם אותה currency ואותם ערכים בדיוק → לאחד.

**עדיפות נמוכה:**
6. **Mobile dashboard** — טבלת הקרנות הראשית לא קריאה במובייל (בעיה ידועה, לא בפוקוס כרגע).

---

## החלטות עיצוביות חשובות שכבר התקבלו

### 1. Two-Pass Parsing (לא One-Pass)
**החלטה:** AI לא מנסה לחלץ הכל בפעם אחת. Pass-1 = הבנה כוללת, Pass-2 = חילוץ טבלאות גולמי → מיפוי דטרמיניסטי.

**למה:** One-pass גרם ל-hallucination על ערכי YTD וחישובים שגויים. Two-pass מפריד בין "מה Claude מבין" לבין "מה הקוד מחשב".

### 2. Cache לפי File Hash (לא לפי שם)
**החלטה:** `sha256(fileBuffer)` → cache key. שם הקובץ לא רלוונטי.

**למה:** אותו קובץ עם שם שונה מחזיר cache hit. עדכון לתוכן הקובץ = cache miss אוטומטי.

**Cache Version:** `v29`. כל שינוי ל-parsing logic → bump גרסה → כל cache ישן בטל.

### 3. mapRawTablesToFields — דטרמיניסטי, לא AI
**החלטה:** לאחר Pass-2, המיפוי מ-raw tables לשדות מבוצע בקוד TypeScript בלבד — ללא AI.

**למה:** reproducibility. שינוי ב-prompt של Pass-2 לא אמור לשנות אם ערך הוא "חודשי" או "שנתי".

### 4. Filter — Ghost Entries
**החלטה:** entries עם `fields.length === 0` מסוננים לפני החזרה מ-`mapRawTablesToFields`.

**למה:** PDFs מרובי-עמודים יצרו entries ריקים (Creative Value: 5 ghost entries, IBI CLO: 1).

### 5. Benchmark Isolation בחילוץ
**החלטה:** הוספת CRITICAL block ב-`buildRawExtractionPrompt` — Claude מקבל הוראה מפורשת להתעלם משורות benchmark/מדד.

**למה:** Noked Bonds PDF הכיל שורת "מדד קונצרני כללי" שנחלצה במקום שורת הקרן.

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

---

## מבנה קבצים קריטי

```
fund-tracker/
├── app/
│   ├── page.tsx                  # ממשק ראשי — טבלת קרנות
│   ├── compare/page.tsx          # השוואת קרנות
│   ├── charts/page.tsx           # גרף סיכון–תשואה
│   ├── admin/page.tsx            # לוח ניהול
│   ├── upload/page.tsx           # העלאה מובייל
│   ├── data-completion/page.tsx  # השלמת נתונים חסרים
│   └── api/
│       ├── parse/route.ts        ⭐ מנוע ה-AI Parser (Two-Pass)
│       ├── funds/route.ts        # CRUD קרנות
│       ├── brand/route.ts        # CRUD brand config
│       └── benchmarks/route.ts  # CRUD benchmarks
├── lib/
│   ├── types.ts                  # Fund, Category, Benchmark types
│   ├── parseTypes.ts             # ParseDraft, ParseLogEntry, APPLY_WHITELIST
│   ├── storage.ts                # KV / filesystem abstraction
│   ├── clientKey.ts              # CLIENT_KEYS — מקור האמת ללקוחות
│   └── format.ts                 # pct(), formatDate(), returnColorInline()
├── data/
│   ├── green/funds.json          # נתוני קרנות GREEN
│   ├── green/brand.json          # brand GREEN
│   └── nox/...                   # נתוני NOX (מבנה זהה)
├── middleware.ts                 # URL rewriting: /green → /?client=green
└── SPEC.md                       # ← המסמך הזה
```

---

## פרמטרים חשובים

| קבוע | ערך | מיקום |
|------|-----|--------|
| Cache version | `29` | `route.ts` L167, L2590 |
| Monthly token limit | `500,000` input tokens | `route.ts` L34 |
| Monthly call limit | `100` calls | `route.ts` L35 |
| Risk-free rate (Sharpe) | `0.3% / month (~3.6% annual)` | `route.ts` L226 |
| Min observations (Sharpe) | `12 months` | `route.ts` L227 |
| Super-admin password | `super2026` | `route.ts` L7 |
| Default admin password | `admin2026` | `route.ts` L8 |
| Cache TTL | `30 days` | `route.ts` (כ-`CACHE_TTL_DAYS`) |
| Known clients | `green`, `nox` | `lib/clientKey.ts` |
