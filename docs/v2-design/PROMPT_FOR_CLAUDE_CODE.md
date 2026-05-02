# משימה: בניית /green/consistency/v2 — עיצוב מחדש של פיצ'ר עקביות

## הקשר עסקי

הפיצ'ר הנוכחי ב-`/green/consistency` עובד טכנית אך נכשל ב-UX. אנחנו בונים גרסה חדשה לחלוטין שתחיה במקביל לקיים, ב-route חדש: `/green/consistency/v2`.

הקיים נשאר. v2 נבנה מאפס. אחרי אישור — נבצע swap.

הפילוסופיה החדשה: **דף, לא dashboard.** המסך הוא דף A4 דיגיטלי — מותאם לפרינט מלכתחילה, נקרא כמסמך, מספר סיפור. הוא משמש יועץ פיננסי שעומד מול לקוח ומראה תוצאה אחת ברורה. הוא חייב לעבור בעברית RTL ולהיות בר-הדפסה ב-Cmd+P מבלי שום שינוי visual.

הסגנון: editorial, מגזין פיננסי קלאסי. The Atlantic meets The Economist. שחור על קרם, זהב כ-accent מבוקר, typography עברית מודפסת.

---

## קבצי עיצוב (אמת המידה)

ב-`/mnt/user-data/uploads/` (או במקום שאליו תועלה התיקייה) יש 3 קבצי HTML שלמים שמייצגים את היעד הסופי:

- `idle.html` — מסך כניסה ריק
- `single.html` — דף קרן בודד
- `compare.html` — דף השוואה

**ההוראה:** קרא את 3 הקבצים האלה לפני שאתה מתחיל לכתוב קוד. הם ה-source of truth לעיצוב — לא ה-spec הטקסטואלי שיבוא בהמשך. אם יש סתירה בין הטקסט לקבצים — **הקבצים גוברים.**

הקבצים הם static HTML עם CSS inline. המשימה שלך: לתרגם אותם ל-Next.js components עם React + TypeScript, תוך שמירה על כל הפרטים העיצוביים: typography, spacing, צבעים, hover states, הכל.

---

## ארכיטקטורת הקוד

### Routing

יצירת structure חדש תחת `app/green/consistency/v2/`:

```
app/green/consistency/v2/
├── page.tsx              ← מסך יחיד שמציג idle/single/compare לפי URL params
├── layout.tsx            ← (אם נדרש לטיפוגרפיה ו-fonts)
└── components/
    ├── Toolbar.tsx       ← השורה העליונה (chrome מחוץ לדף)
    ├── PageWrapper.tsx   ← העטיפה של הדף (masthead + footer)
    ├── IdleView.tsx      ← מצב idle
    ├── SingleView.tsx    ← מצב קרן בודדת
    ├── CompareView.tsx   ← מצב השוואה
    ├── Hero.tsx          ← כותרת + verdict + meta
    ├── StoryProse.tsx    ← פסקאות AI עם מספרים מודגשים
    ├── WorstMonth.tsx    ← בלוק החודש הקשה (single)
    ├── WorstMonthCompare.tsx  ← בלוק החודש הקשה (compare, עם 3 קרנות)
    ├── CategoryDotPlot.tsx    ← dot plot של הקטגוריה (single)
    ├── CategoryDotPlotCompare.tsx ← dot plot עם 3 קרנות מודגשות
    ├── PerformanceChart.tsx   ← גרף קווים מינימליסטי
    ├── ComparisonTable.tsx    ← הטבלה של compare עם ★
    ├── NumbersTable.tsx       ← טבלת המספרים בסוף single
    └── PageFooter.tsx         ← disclaimer + branding
```

### URL state management

המצב ב-URL בלבד, query params:
- `/green/consistency/v2` → idle
- `/green/consistency/v2?fund=fund-24` → single
- `/green/consistency/v2?funds=fund-24,fund-12,fund-7` → compare (2-4 קרנות)
- `/green/consistency/v2?fund=fund-24&window=36` → single עם חלון 36M

`window` ברירת מחדל = 24. אפשרויות: 24, 36, 48.

### State transitions

לוגיקת המעבר בין מצבים נגזרת אוטומטית מה-URL:
- 0 קרנות → idle
- 1 קרן → single
- 2-4 קרנות → compare

האינטראקציות במ-toolbar (חיפוש, הוספת chip, הסרת chip) מעדכנות את ה-URL דרך `router.push()` או `useSearchParams`. Re-render מיידי, בלי full page navigation.

חשוב: לא לעבור בין routes. תמיד אותו `/green/consistency/v2` — רק query params משתנים.

### Fonts

טעינת Google Fonts:
- **Frank Ruhl Libre** — כותרות (weights: 400, 500, 700, 900)
- **Heebo** — body (weights: 300, 400, 500, 700)

לטעון דרך `next/font/google` ב-layout.

---

## חישובים חדשים בbackend

הפיצ'ר החדש דורש 4 חישובים שלא קיימים היום ב-`lib/consistency.ts`. צריך להוסיף אותם.

### 1. Worst month per fund

```typescript
interface WorstMonth {
  monthKey: string;           // "2025-09"
  monthLabelHebrew: string;   // "ספטמבר 2025"
  fundReturn: number;         // -1.4
  benchmarkReturn: number;    // 0.0
  categoryAverageReturn: number; // -1.8
  fundVsBenchmark: number;    // -1.4 (מתוך הנתונים של הקרן ביחס לבנצ'מרק שלה)
}
```

הלוגיקה: בתוך החלון (24M / 36M / 48M), למצוא את החודש שבו `fundVsBenchmark` הוא הנמוך ביותר. עבור החודש הזה — לקחת את:
- תשואת הקרן (קיים)
- תשואת הבנצ'מרק שלה (קיים ב-KV)
- ממוצע תשואות של כל הקרנות באותה קטגוריה באותו חודש (חישוב חדש)

### 2. Category statistics

```typescript
interface CategoryStats {
  categoryKey: string;        // "long"
  categoryLabel: string;      // "לונג"
  fundCount: number;          // 18
  averageIR: number;          // 0.42
  funds: Array<{
    fundId: string;
    fundName: string;
    ir: number;               // ה-IR של אותה קרן באותו חלון
  }>;
}
```

זה ה-data של ה-dot plot. צריך לחשב IR לכל הקרנות באותה קטגוריה באותו חלון, להחזיר רשימה ממוינת.

### 3. Same-month performance for all funds

עבור הצגת "ביצועים של הקטגוריה באותו חודש" — צריך לחשב, לכל חודש בחלון, מה היה הממוצע של כל הקרנות באותה קטגוריה.

### 4. Cohort percentile

עבור Single view, אנחנו רוצים להציג "טריו התמודדה טוב יותר מ-78% מהקטגוריה." זה ה-percentile של הקרן באותו חודש ספציפי (החודש הקשה שלה) ביחס לכל הקרנות בקטגוריה באותו חודש.

```typescript
interface SameMonthCohortPosition {
  fundReturn: number;
  rank: number;               // 4 (מתוך 18)
  percentile: number;         // 78 (אחוז הקרנות שטריו עברה אותן)
}
```

### Caching

כל הנתונים האלה מבוססים על מידע שכבר קיים ב-KV (תשואות חודשיות + בנצ'מרקים). הוסף בקאש מתאים. cache version +1 אחרי השינויים.

---

## API routes חדשים

יצירת:
- `app/api/consistency/v2/fund/[fundId]/route.ts` — מחזיר את כל המידע של קרן בודדת
- `app/api/consistency/v2/compare/route.ts` — מקבל `?funds=A,B,C` ומחזיר נתונים השוואתיים
- `app/api/consistency/v2/leaderboard/route.ts` — top-5 + הכל-אם-נדרש

ה-routes הקיימים נשארים unchanged.

### Response schema — Single

```typescript
{
  fund: {
    id: string;
    name: string;
    category: { key: string; label: string; };
    benchmark: { key: string; label: string; };
  },
  window: { months: number; endDate: string; endDateLabel: string; };
  scores: {
    consistencyScore: number;       // 91
    verdict: "very_consistent" | "consistent" | "moderate" | "inconsistent";
    verdictLabel: string;            // "קרן עקבית מאוד"
    informationRatio: number;        // 0.94
    monthsAboveBenchmark: { count: number; total: number; percentage: number; };
    monthsAboveCategory: { count: number; total: number; percentage: number; };
    rankInSystem: { position: number; total: number; };
    rankInCategory: { position: number; total: number; };
  },
  worstMonth: WorstMonth;
  cohortPosition: SameMonthCohortPosition;
  monthlyPerformance: Array<{
    monthKey: string;
    fundReturn: number;
    benchmarkReturn: number;
    excessReturn: number;
  }>,
  category: CategoryStats;
  ai: {
    storyParagraphs: string[];      // 2-3 פסקאות בעברית
    worstMonthNarrative: string;    // משפט אחד-שניים
    categoryContextNarrative: string; // משפט אחד
  }
}
```

### Response schema — Compare

```typescript
{
  funds: Array<{ id, name, category, benchmark }>,
  window: { months, endDate, endDateLabel },
  winnerFundId: string;             // הקרן עם הציון הגבוה ביותר
  verdictLine: string;              // "טריו מובילה בעקביות"
  comparison: Array<{
    fundId: string;
    scores: { ... };                // אותו schema של scores
  }>,
  worstMonths: Array<{
    fundId: string;
    worstMonth: WorstMonth;
  }>,
  monthlyPerformance: Array<{
    fundId: string;
    monthKey: string;
    excessReturn: number;
  }>,
  category: CategoryStats;          // עם 3 הקרנות מסומנות
  ai: {
    decisionParagraphs: string[];   // 3 פסקאות בעברית
    worstMonthsNarrative: string;
    categoryContextNarrative: string;
  }
}
```

---

## AI prompts

### Single — story prompt

קלט ל-AI:
- שם הקרן
- כל הסקורים (IR, אחוזי עקיפה, דירוגים)
- חודש קשה + ההקשר שלו
- מיקום בקטגוריה

הוראות ל-AI (system prompt):
```
אתה כותב פסקאות עבור דוח עקביות קרן עבור יועץ פיננסי. הסגנון: עיתונות פיננסית עברית מקצועית. The Marker meets The Economist.

כללים:
1. עברית בלבד. לא לערבב אנגלית. מונחים טכניים — תעתיק לעברית כש-natural, או השתמש במונח האנגלי כשהוא standard (Information Ratio).
2. ללא רשימות, ללא bullets. פסקאות שלמות.
3. המספרים העיקריים יוזכרו במפורש בתוך הפסקאות — הם הראיות לטיעון.
4. הפסקאות צריכות לקרוא בקולחות. לא 'הקרן הזו טובה בגלל X, Y, ו-Z' אלא 'הקרן הניבה תשואה עודפת יציבה ביחס ל..., עם..., ו-...'
5. תמיד מסתיים ב: "המידע מובא לצורך ניתוח בלבד ואינו מהווה ייעוץ השקעות, המלצה או חוות דעת."

החזר JSON:
{
  "storyParagraphs": [<פסקה 1>, <פסקה 2>, <פסקה 3?>],
  "worstMonthNarrative": <משפט אחד>,
  "categoryContextNarrative": <משפט אחד>
}
```

### Compare — decision prompt

קלט: 3-4 קרנות, כל אחת עם הסקורים שלה. הקרן המנצחת (winnerFundId).

הוראות:
```
אתה כותב פסקאות עבור דוח השוואה של 2-4 קרנות עבור יועץ פיננסי.

כללים:
1. כל מה שב-Single +
2. הפסקה הראשונה: למה הקרן המנצחת מנצחת. ציון את המספרים המכריעים.
3. הפסקה השנייה: trade-offs. אם יש קרן אחרת שמובילה במימד מסוים — תזכיר את זה ותסביר מתי הייתה הבחירה הנכונה.
4. הפסקה השלישית: הקרן או הקרנות שלא מובילות באף מימד — נסח בקצרה.
5. תמיד מסתיים ב: "המידע מובא לצורך ניתוח בלבד..."

החזר JSON:
{
  "decisionParagraphs": [<פסקה 1>, <פסקה 2>, <פסקה 3>],
  "verdictLine": <משפט קצר אחד, 4-7 מילים, "X מובילה ב...">,
  "worstMonthsNarrative": <משפט-שניים שמסכם את החודשים הקשים>,
  "categoryContextNarrative": <משפט אחד>
}
```

### LLM model

`claude-sonnet-4-5`, max_tokens 2000, JSON mode. השתמש ב-jsonrepair fallback כמו ב-GREEN Planner.

---

## עיצוב — פירוט מלא

**כל מה שצריך נמצא בקבצי ה-HTML.** מה שלמטה הוא רק הדגשה של נקודות שקל לפספס.

### צבעים (CSS variables)

```css
--ink: #0a0a0a;
--ink-soft: #2a2a2a;
--ink-muted: #6b6b6b;
--ink-faint: #a8a8a8;
--line: #e8e6e0;
--line-strong: #1a1a1a;
--paper: #fdfcf9;
--gold: #b8975a;
--green: #1b3a2f;
--crimson: #9b3030;
```

### Typography rules

- כותרות (שם הקרן, "טריו"): Frank Ruhl Libre 900, font-size 96px ב-single, 64px ב-compare, letter-spacing -3px
- Verdict ("קרן עקבית מאוד"): Frank Ruhl Libre 400 italic, 28px
- Body של AI: Frank Ruhl Libre 400, 21px, line-height 1.65
- Section labels ("הסיפור", "החודש הקשה"): Heebo 500, 11px, uppercase, letter-spacing 2.5px, צבע gold
- מספרים בתוך body: Heebo 700, 20px, עם highlight זהב מתחת (linear-gradient transparent 60%, rgba(184,151,90,0.18) 60%)
- Meta בכותרת: Heebo 400, 13px, uppercase, letter-spacing 1.2px

### Layout

- max-width של הדף: 880px
- padding של הדף: 72px 88px 56px
- background של ה-body: #f0ede5 (קצת יותר כהה מהדף — נותן לדף "להיות נייר")
- background של הדף: #fdfcf9
- box-shadow על הדף: 0 4px 24px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)

### Print stylesheet

```css
@media print {
  body { background: white; padding: 0; }
  .toolbar { display: none; }
  .page { box-shadow: none; max-width: none; padding: 40px 60px; }
  @page { margin: 1.5cm; }
}
```

### SVG charts

הגרפים הם SVG inline ב-React. לא chart library (Recharts/Chart.js). הסיבות:
1. הם פשוטים — קווים ונקודות
2. SVG מודפס מצוין
3. קל לשלוט בעיצוב

ה-SVG בקבצי ה-HTML משתמש בקואורדינטות hardcoded. בקוד החי, הקואורדינטות יחושבו מהדאטה. השתמש ב-d3-scale (`scaleLinear`) או חישוב ידני של פונקציות mapping.

### Performance chart specifics

- viewBox: `0 0 800 280`
- ציר 0% הוא קו שחור עבה (`stroke="#1a1a1a" stroke-width="1"`) ב-y=140
- gridlines דקיקים מקווקווים (stroke-dasharray 2,3) ב-±2%, ±4%
- ב-Single: קו אחד זהב (`#b8975a`, stroke-width 2)
- ב-Compare: 3 קווים — זהב מלא (winner), ירוק מלא דק יותר (קרן 2), אפור מקווקו (קרן 3+)
- נקודות חודש קשה ועדיפה מסומנות עם circles קטנים (אדום ספטמבר 2025, ירוק מרץ 2025)

### Dot plot specifics

- viewBox: `0 0 800 200` ל-Single, `0 0 800 220` ל-Compare
- ציר אופקי שחור ב-y=140 (single) או y=160 (compare)
- 5 ticks: 0.0, 0.25, 0.50, 0.75, 1.0
- קו מקווקו אנכי באמצע (mean) עם label "ממוצע 0.42"
- כל הקרנות שאינן מודגשות: circles אפורים (`#a8a8a8`, opacity 0.4-0.5), r=6
- קרן מודגשת ב-Single: גדולה יותר (r=9), זהב מלא, עם קו אנכי וlabel למעלה
- קרנות מודגשות ב-Compare: 3 צבעים שונים, r=8-10

### Verdict dot

ב-`top-item` של ה-leaderboard — נקודה צבעונית קטנה ליד "עקבית מאוד":
- ציון 90+: ירוק GREEN (`--green`)
- ציון 70-89: זהב (`--gold`)
- ציון 50-69: צריך לשקול — אולי אפור (לקבוע לפי הצורך)
- ציון <50: אדום משוחק (`--crimson` opacity 0.6)

---

## אינטראקציות

### Toolbar

**חיפוש (autocomplete):**
- placeholder: "חפש קרן..." (ב-idle), "טריו" (ב-single עם value), "הוסף קרן..." (ב-compare)
- בזמן הקלדה: dropdown עם עד 5 התאמות
- לחיצה על תוצאה → `?fund=X` (אם idle) או `?funds=current,X` (אם single/compare)

**Window selector:**
- dropdown עם 3 אפשרויות: 24/36/48
- שינוי → `?fund=X&window=Y` או רק `?window=Y`
- ה-state האחר (קרן/קרנות) נשמר

**Chips ב-compare:**
- כל chip יש `✕` ללחיצה
- הסרה → URL מתעדכן
- הסרה כשנשארת קרן אחת → אוטומטית עוברים ל-single state
- הסרה אחרונה → idle

**הדפסה:**
- `⎙ הדפס` → `window.print()`
- `⤓ PDF` → גם `window.print()` (המשתמש בוחר PDF ב-print dialog) או generation server-side (לבחור — ההמלצה: window.print() לעת עתה, מצוין כ"v1")

### State transitions visual

מעבר idle → single → compare צריך להיות **רך אבל מהיר**. השתמש ב-CSS `opacity` transition על הדף (200ms). השתמש ב-Framer Motion רק אם זה כבר בפרויקט; אחרת CSS-only.

### Loading states

- כשמחכים לדאטה: skeleton placeholders **בתוך הדף** (לא spinner מרכזי). הדף מופיע מיד בלי תוכן, האזורים מתמלאים בהדרגה. זה תחושת "הדף נטען," לא "האפליקציה חושבת."
- AI loading: בלוקי הפסקאות מופיעים אחרי שאר הדף. אפשר shimmer עדין על האזור שלהם.

### Empty states

- אין קרנות בקטגוריה (לא אמור לקרות אבל): הסתר את בלוק "ביחס לקטגוריה" לחלוטין.
- AI שגיאה: מציגים את כל המספרים, ובמקום הפסקאות — הודעה "ניתוח לא זמין כרגע" עם אפשרות retry.

---

## בדיקות לפני push

**חובה:**
1. `npm run build && npm start` — לא רק `npm run dev`. זה חוק ברזל בפרויקט, נלמד מסשנים קודמים.
2. בדיקה על 5 קרנות שונות בקטגוריות שונות:
   - טריו (לונג)
   - אלפא Opportunities (לונג)
   - נוקד Opportunity (לונג)
   - מגן ארה"ב (קרן זרה — מוודאת שלא יתרסק על קטגוריות אחרות)
   - גולדן ברידג' (יש לה נתונים חלקיים — מוודאת empty state)
3. בדיקת compare של 2, 3, 4 קרנות.
4. בדיקת חלון 24 / 36 / 48.
5. בדיקת RTL מלא (אין מילים שיוצאות הפוך).
6. בדיקת `Cmd+P` על single ועל compare — הדף צריך לצאת נקי, לפי A4, ללא toolbar.
7. בדיקה על mobile viewport (320px) — הדף יכול להיות צר אבל קריא; לפחות לא שבור.
8. screenshot של 4 מסכים: idle / single / compare 3-funds / single בפרינט preview.

**ללא screenshot — אסור push.**

---

## בעיות צפויות וטיפול

### Hebrew RTL ב-charts SVG

SVG טקסטים בעברית עלולים להיראות הפוך. הפתרון: השתמש ב-`text-anchor` בצורה הפוכה (start במקום end ולהפך עבור טקסטים בעברית), או הוסף `direction="rtl"` ל-`<text>` elements כשנדרש. בדוק על "ספט 25", "מרץ 25", "ממוצע 0.42".

### Numbers in Hebrew

מספרים נשארים LTR בתוך טקסט עברי RTL. השתמש ב-Unicode bidi controls אם נדרש (RLE/PDF), או — ההמלצה — תכניס את המספרים בתוך `<span dir="ltr">` כשהם בתוך פסקה עברית.

### Font loading FOUT

טען את ה-fonts דרך `next/font/google` עם `display: 'swap'` כדי למנוע flash of unstyled text. שמור על fallback fonts (Georgia ל-serif, system-ui ל-sans).

### Cache invalidation

אחרי הוספת חישובים חדשים — הסר cache קיים או העלה cache version. אם אתה משתמש ב-Upstash KV, עדכן את ה-prefix של המפתחות.

---

## סדר עבודה מומלץ

יום אחד של עבודה (8-12 שעות לקלוד-קוד):

**שלב 1 (1-2 שעות):** קריאת קבצי HTML + הבנת הקיים. mapping של הקיים ל-v2.

**שלב 2 (2-3 שעות):** Backend — חישובים חדשים ב-`lib/consistency.ts` + API routes חדשים. כתיבת tests פשוטים על fund אחד.

**שלב 3 (1-2 שעות):** AI prompts — שני prompts (single + compare), מבנה JSON, fallback handling.

**שלב 4 (3-4 שעות):** Frontend — בניית 14 הקומפוננטות לפי קבצי ה-HTML. typography, צבעים, spacing, hover states.

**שלב 5 (1-2 שעות):** State management — URL params, transitions, autocomplete, chips.

**שלב 6 (1 שעה):** Print stylesheet + tests של הדפסה + screenshots.

**שלב 7 (1 שעה):** בדיקות e2e ידניות לפי הצ'קליסט למעלה. screenshot. push.

---

## מה לא לעשות

1. **לא לגעת ב-`/green/consistency` הקיים.** אסור.
2. **לא להשתמש ב-chart library.** SVG inline בלבד.
3. **לא להוסיף animations מורכבות.** CSS opacity transitions פשוטות, זהו.
4. **לא להמציא שדות חדשים ב-DB.** השתמש בנתונים קיימים + חישובים.
5. **לא לכתוב inline styles ב-React.** השתמש ב-CSS modules, Tailwind, או styled-components — מה שכבר בפרויקט.
6. **לא להוסיף toggle ל"מצב כהה."** הדף הוא קרם, נקודה. אין dark mode בגרסה זו.
7. **לא להציע "מה שאתה חושב שיכול להיות טוב יותר."** הדף הוא בדיוק מה שיש בקבצי ה-HTML. אם משהו לא ברור — שאל לפני שאתה מחליט.

---

## דברים שעלולים להיות לא ברורים — שאל לפני

1. אם אינך מבין איך לחשב את `categoryAverageReturn` באותו חודש — שאל. זה ייתכן שאין נתון ל-cohort כולה לכל חודש.
2. אם ה-AI prompt נכשל ולא מחזיר JSON תקין — איך להתנהג? (ההמלצה: הצג את הנתונים בלבד עם הודעה "ניתוח לא זמין")
3. אם קרן בקטגוריה חסרה נתון לחודש מסוים — איך לחשב את הממוצע? (ההמלצה: התעלם מאותה קרן באותו חודש)

---

## הצלחה = ?

1. `/green/consistency` הקיים עובד בדיוק כמו אתמול. שום regression.
2. `/green/consistency/v2` נטען נקי על 5 הקרנות שצוינו.
3. Single, Compare, Idle — כולם נראים **בדיוק** כמו קבצי ה-HTML המסופקים.
4. `Cmd+P` על single יוצא דף A4 אלגנטי, ללא toolbar, נקי לחלוטין.
5. AI מחזיר נרטיב עברי קולח, לא רובוטי.
6. כל המעברים בין מצבים אינסטנט וללא flash.
7. Screenshots ב-PR.

---

ברגע שאתה מסיים — אני (CEO/PM) אבדוק על הקבצים האמיתיים. אם זה WOW — נחליף את הקיים. אם לא — נשאיר את ה-v2 ונעבוד עוד.
