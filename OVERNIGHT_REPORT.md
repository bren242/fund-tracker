# OVERNIGHT_REPORT.md — ריצת לילה 2026-04-11

## סיכום כללי
כל 4 משימות בוצעו בהצלחה. בילד Vercel עבר — Ready.

---

## משימה 1 — צבעי גרף עקביות ✅

**מה בוצע:**
- `useTheme` מיובא מ-ThemeProvider
- Dark mode: קרן = `#4ade80` (ירוק בהיר), בנצ'מרק = `#B8975A` (זהב מקווקו)
- Light mode: קרן = `#1B3A2F` (ירוק כהה), בנצ'מרק = `#B8975A`
- CartesianGrid stroke, XAxis/YAxis tick/stroke: ערכי hex ישירים (לא CSS vars — per LESSONS.md)
- ChartTooltip: רקע hex לפי מוד (`#1e2d2d` dark / `#ffffff` light), גבול hex ישיר

**הערה לבוקר:** בדוק גרף בשני המודים. הצבעים הם ערכים קבועים — אם צבע המותג צריך להשפיע על קו הקרן, זה שינוי נוסף.

---

## משימה 2 — טולטיפים ✅

**מה בוצע:**
- `ColTooltip` component ברמה עליונה (top-level — per LESSONS.md: אסור קומפוננטות nested)
- מוצב ליד כותרות: חודשים, עקביות, avgGap, IR, ציון כולל
- ליד שם הבנצ'מרק בשורת המידע: tooltip עם המשקולות לפי קטגוריה
- Tooltip מיוצב `position: absolute` עם `zIndex: 200`
- `direction: rtl`, `textAlign: right` — עברית תקינה

**הערה לבוקר:** כרגע הטולטיפ מוצג בhover (onMouseEnter/Leave). אין state גלובלי — כל `?` מנהל את עצמו. בדוק שאין חפיפה עם שורות אחרות בטבלה צפופה.

---

## משימה 3 — כרטיס תקציר קטגוריה ✅

**מה בוצע:**
- `SummaryCard` component ברמה עליונה
- 3 קלפים: IR ממוצע קטגוריה | % קרנות מעל 50% | קרן מובילה
- מחושב ב-`useMemo` (בסוף חישוב הרשימה), רק על `rows` עם `result !== null`
- IR ממוצע: ממוצע אריתמטי של כל ה-ir values שאינם null
- % מעל 50%: `result.score > 50` (לא 50% מול כל הקרנות, רק מול אלה עם נתונים)
- קרן מובילה: `withResult[0].name` (כבר ממוין לפי score desc)
- מוצג רק כש-`fundsWithData > 0`

**הערה לבוקר:** בדוק שהמספרים הגיוניים עם הנתונים האמיתיים. בקטגוריות עם מעט קרנות עם נתונים הקלפים עלולים להיות מטעים.

---

## משימה 4 — יישור תגיות ILS ✅

**מה בוצע:**
- `FundTable.tsx`: שם הקרן עטוף ב-`<span style={{ flex: 1 }}>`
- הflex container מקבל `width: "100%"`
- תגית המטבע (ILS/USD) מודחקת לסוף השורה (inline-end)
- בטבלה עם `dir="rtl"` (html), ה-flex items זורמים ימין-לשמאל → תגית בצד שמאל

**הערה לבוקר:** שורות עם checkbox השוואה: checkbox → שם (flex:1) → תגית. ודא שאין עיוות בהדפסה (PrintReport). שינוי ב-FundTable משפיע על כל הסקרינים.

---

## מה עבד בצורה חלקה
- TypeScript: שגיאה אחת בלבד (Recharts readonly payload cast) — תוקנה מיד
- Build Vercel: Ready תוך 39 שניות
- כל 4 משימות ב-commit אחד (לאחר checkpoint)

## מה דורש תשומת לב בבוקר

1. **גרף dark/light** — בדוק ויזואלית בשני המודים. קו הבנצ'מרק מקווקו עם `strokeDasharray="5 3"`.

2. **Tooltip overflow** — ה-`ColTooltip` ממוצב עם `left: 50%; transform: translateX(-50%)`. בעמודות בצד הטבלה עשוי לחרוג מהמסך. בדוק עמודות קצה (שם קרן בימין, 📈 בשמאל).

3. **כרטיס תקציר עם מעט נתונים** — במצב בו רק 3/26 קרנות יש להן נתונים חודשיים, ה-% מעל 50% ו-IR ממוצע מבוססים על מדגם קטן. שקול להוסיף הערה "מבוסס על X קרנות".

4. **FundTable בהדפסה** — PrintReport משתמש בקומפוננטות נפרדות. שינוי ב-FundTable משפיע רק על screen view, לא על print (בדוק שה-print לא השתנה).

5. **ביצועים** — `buildChartData` רץ בכל render כשהשורה מורחבת. בטבלה עם 30+ קרנות זה בסדר, אבל אם יש האטות — אפשר להעביר ל-useMemo.

---

## Commits
- `916cfad` — checkpoint: before overnight run
- `80944da` — overnight: 4 tasks — chart colors, tooltips, summary card, ILS alignment

---

*נוצר אוטומטית בסיום ריצת לילה*
