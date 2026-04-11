# OVERNIGHT_REPORT.md — ריצה 2026-04-11 (סשן 2)

## סיכום — 6 משימות

---

## Task 1 ✅ — Feature Lock על טאבים מושבתים
**קובץ:** `app/page.tsx`
- קומפוננטה `NavTab` ברמה עליונה (top-level — per LESSONS.md)
- טאבים מושבתים: opacity 0.5, cursor not-allowed, אייקון 🔒
- Tooltip: "פיצ'ר זה אינו פעיל עבורך" ב-hover (absolute positioned, zIndex 200)
- **טאבים שהוחלו:** גרפים, השלמת נתונים, ⚡ אינדיקציה, סטטוס, עקביות
- ניתוח + ניהול תמיד enabled

---

## Task 2 ✅ — Year Filter על הטבלה הראשית
**קובץ:** `app/page.tsx`
- Toggle קטן: הכל | שנה בודדת | טווח
- **הכל:** כל השנים מ-FundTable (ברירת מחדל)
- **שנה בודדת:** dropdown יחיד → עמודה אחת בטבלה
- **טווח:** from (שנה+חודש) ו-to (שנה+חודש) → כל השנים בטווח
- `screenVisibleYears: string[] | null` מחושב ומועבר ל-`FundTable` כ-`visibleYears`
- Print לא נפגע — `printYearsArray` נשאר נפרד לחלוטין

---

## Task 3 ✅ — איחוד ניתוח + השוואה (View Toggle)
**קבצים:** `app/analysis/page.tsx`, `app/compare/page.tsx`
- הוסרה "השוואה" מה-nav של דף הניתוח
- **View Toggle Strip** — מוצג בשני הדפים מתחת ל-filter bar:
  ```
  [ תצוגת קרנות ]    [ השוואה בין קרנות ]
  ```
- הטאב הפעיל: backgroundColor = brand.primaryColor, color="#fff"
- הטאב הלא-פעיל: ghost + brand color + hover effect (color-mix)
- Navigation: לחיצה ב-analysis → `/compare` | לחיצה ב-compare → `/analysis`

---

## Task 4 ✅ — ILS/USD Tag Alignment (בוצע בריצה קודמת)
**קובץ:** `components/FundTable.tsx`
- `flex: 1` על span שם הקרן → תגית מטבע נדחפת לקצה
- FundCard.tsx לא צריך שינוי (layout שונה)

---

## Task 5 ✅ — Scatter Tooltip (קיים מריצה קודמת)
**קובץ:** `app/charts/page.tsx`
- `CustomTooltip` כבר קיים — מציג: שם קרן, תשואה שנתית, סטיית תקן, שארפ, AUM, מטבע
- לא נדרש שינוי

---

## Task 6 ✅ — Consistency Summary Card Warning
**קובץ:** `app/consistency/page.tsx`
- `SummaryCard` מקבל `fundsWithData` prop
- כשפחות מ-5 קרנות: opacity 0.75 + מספרים ב-`var(--text-muted)`
- טקסט: `⚠️ מבוסס על X קרנות בלבד — נתונים חלקיים`

---

## Commits (סשן זה)

| Commit | Task | תיאור |
|--------|------|--------|
| `3f4d02d` | 1+2 | nav lock icon + year filter on main table |
| `1ac3709` | 3 | merge analysis+compare — unified view toggle |
| `1a4b570` | 6 | consistency summary card low-data warning |

---

## בעיות שנתקלנו
- `npx tsc` לא עבד דרך bash shell → נפתר עם `node ./node_modules/typescript/bin/tsc`
- String match ב-compare page לא תפס → נפתר עם context שורות מדויק יותר

---

## לבדיקה בבוקר

1. **Year Filter** — האם עמודות הטבלה מסתנות כצפוי בכל 3 המצבים?
2. **View Toggle** — האם ה-navigation בין analysis ↔ compare עובד תקין?
3. **Lock Tooltip** — האם ה-tooltip מוצג כראוי ולא נחתך מהמסך?
4. **Consistency Warning** — להפעיל עם קטגוריה שיש בה מעט קרנות עם נתונים

---

*נוצר אוטומטית בסיום ריצה*
