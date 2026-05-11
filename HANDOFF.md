# HANDOFF.md — סשן 11/05/2026 — UI Sessions 3א+3ב: /charts Foundation + Hero

## מה הושלם היום

### UI Session 3ב — /charts Hero Treatment ✅ (+ Completion Pass)

**Completion Pass fixes (סשן 3ב-fix):**
- Hero ring: `strokeOpacity` הוגבר ל-0.55, `strokeWidth` ל-2 (נראה בעין)
- Hero label: הועבר מ**מתחת** ל**מעל** הבועה, הוסף `<rect>` bg, הוסף תשואה%: "חצבים וואליו · 44.7%"
- Container height: `min(calc(100vh - 200px), 720px)` → `min(calc(100vh - 220px), 680px)` — נכנס ל-1440×900 בלי scroll
- Tooltip: נוסף `fontVariantNumeric: "tabular-nums"` לשדות המספריים
- **Checklist 12/12 ✓** — אומת DOM לכל שורה

### UI Session 3ב — /charts Hero Treatment ✅

**קובץ:** `app/charts/page.tsx` — שדרוג Recharts layer

**מה בוצע:**
- **Full-bleed chart container** — `width: 100%`, `height: min(calc(100vh-200px), 720px)`, gradient bg `#F6F5F1→#FAFAF7`, `borderRadius: 20`, box-shadow 32px
- **ResponsiveContainer** — החלפת `ScatterChart width={660}` בעטיפת `ResponsiveContainer` מלאה
- **Semantic bubble colors (4 רמות):**
  - `#1B3A2F` = holy-grail (ריבוע תשואה גבוהה + סיכון נמוך)
  - `#5C8A6F` = top (שארפ גבוה מחוץ לריבוע)
  - `#9CA3AF` = normal
  - `#B45353` = bottom (שארפ נמוך מתחת לממוצע)
- **Custom `shape` renderer** — מחליף `Cell`+`LabelList`, מצייר כל bubble ידנית
- **Hero bubble** — קרן עם שארפ הגבוה ביותר: עיגול חיצוני (ring) + שם צף מתחת
- **Mount animations** — `bubbleIn` fade-in עם stagger 30ms לכל bubble
- **ChartHelpPopover** — כפתור `?` (absolute top-left), popover עם legend + הסבר, מחליף את `ChartExplanation` card
- **Quadrant labels** — uppercase, letter-spacing 1.5px, opacity נמוכה, ללא ✦
- **InsightsBlock** — הוסר "הקרן הבולטת" insight (עכשיו חי בגרף)
- **Meta text block** — הוסר (מיזוג לתוך Row 2)
- **Tooltip** — grid layout, צבע לפי rank

**אומת:**
- 4 צבעים סמנטיים ב-DOM ✅
- Hero ring + label "חצבים וואליו" ✅
- bubbleIn animation ✅
- Sticky controls top:52 ✅
- 107/107 tests ✅

---

### UI Session 3א — /charts Foundation ✅

**קובץ:** `app/charts/page.tsx` — שכתוב מלא

**מה בוצע:**
- **הוסר header ישן** (brand bar + custom nav) — מחליף ב-AppHeader מהלייאאוט הגלובלי
- **Controls bar 2 שורות** (sticky top:52, z:99, background:#FAFAF7):
  - Row 1 (44px): sub-tabs ימין (דירוג/השוואה/גרף✓/עקביות + feature locking) + search + group select + category select + reset (שמאל)
  - Row 2 (slide-down, maxHeight: 0→40px, 200ms cubic-bezier): classification pills ימין + period selects + currency pills + count שמאל
  - Row 2 מופיע רק כש-group OR category נבחרו
- **Meta text** — "47 קרנות · 2020–2025" מתחת לcontrols bar, 12px muted
- **InsightsBlock שדרוג** — כרטיס אלגנטי: border rgba(27,58,47,0.12), gradient #F4F3EF→#FAF9F6, padding 24px 28px, border-radius 16px, shadow 0 1px 3px; הקרן הבולטת עם רקע כהה יותר + right border ירוק 3px
- **PrintLegend polish** — column headers uppercase 11px letterSpacing:0.5px color:#6B6B6B; row separator 1px rgba(0,0,0,0.06); hover rgba(27,58,47,0.03); מספרי שורה tabular-nums opacity:0.5
- **Page gradient** — linear-gradient(180deg, #F4F3EF 0px, #ffffff 600px) בlight mode

**מה לא נגע** (לסשן 3ב):
- Recharts code (scatter chart, axes, ZAxis, Cell, LabelList)
- Quadrant labels
- RankCard component
- print layout

**אומת:**
- AppHeader sticky top:0 z:100 h:52px ✅
- Controls sticky top:52px z:99 ✅
- Row 2 maxHeight:0 כברירת מחדל, slide-down כשgroup/category ✅
- InsightsBlock: border-radius 16, gradient bg, featured row ✅
- 107/107 tests PASS ✅

---

## סשן קודם (10/05/2026 לילה)

## מה הושלם היום

### 1. Credit-Exhausted UX ✅
- `lib/credit-error.ts` — `isCreditExhaustedError(status, body)`, `CREDIT_EXHAUSTED_SENTINEL`, `creditExhaustedBody()`
- זיהוי HTTP 402 + body keywords ("credit balance" / "billing") — לא 502 גנרי
- `__tests__/parse-credit.test.ts` — 3 describe blocks, 7 tests
- הועבר ל-`app/api/parse/route.ts`

### 2. Diagnose Duplicates Script ✅
- `scripts/diagnose-duplicates.ts` — script לאבחון כפילויות בKV (ללא כתיבה)
- מנרמל שמות (Levenshtein ≤3), מוציא checklist ידני
- מחפש `.env.production.local` מ-cwd עד 6 levels למעלה (תואם worktrees)

### 3. avgAnnualReturn ×100 Fix ✅
- בעיה: שדה נשמר כ-fraction (0.05) אבל הוצג ×100 ← הוצג כ-5% תמיד במקום 500%
- תוקן ב-`app/api/funds/route.ts` → שמירה כ-fraction, display ×100 נכון

### 4+5. UI Unification — AppHeader + /analysis + /admin ✅
**AppHeader redesign (components/AppHeader.tsx):**
- 52px, sticky, background:#ffffff, logo + tabs (קרנות/ניתוח/כלים) + gear + print

**/analysis (app/analysis/page.tsx) — 7 איטרציות sticky:**
- שורה 1 (44px): sub-tabs עם feature locking (ימין) + sort/NOX year-select (שמאל)
- שורה 2 (40px): groups+categories (ימין) + currency (שמאל)
- thead `top:136` סטטי (52+44+40) — ללא ResizeObserver
- כל קוד אבחוני הוסר

**/admin (app/admin/page.tsx):**
- הוסר header ישן, הוחלף ב-pill bar sticky top:52
- כפתור "שמירה ופרסום" בתוך ה-pill bar

### 6. NOX Sub-tab Locking ✅ (ממרץ עם NOX worktree)
- `brand.features.comparison/chartPage/consistencyAnalysis === false` → pill נעול + 🔒
- NOX year multi-select (2020-2025 + YTD26) ב-row 1

---

## לקחים שנלמדו (מפורטים ב-LESSONS.md)
- backdropFilter שובר sticky background → תמיד background סולידי
- RTL flex + overflow-x חותך קצה שמאלי → 2 שורות נפרדות, לא דחיסה לאחת
- ResizeObserver unstable → גבהים קבועים + top סטטי עדיף תמיד
- overflow:clip (לא hidden) על table wrapper
- "לא לחפור פעמיים" — מדידה אמיתית לפני ניסיון שלישי

---

## מה פתוח לסשן 3ג — /compare + /consistency/v2

**קבצים:** `app/compare/page.tsx`, `app/consistency/v2/...`
**מה נדרש:**
- הוסף sub-tabs row (דירוג/השוואה/גרף/עקביות) עם "השוואה" / "עקביות" active
- עדכן כל controls wrapper ל-`top:52`
- עדכן כל thead / sticky elements בהתאם
- בדוק print layouts לא נשברו

---

## מה פתוח לסשן 4

**קבצים:** `/indications`, `/fund-status`  
**מה נדרש:**
- top:52 על כל controls
- סטנדרט pill אחיד

---

## מה פתוח לסשן 5 (polish)

- Hover states על כל הכפתורים
- Transition animations
- Spacing consistency בין דפים
- Mobile breakpoints (low priority)

---

## Design Review — /consistency/v2 (4 בעיות פתוחות)

1. **בורר תקופה לא מובן** — "תקופה" vs "חלון" — שינוי copy + tooltip
2. **12M מחזיר "אין נתונים"** — כי סף מינימום הוא 24M — להוריד ל-12M או להסביר למשתמש
3. **Checkbox ב-leaderboard** — בלי label / context — לשפר UX
4. **תאריך משתנה במעבר ל-compare** — race condition שתוקן (commit 4dbeb5f) אבל יש לאמת ב-prod

---

## מצב Git ומבחנים

| | |
|---|---|
| **tests** | 107/107 ✅ |
| **branch main** | `5c42ed7` merge: 2-row analysis controls |
| **worktree branch** | `claude/quirky-matsumoto-467e52` (rebased on main) |
| **Vercel** | auto-deploy on push to main |

---

*Generated: 2026-05-10 לילה | UI Unification Sessions 1+2*
