# Fund Tracker — הקשר לשיחה חדשה

## זהות ופרויקט
- **אפליקציה:** פלטפורמת מעקב קרנות white-label ללקוחות מוסדיים
- **Stack:** Next.js 15.5.14 (App Router), TypeScript, Tailwind CSS, Recharts
- **UI:** עברית RTL, dark/light theme, print-optimized A4
- **Deploy:** Vercel — auto-deploy על push ל-main
- **Repo:** https://github.com/bren242/fund-tracker
- **Routes:** `/{client}` · `/analysis` · `/charts` · `/compare` · `/admin` · `/upload`
- **לקוחות:** GREEN (full features + AI parser) · NOX (basic)
- **Auth:** password gate per client, super admin (`super2026`)

## כללי עבודה
1. שינויים מינימליים בלבד — לא לגעת במה שעובד
2. Root cause first — לא לתקן תסמינים
3. Print is sacred — לא לשבור print layouts
4. לא לעשות push לפני validation
5. לא יותר מ-2 ניסיונות כישלון — עצור, חשוב, שנה גישה

## מצב נוכחי
- **גרסה:** v1.1 stable (ל-deploy)
- **Last commit:** `1c5c8b2` — dark mode headers white text and border
- **Cache version:** 11
- **כל הנתונים:** Vercel KV (prod) / `data/{clientKey}/` (local dev)

---

## מה הושלם בשיחה זו — UI/UX Overhaul של עמוד ראשי

### Navigation
- NavTab redesign — pill style → underline-only active state
- Active tab מיושר עם `border-bottom: 2px solid var(--bg-section)`
- Container הוסר (transparent bg)

### Floating Action Bar
- כפתורי השוואה עברו מה-header לבר צף בתחתית המסך
- CSS class: `.floating-action-bar` + animation `floatUp`
- רקע `#e0e0e0` (לא שקוף, לא לבן — גרסה יציבה)

### Table Headers (Apple Numbers style)
- `backgroundColor: transparent`, uppercase, `letterSpacing: 0.8px`
- `borderBottom: 2px solid var(--border-table)` — קו מפריד בלבד
- Sort arrows: `color: var(--text-muted)`

### Table Rows
- Cell padding: `8px 10px`
- Row alt: `var(--bg-row-alt)` = `#fafafa` (light) / `#1c2230` (dark)
- `borderCollapse: separate` + `borderSpacing: 0` (כדי ש-borderTop על td יעבוד)

### Group Headers — ריבוד היררכי
- **ראשית:** `fontSize: 13px`, `fontWeight: 700`, `color: var(--section-header-color)`, `borderTop: 2px solid var(--section-header-color)`, padding `14px 16px 6px`
- **משנה:** `fontSize: 11px`, `fontWeight: 600`, italic, אפור `var(--text-secondary)`, קו דק `rgba(6,78,59,0.25)`
- **Dark mode:** `--section-header-color: rgba(255,255,255,0.90)` (לבן על רקע כהה)
- **Light mode:** `--section-header-color: var(--bg-section)` (ירוק/כחול המותג)

### Collapsible Groups
- State: `collapsedGroups: Set<string>` — מפתח = `cat.parentSection`
- לחיצה על כותרת ראשית → מסתירה כל שורות הקרן של הקבוצה
- כותרות משנה **נסתרות גם הן** בכיווץ
- חץ ▼ עם `float: left`, rotation animation

### Grouping Logic — שיפור מבני
- הלוגיקה הישנה: hardcoded `SUPER_HEADER_BEFORE = "bond-hedged"` 
- הלוגיקה החדשה: **`category.parentSection`** — שדה קיים על כל Category
- Pre-group לפי `parentSection`, iteration על `sectionOrder`
- כותרת משנה מוצגת רק אם: `sectionCats.length > 1 || cat.name !== section`
- 7 קבוצות ראשיות: קרנות גידור ישראל · אגד קרנות · אחר · קרנות גידור חו"ל · נאמנות סגורות · חוב פרייבט · CLO

---

## מה פתוח לטיפול — לפי עדיפות
1. **עמוד ניתוח (`/analysis`)** — ממתין לסקירה
2. **עמוד גרפים (`/charts`)** — ממתין לסקירה
3. **עמוד השוואה (`/compare`)** — ממתין לסקירה
4. **Print layout** — לוודא שהשינויים לא שברו את הדפסה
5. **NOX client** — לוודא שהשינויים נראים טוב גם שם

---

## החלטות עיצוב שהתקבלו

| נושא | החלטה |
|------|--------|
| Navigation | Underline-only active, לא pill container |
| Action buttons | Floating bar בתחתית, לא בheader |
| Table headers | Transparent, uppercase, border-bottom בלבד |
| Group headers | Typography-only, אפס fill colors |
| Dark mode headers | לבן `rgba(255,255,255,0.90)` — לא ירוק |
| Collapse | מסתיר קרן-rows + כותרות משנה, כותרת ראשית תמיד נראית |

---

## קבצים מרכזיים שהשתנו בסשן

| קובץ | שינוי |
|------|-------|
| `components/FundTable.tsx` | Group headers, collapsible, borderCollapse, row alt color |
| `app/globals.css` | Nav CSS, floating bar CSS, `--section-header-color`, dark mode vars |
| `app/page.tsx` | NavTab redesign, floating action bar |

## קבצים חשובים אחרים (לא שונו)
| קובץ | תפקיד |
|------|--------|
| `lib/types.ts` | `Category.parentSection` — שדה מפתח לgrouping |
| `lib/constants.ts` | `SECTION_COLORS` — כבר לא בשימוש ב-FundTable |
| `lib/colors.ts` | `brandCssVars()` — מגדיר `--bg-section = primaryColor` על div |
| `config/brand.ts` | `primaryColor: "#1a365d"` (local default) — ב-KV יש `#064e3b` |
| `app/api/parse/route.ts` | AI parser — לא נגענו |

---

## כללי זהב טכניים — לא לשבור

1. **`--bg-section` ≠ `:root`** — `brandCssVars()` מגדיר על div, לא על `:root`. לבדוק computed style על האלמנט עצמו, לא על `document.documentElement`.
2. **`borderCollapse: separate` + `borderSpacing: 0`** — חובה כדי ש-`borderTop` על `<td>` יעבוד. עם `collapse` הborder נעלם.
3. **`colSpan = colCount + 1`** — הטבלה מכילה `COL_WIDTHS.length` (16) + עמודת AUM ללא רוחב = 17 עמודות. `colCount` לא כולל AUM.
4. **`float: left` לחץ ▼** — RTL table, לא להשתמש ב-`justifyContent: space-between` — הטקסט מתהפך.
5. **`--section-header-color`** — משתנה ייעודי לכותרות קבוצות. `--accent-hover` הוא זהב לכפתורים — לא לדרוס.

---

## בעיות שנפתרו — לא לגעת

| בעיה | פתרון |
|------|--------|
| Nav container לא נראה ב-light mode | הוסר הcontainer, underline בלבד |
| `--color-primary` לא קיים | משתמשים ב-`--bg-section` |
| Dark mode text invisible | תוקנו `--text-secondary` / `--text-muted` |
| Border header נעלם | `borderCollapse: separate` |
| colSpan לא מגיע ל-AUM | `colCount + 1` |
| ירוק על כהה = בעיה | `--section-header-color: rgba(255,255,255,0.90)` ב-dark |

---

## הצעד הבא המיידי

**לפתוח שיחה חדשה ולהמשיך עם:**

> "המשך מ-session-context. העמוד הראשי סגור. עכשיו עוברים ל-[עמוד הבא]."

עמוד ניתוח (`/analysis`) הוא הטבעי להמשיך איתו — אותו style system, צריך לוודא שהheaders, הטבלאות והחלוקה לקטגוריות תואמות את מה שנבנה היום.

---
*עודכן: 2026-04-11 | Commit: `1c5c8b2` | גרסה: v1.1*
