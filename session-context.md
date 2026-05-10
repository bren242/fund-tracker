# Fund Tracker — הקשר לשיחה חדשה

## זהות ופרויקט
- **מה:** כלי מעקב תשואות קרנות — white-label פנימי ל-GREEN Wealth Management + NOX
- **Stack:** Next.js 15.5.14 (App Router), TypeScript, Tailwind CSS, Recharts, Vercel KV (Redis)
- **Production:** `https://fund-tracker-zeta.vercel.app`
- **Repo:** `https://github.com/bren242/fund-tracker`
- **Routes:** `/{client}` (report), `/{client}/charts`, `/{client}/compare`, `/{client}/admin`, `/{client}/fund-status`, `/{client}/upload`, `/{client}/consistency`
- **Clients:** `green` (full features + AI parser), `nox` (basic)
- **Auth:** `admin2026` (client admin), `super2026` (super admin)
- **Local dev:** JSON files under `data/{clientKey}/`. Prod: Vercel KV.

---

## כללי עבודה
1. **מינימל** — שינויים מינימליים בלבד. אין refactor מעבר למה שנדרש
2. **שורש הבעיה קודם** — לזהות WHY לפני תיקון
3. **תיקון אחד בכל פעם** — לא לערום שינויים
4. **לא לדחוף לפני ווידוא** — לבנות ולבדוק לפני push
5. **לא לחפור פעמיים באותו כיוון** — אם נתקע >2 ניסיונות, לעצור ולשנות גישה
6. **Print is sacred** — לא לשבור layouts של הדפסה
7. **לא למזג ל-main ללא אישור** — תמיד לחכות לאישור מפורש

---

## מצב נוכחי
- **Cache version:** v56
- **Main branch:** עדכני — deploy 2026-05-10 (AppHeader redesign)
- **Tests:** 99/99 passing (4 test files)

---

## מה הושלם בשיחה זו (2026-05-10)

### AppHeader redesign + /[client] sticky layout
מלא — ראה CHANGELOG.md `[unreleased] — 2026-05-10` לפרטים מלאים.

**עיקר השינויים:**
- `components/AppHeader.tsx`: שורה לבנה 52px במקום dark nav bar. Logo + nav tabs + print button
- `components/FundTableV2.tsx`: 2 שורות controls sticky ב-top:52. SegmentedControl תמיד מוצג. `overflow: clip` על table wrapper. `<th>` sticky ב-top:136
- `app/page.tsx`: הוסר div עם print button (עם הgap שגרם)
- `app/globals.css`: import Cormorant Garamond (Google Fonts)

**Sticky stack:**
- AppHeader: `position: sticky, top: 0, z: 100`
- Controls wrapper: `position: sticky, top: 52, z: 99`
- `<th>`: `position: sticky, top: 136` (52+44+40)

**חשוב — למה `overflow: clip`:**
`overflow: auto` יוצר scroll container — sticky `<th>` מתייחס לו ולא לviewport. `overflow: clip` חוסם ויזואלית בלי ליצור scroll container → sticky עובד כמו שצריך.

---

## מה פתוח לטיפול — לפי עדיפות

1. **84 vs 81 inconsistency** — 3 קרנות כפולות: Fund Access ASPM Apollo, ואר אקוויטי, קפלר קפיטל. גם: בירור טיפול ב-`active=false` בספירות

2. **Navigation links audit** — לבדוק כל נתיבי ניווט ברחבי האפליקציה

3. **Stage B Phases 2-4** (~10h):
   - Phase 2: `app/charts/page.tsx`
   - Phase 3: `app/compare/page.tsx`
   - Phase 4: Analysis, Aggregate, BulkApply API, FundReport API
   - Roadmap: `/tmp/stage-b-roadmap.md`

4. **44 קרנות (Category D)** — ללא `monthlyReturns`. לפרסר מ-PDFs

5. **3 קרנות כפולות** — מיזוג/מחיקה (תלוי ב-#1)

6. **TRIO (fund-24)** — אין `monthlyReturns`, דרוש re-parse

7. **אידאה (fund-eq2-3)** — לאמת `y2019` monthlyReturns (פרסר: 26.08%)

8. **Commit `3d5ff7a`** — bulk-update feature, עדיין local only, לא עלה לremote

9. **Dead code** — `components/FundCard.tsx`, `components/FundTable.tsx` — לא מיובאים בשום מקום

10. **[HIGH] שתי קרנות CLO חסרות currency** — fund-1778317451353-3b9f, fund-1778318344637-aa3r

11. **[MED] Error UX — 402 credit balance banner** — parse route צריך לתפוס 402 ולהציג הודעה ברורה

12. **[LOW] Health check endpoint** — `/api/health/anthropic` לאבחון כשפרסר לא מגיב

13. **Consistency UX** — 4 בעיות UX פתוחות (ממתינות ל-Design Review ייעודי)

---

## החלטות ארכיטקטורה שהתקבלו

### Single Source of Truth: fund.monthlyReturns
כל מדדים מחושבים on-the-fly מ-`monthlyReturns` דרך `lib/metrics.ts`. שדות KV ישנים הם fallback בלבד.

### getLastUpdated(fund) — לא fund.lastUpdated ישיר
```typescript
// lib/fundDerived.ts
getLastUpdated(fund) = computeLatestMonth(fund.monthlyReturns) ?? fund.lastUpdated ?? null
```

### AppHeader sticky layout — top offsets
- AppHeader height: **52px** (top: 0)
- Controls Row 1 height: **44px** (search + SegmentedControl)
- Controls Row 2 height: **40px** (CategoryPills)
- `<th>` sticky top: **136px** = 52 + 44 + 40
- Table wrapper must be `overflow: clip` (not `auto`) for sticky `<th>` to work

### set-delayed-flag PATCH action
`PATCH /api/funds?action=set-delayed-flag` עם `{ fundId, delayed: boolean }` — לא `/api/funds/${fundId}`

### StatusKey — 3 סטטוסים בלבד
`"updated" | "waiting" | "delay"` — תמיד `updated+waiting+delay===total`

### KV: delayed, לא reportingDelay
השדה `reportingDelay` נמחק מ-KV ומ-types. השדה הנכון הוא `delayed: boolean`.

---

## קבצים / רכיבים מרכזיים

| קובץ | תפקיד |
|------|-------|
| `components/AppHeader.tsx` | Header: שורה לבנה 52px — logo + nav + print |
| `components/FundTableV2.tsx` | טבלת קרנות: 2-row sticky controls + sticky th |
| `app/page.tsx` | דף ראשי — FundTableV2 + PrintReport |
| `app/globals.css` | CSS גלובלי + Cormorant Garamond import |
| `lib/types.ts` | Fund interface — `delayed?: boolean` |
| `lib/metrics.ts` | 9 pure metric functions (Stage A) |
| `lib/constants.ts` | `RISK_FREE_RATE_ANNUAL`, `SHARPE_CAP`, `MIN_MONTHS_FOR_RISK_METRICS` |
| `lib/fundDerived.ts` | `getLastUpdated(fund)`, `getFundMetrics(fund)` |
| `app/api/funds/route.ts` | CRUD + PATCH actions |
| `app/fund-status/page.tsx` | סטטוס עדכון קרנות + MTD inline form |
| `app/admin/page.tsx` | Admin panel — brand, funds, AI parser |
| `app/api/parse/route.ts` | AI Parser (Three-Pass) |
| `lib/storage.ts` | `storageRead` / `storageWrite` — KV/filesystem abstraction |
| `lib/clientKey.ts` | `CLIENT_KEYS` — מקור האמת ללקוחות |
| `__tests__/metrics.test.ts` | 32 unit tests לפונקציות Stage A |

### PATCH actions ב-/api/funds
```
set-currency          → { fundId, currency: "ILS"|"USD" }
set-manager           → { fundId, manager: string }
set-last-updated      → { fundId, lastUpdated: "YYYY-MM" }
set-monthly-return    → { fundId, month: "YYYY-MM", value: number }
delete-monthly-return → { fundId, month: "YYYY-MM" }
set-delayed-flag      → { fundId, delayed: boolean }
```

---

## כללי זהב טכניים — לא לשבור

- **לא לקרוא `fund.lastUpdated` ישיר** — תמיד `getLastUpdated(fund)`
- **לא ליצור route `/api/funds/[id]`** — לא קיים ולא צריך
- **לא להשתמש ב-`reportingDelay`** — נמחק. שמש ב-`delayed`
- **`npm run build` + `npx vitest run` לפני כל push** — build חייב לעבור, 99/99 tests
- **לא לדחוף ל-main ללא אישור**
- **`overflow: clip` על table wrapper** — לא לשנות ל-`auto` (ישבור sticky th)
- **AppHeader height = 52, Row1 = 44, Row2 = 40** — לא לשנות ללא עדכון `top: 136` ב-`<th>`

---

## בעיות שנפתרו — לא לגעת

| בעיה | פתרון | מתי |
|------|--------|-----|
| White gap בין AppHeader לcontrols | הוסר div עם padding ב-`app/page.tsx` | 2026-05-10 |
| Year selector מופיע בcontrols bar ל-NOX | הוסרה הלוגיקה isYearMode בcontrols bar | 2026-05-10 |
| `toggleDelay` קרא ל-`/api/funds/${id}` שלא קיים | PATCH `set-delayed-flag` ב-`/api/funds` | 2026-05-09 |
| ספירות סיכום לא מסתכמות ל-total | 3 סטטוסים: updated+waiting+delay | 2026-05-09 |
| `reportingDelay` ו-`delayed` שניהם ב-KV | migration script, 10 קרנות GREEN | 2026-05-09 |
| LLM non-determinism בטבלאות RTL | `fixAnnualJanSwapPerYear` + `temperature: 0` | קודם |
| Dec header → YTD (בפרסר) | MONTH_ALIASES לפני YTD_ALIASES | v39 |
| Sharpe ∞ בקרנות אג"ח יציבות | `SHARPE_CAP=5`, sample stdDev | Stage A |

---

*עודכן: 2026-05-10 | Cache v56 | tests: 99/99*
