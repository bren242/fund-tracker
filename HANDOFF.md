# HANDOFF.md — ריצת לילה 2026-04-12

## מה עשינו הלילה

### בעיה 1 — יישור גרף ✅
**שורש הבעיה:** נצברו שלוש שכבות של hacks שגרמו לאפקט הפוך:
- `margin: "0 24px 8px"` על ה-div עוטף — לא מצמצם width, רק מזיז
- `paddingLeft: 24, paddingRight: 24` על `ResponsiveContainer` — SVG עדיין מחושב לפי outer width
- כל commit ניסה לתקן את הקודם, גרם לנסיגה

**הפתרון:** הסרה מלאה של כל ה-hacks. ה-content div כבר מכיל `padding: "0 24px"` — הגרף עם `width="100%"` ממלא את שטח התוכן ומיושר אוטומטית עם הכרטיסים.

### בעיה 2 — לוגיקת תאריכים + גרף חודשי ✅
**מה השתנה ב-CompareCharts:**
- Interface: `selectedYears?: string[]` → `from?: string; to?: string` (YYYY-MM)
- `buildLineData()`: משתמש ב-`monthlyReturns` כשקיים, fallback שנתי
- `formatXLabel()`: YYYY-MM → "אפ'23" וכד'
- `xInterval`: `Math.max(0, Math.ceil(N/8) - 1)` — max ~8 תוויות

**מה השתנה ב-page.tsx:**
- `rangeToYearKeys()` הוחלף ב:
  - `rangeToDateRange()` — מחזיר `{from, to}` ב-YYYY-MM
  - `dateRangeToYearKeys()` — גוזר year keys מתוך הטווח (ל-CompareTable)
- 3Y = `addMonths(today, -36)` = אפריל 2023 (לא ינואר 2023)
- 5Y = `addMonths(today, -60)` = אפריל 2021
- Custom: מציג עד YYYY-MM מדויק

### בעיה 3 — פרינט ✅
- `ComparePrint` מקבל `chartFrom?: string; chartTo?: string`
- מועבר ל-`<CompareCharts compact from={chartFrom} to={chartTo} />`
- אותו interval חכם בפרינט

## קומיטים שיצאו

| Hash | תיאור |
|------|-------|
| `633e720` | fix: align compare chart width with fund cards |
| `e656f51` | fix: date range logic for compare chart — rolling periods and monthly data |

*(commit שלישי עם תיקון -36/-60 + תיעוד — עוד לא עלה לפוש)*

## מה פתוח עדיין

1. **בנצ'מרקים בלי monthlyReturns** — כשהגרף עובר למצב חודשי, בנצ'מרקים ללא monthly data יראו קוים ריקים. אפשר לטפל בזה ע"י: אם הקרן חודשית אבל הבנצ'מרק לא — לחשב נקודות שנתיות לבנצ'מרק ולהציגן כ-marker על הציר, לא כקו רציף.
2. **GREEN — features.benchmarks = false** — הבנצ'מרקים מושבתים ב-GREEN. לא ניתן לבדוק בנצ'מרק בפרודקשן עד שיופעלו.
3. **local dev אין monthlyReturns** — הגרף תמיד יציג fallback שנתי ב-local. זה מכוון (נתונים חסרים ב-seed JSON).
4. **פרינט בנצ'מרקים בצבע שני** — CompareTable compact עדיין משתמש ב-`BM_COLORS[i]` לנכון, אבל לא נבדק בהדפסה אמיתית עם 2 בנצ'מרקים.

## כללי זהב שנלמדו

1. **Recharts `ResponsiveContainer` padding/margin hacks — לא לעשות.** `width="100%"` לוקח את שטח התוכן של ה-parent. לשים את ה-container ב-div עם padding — זה הכלל.
2. **כל שינוי שנועד לתקן alignment — לזהות קודם מה בדיוק לא מיושר** (SVG נגד div נגד grid). אחרת כל commit מוסיף שכבה שמסתירה את הבעיה.
3. **גרף חודשי vs שנתי** — ה-interface `from/to: YYYY-MM` גמיש יותר מ-`selectedYears: string[]`. אין לחזור לשנתי-בלבד.
4. **fallback שנתי חובה** — נתונים חודשיים קיימים רק בפרודקשן KV. local dev תמיד fallback.

## איפה עצרנו

קוד מוכן. עדיין צריך:
1. `git add app/compare/page.tsx && git commit --amend` (או commit חדש) עם תיקון `-36/-60` שכבר נעשה אך טרם commited
2. `git push origin main`
3. לאמת ב-Vercel שהגרף מיושר + שהתאריכים נכונים ב-3Y

---
*Generated: 2026-04-12 ריצת לילה*
