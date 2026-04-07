# MILESTONE v2 — Fund Tracker
> אפריל 2026

---

## מה עובד

### AI Parser — Two-Pass Architecture (cache v30)
- **Two-Pass Architecture** — Pass-1 הבנה כוללת, Pass-2 חילוץ טבלאות גולמי + מיפוי דטרמיניסטי
- **פרסינג PDF שלם ו-PNG** — תמיכה מלאה בשני הפורמטים
- **הפרדת ILS/USD אוטומטית** — `dualCurrencyData` עם entry נפרד לכל מטבע/קלאס
- **סינון שורות בנצ'מרק אוטומטי** — `table_label` מזהה ומסנן שורות מדד השוואה
- **תאים צבועים מחולצים נכון** — הנחיה מפורשת בפרומפט: תאים מודגשים/צבועים הם ערכים חודשיים רגילים
- **YTD fallback + חישוב compound** — כשPaas-2 לא מוצא טבלאות, בונה YTD מצטבר מחודשים
- **Ghost entries מסוננות** — entries עם `fields.length === 0` מסוננות לפני החזרה

### חישובי סיכון
- **Sharpe cap** — null אם `|sharpe| > 5` או `stdDev < 0.001` (קרנות אשראי יציבות)
- **stdDev sample** — חישוב ÷N-1 (sample) בשני המקומות: parse ו-data-completion
- **avgAnnualReturn גיאומטרי** — `(∏(1+y_i))^(1/n) - 1` במקום ממוצע חשבוני
- **ריבית חסרת סיכון** — 0.3%/חודש (~3.6% שנתי) בנוסחת שארפ

### ניקוי נתונים
- **17 קרנות נוקו** מערכי Sharpe שגויים ב-KV (730, 1630, 3700 וכדומה)
- **40 קרנות השלימו** avgAnnualReturn דרך מסך השלמת נתונים

### ממשק משתמש
- **מיון עמודות בטבלה** — כל העמודות כולל שנות עבר 2019–2025
- **חצי מיון גלויים** על רקע כהה — לבן #FFF, 16px/18px פעיל, opacity 0.4 לא פעיל
- **כפתור איפוס מיון** — ✕ על עמודה פעילה, חזרה לתצוגת קטגוריות

---

## קבצים מרכזיים

| קובץ | תפקיד |
|------|--------|
| `app/api/parse/route.ts` | לוגיקת פרסינג מלאה (Two-Pass, cache, Sharpe/stdDev) |
| `app/api/funds/route.ts` | קריאה/כתיבה KV, CRUD קרנות |
| `app/data-completion/page.tsx` | השלמת נתונים חסרים (avgAnnual, stdDev, Sharpe) |
| `components/FundTable.tsx` | טבלת קרנות עם מיון עמודות |
| `lib/types.ts` | Fund interface |
| `lib/storage.ts` | KV abstraction (Vercel KV + filesystem fallback) |

---

## החלטות ארכיטקטורה

| החלטה | פרטים |
|--------|--------|
| stdDev ושארפ | מחושבים רק אם יש ≥12 חודשים — אחרת null |
| avgAnnualReturn | מחושב תמיד מתשואות שנתיות (≥2 שנים) |
| שארפ וסטייה | מעדכנים ידנית פעם בשנה בינואר |
| PDF | שלם עדיף על חיתוך לעמוד בודד |
| נתונים | נוקס מוזן ידנית, גרין דרך פרסינג דוחות |
| Cache | hash לפי תוכן קובץ, גרסה v30 — שינוי פרומפט = bump גרסה |
