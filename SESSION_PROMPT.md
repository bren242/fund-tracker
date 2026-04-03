# Session Prompt — Fund Tracker

העבר את כל המסמך הזה כפרומפט לסשן חדש של Claude Code.

---

## הקשר

אתה עובד על **Fund Tracker** — אפליקציית white-label למעקב קרנות השקעה.
הפרויקט חי בפרודקשן, עובד, יציב. **אסור לשבור שום דבר קיים.**

קרא את הקבצים הבאים לפני שאתה מתחיל לעבוד:
- `CLAUDE.md` — הקשר מלא על הפרויקט
- `AI_DEV_RULES.md` — כללי פיתוח קריטיים (בעיקר print)
- `PROJECT_STATE.md` — סטטוס פיצ'רים ו-QA
- `AI_PARSER.md` — מסמך טכני של ה-parser

---

## Stack

| רכיב | טכנולוגיה |
|-------|-----------|
| Framework | Next.js 15.5.14, App Router, TypeScript |
| Styling | Tailwind CSS + CSS Variables + Inline styles |
| Charts | Recharts (fixed dimensions for print) |
| Storage | Vercel KV (prod) / JSON files (dev) — via `lib/storage.ts` |
| AI | Claude API (claude-sonnet-4-20250514), Vision API for PDF/images |
| Deploy | Vercel, auto-deploy on push to main |
| Direction | RTL (Hebrew), `<html lang="he" dir="rtl">` |

---

## מבנה תיקיות

```
fund-tracker/
├── app/
│   ├── layout.tsx              ← Root layout (RTL, ThemeProvider)
│   ├── globals.css             ← Design tokens, dark/light, print CSS
│   ├── page.tsx                ← Main report page (/{client})
│   ├── admin/page.tsx          ← Admin dashboard (~4150 lines, monolith)
│   ├── charts/page.tsx         ← Scatter plot + print
│   ├── compare/page.tsx        ← Fund comparison + print
│   ├── upload/page.tsx         ← Mobile PDF upload
│   ├── not-found.tsx           ← Custom 404
│   └── api/
│       ├── parse/route.ts      ← AI Parser (~1885 lines, monolith)
│       ├── funds/route.ts      ← Fund CRUD
│       ├── brand/route.ts      ← Brand config
│       ├── client-auth/route.ts ← Client password auth
│       └── benchmarks/route.ts  ← Benchmark data
├── components/
│   ├── ClientGate.tsx          ← Password gate wrapper
│   ├── FundTable.tsx           ← Main fund table (screen)
│   ├── PrintReport.tsx         ← Print-only fund table
│   ├── FilterBar.tsx           ← Cascading filters
│   ├── BrandLogo.tsx           ← Logo with light/dark variants
│   ├── ThemeProvider.tsx       ← Dark/light theme context
│   ├── PasswordInput.tsx       ← Password input UI
│   ├── CompareTable.tsx        ← Comparison table
│   ├── CompareCharts.tsx       ← Comparison line chart
│   └── CompareSummary.tsx      ← Comparison summary card
├── lib/
│   ├── types.ts                ← Fund, Category, Benchmark, FundsData
│   ├── parseTypes.ts           ← ParseDraft, ParsedField, ParseLogEntry
│   ├── storage.ts              ← KV/filesystem abstraction
│   ├── format.ts               ← pct(), num(), returnColor(), formatDate()
│   ├── useBrand.ts             ← Brand config hook (client-side)
│   ├── useClientKey.ts         ← Client key from URL (client-side)
│   ├── clientKey.ts            ← Client key utils (server-side)
│   ├── clientPaths.ts          ← Data path resolution
│   ├── colors.ts               ← Color utilities
│   ├── constants.ts            ← App constants
│   ├── disclaimer.ts           ← Default disclaimer text
│   ├── useFilters.ts           ← Filter state management
│   ├── reportGroups.ts         ← Report grouping logic
│   └── aggregate.ts            ← Data aggregation
├── config/
│   └── brand.ts                ← BrandConfig type + DEFAULT_BRAND
├── data/
│   ├── green/                  ← GREEN client data (funds.json, brand.json)
│   ├── nox/                    ← NOX client data
│   └── backups/                ← Auto-backups
├── middleware.ts               ← Client routing (/green → /?client=green)
└── [documentation .md files]
```

---

## Types — הבסיס

### Fund
```typescript
interface Fund {
  id: string;
  name: string;
  classification: string;
  startDate: string | null;
  manager: string;
  lastReportDate: string | null;
  monthlyReturn: number | null;         // decimal (0.023 = 2.3%)
  returns: {
    ytd2026: number | null;
    y2025: number | null;
    y2024: number | null;
    y2023: number | null;
    y2022: number | null;
    y2021: number | null;
    y2020: number | null;
    y2019: number | null;
  };
  avgAnnualReturn: number | null;
  sharpe: number | null;
  stdDev: number | null;
  aumMillions: number | null;
  active?: boolean;
  monthlyReturns?: Record<string, number>;  // "2025-01": 0.023
}
```

### Category & FundsData
```typescript
interface Category {
  id: string;
  name: string;
  parentSection: string;    // grouping level above category
  funds: Fund[];
}

interface FundsData {
  lastUpdated: string;      // "2026-02-28"
  categories: Category[];
  adminPassword?: string;
  superAdminPassword?: string;
}
```

### BrandConfig
```typescript
interface BrandConfig {
  name: string;
  fullName: string;
  logo: string;
  logoLight: string;
  logoDark: string;
  primaryColor: string;     // "#1a365d"
  secondaryColor: string;   // "#2d4a7a"
  accentColor: string;      // "#c8a96b"
  mainTitle: string;        // "מעקב קרנות השקעה"
  subtitleMode: "auto" | "custom";
  customSubtitle: string;
  footerDisclaimer: string;
  showCredit: boolean;
  creditText: string;
  version: string;
  defaultAppearance: "light" | "dark";
  features: AppFeatures;
}

interface AppFeatures {
  comparison: boolean;
  comparisonMode?: "basic" | "advanced";
  chartPage: boolean;
  aiParser?: boolean;
  mobileUpload?: boolean;
  desktopUpload?: boolean;
  excelUpload?: boolean;
  manualUpload?: boolean;
  emailUpload?: boolean;
  benchmarks?: boolean;
}
```

---

## ארכיטקטורה — 3 קבצים קריטיים

האפליקציה בנויה סביב 3 קבצים גדולים. **אין לפרק אותם.** זה הסגנון של הפרויקט.

### 1. `app/admin/page.tsx` (~4150 שורות)
- **Client component** (`"use client"`)
- כל ממשק הניהול בקובץ אחד
- טאבים: `data` | `funds` | `branding` | `settings` | `monthly-history` | `ai-parser` | `benchmarks`
- Auth: `handleLogin()` → `setRole("super" | "admin")`
- AI Parser tab: input → parse → review drafts → diff → apply/reject
- כל ה-state מנוהל ב-useState/useCallback (לא Redux, לא Zustand)

### 2. `app/api/parse/route.ts` (~1885 שורות)
- **כל לוגיקת ה-parser** בקובץ אחד
- `GET` — drafts, log, token-usage
- `POST` — parse (text), parse-file (PDF/image), save-draft, apply, reject, check-collision, undo
- פונקציות פנימיות חשובות:
  - `buildSystemPrompt()` — בונה את הפרומפט ל-Claude
  - `parseCloudeResponse()` — מפרסר את תשובת Claude + swap correction
  - `fixAnnualJanSwapPerYear()` — תיקון swap שנתי/ינואר
  - `callClaudeText()` / `callClaudeVision()` — קריאות API
  - `isAuthorized()` — בדיקת הרשאות (header: `x-admin-password`)

### 3. `app/page.tsx` — Main report
- Client component עם FundTable + FilterBar + PrintReport
- Print trigger via `window.print()`

---

## מערכת עיצוב

### CSS Variables (globals.css)

**Light mode:**
```css
--bg-page: #f5f6f8;
--bg-surface: #ffffff;
--bg-surface-alt: #f8f9fb;
--bg-header: #0f1b2d;
--bg-section: #1a365d;
--border: #dfe3e8;
--text-primary: #1a1f2b;
--text-secondary: #5a6577;
--text-muted: #8893a4;
--accent: #c8a45e;          /* gold */
--positive: #0d7c4a;        /* green */
--negative: #c42b2b;        /* red */
--shadow-card: 0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.03);
```

**Dark mode (.dark):**
```css
--bg-page: #0d1117;
--bg-surface: #161b22;
--bg-surface-alt: #1c2230;
--border: #2a3244;
--text-primary: #e2e6ea;
--accent: #d4b06e;
--positive: #34d399;
--negative: #f87171;
```

### Font
```css
font-family: "Segoe UI", "Arial", sans-serif;
```

### RTL
- Global: `html { direction: rtl; }`
- Layout: `<html lang="he" dir="rtl">`
- כל padding/margin/text-align מתהפכים אוטומטית

### Inline Styles
רוב ה-UI בנוי ב-**inline styles** (לא Tailwind classes):
```tsx
<div style={{
  backgroundColor: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "16px 20px",
  color: "var(--text-primary)",
}}>
```

Tailwind משמש בעיקר ל-layout בסיסי ו-globals.css.

### Button Patterns
```tsx
// Primary action
style={{
  backgroundColor: brand.primaryColor,  // or "#059669" for green
  color: "#fff",
  fontWeight: 600,
  padding: "8px 20px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontSize: 13,
}}

// Secondary / outline
style={{
  backgroundColor: "var(--bg-surface-alt)",
  color: "#3b82f6",
  border: "1px solid #3b82f630",
  borderRadius: 8,
  padding: "8px 20px",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
}}

// Danger
style={{
  backgroundColor: "var(--bg-surface-alt)",
  color: "#ef4444",
  border: "1px solid #ef444430",
  ...
}}
```

### Card Pattern
```tsx
<div style={{
  backgroundColor: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 20,
  boxShadow: "var(--shadow-card)",
}}>
```

### Status Badge Pattern
```tsx
// Success
<span style={{
  backgroundColor: "#059669",
  color: "#fff",
  fontSize: 10,
  fontWeight: 700,
  padding: "2px 8px",
  borderRadius: 999,
}}>הצלחה</span>

// Warning
<span style={{
  backgroundColor: "#f59e0b20",
  color: "#f59e0b",
  ...
}}>אזהרה</span>
```

### Return Values Display
```tsx
import { pct, returnColorInline } from "@/lib/format";

<td style={{ color: returnColorInline(fund.monthlyReturn) }}>
  {pct(fund.monthlyReturn)}
</td>
```
- Values stored as decimals: `0.023` = 2.3%
- `pct()` formats to `"2.30%"`, null → `"—"`
- `returnColorInline()` returns `var(--positive)` / `var(--negative)` / `"inherit"`

---

## Routing & Auth

### Client Routing (middleware.ts)
```
/green         → rewrite to /?client=green
/green/admin   → rewrite to /admin?client=green
/green/charts  → rewrite to /charts?client=green
```
Known clients: `green`, `nox` (defined in `lib/clientKey.ts`)

### Auth Model
- **Client pages** (report, charts, compare): `ClientGate` component, password from `funds.json.adminPassword`
- **Admin page**: direct password check → `x-admin-password` header on all API calls
- **AI Parser**: requires `role === "super"` (password: `super2026`)
- **Session**: `sessionStorage` per client key (not cookies, not JWT)

### API Auth Pattern
All admin API calls include:
```typescript
headers: { "x-admin-password": password }
```
Server validates via `isAuthorized(req, clientKey)` → returns `"super" | "admin" | false`

---

## Storage Layer

```typescript
import { storageRead, storageWrite, storageAppend } from "@/lib/storage";

// Read with fallback
const data = await storageRead<FundsData>(`funds:${clientKey}`, defaultData);

// Write
await storageWrite(`funds:${clientKey}`, data);

// Append to array (audit log)
await storageAppend(`parse-log:${clientKey}`, logEntry);
```

**KV keys:**
| Key pattern | Data | Type |
|-------------|------|------|
| `funds:{client}` | Fund data | `FundsData` |
| `brand:{client}` | Brand config | `BrandConfig` |
| `parse-drafts:{client}` | Parser drafts | `ParseDraft[]` |
| `parse-log:{client}` | Audit log | `ParseLogEntry[]` |
| `token-usage:{client}` | API token tracking | `TokenUsageData` |
| `undo-state:{client}` | Last undo snapshot | object |
| `benchmarks:{client}` | Benchmark data | `Benchmark[]` |
| `parse-cache:{client}:{hash}` | Cached parse results | object |

---

## Print System — Critical Rules

**אל תיגע בקוד print בלי לקרוא את `AI_DEV_RULES.md` קודם.**

עיקרי הכללים:
1. **לא flexbox** ב-headers — רק inner `<table>` עם 3 cells
2. **לא `ResponsiveContainer`** — רק fixed width/height ב-charts
3. **לא CSS variables** ב-SVG — רק hex hardcoded
4. **Header ב-`<thead>`** — כדי שיחזור בכל עמוד
5. **Footer ב-`position: fixed; bottom: 0`** — כדי שיופיע בכל עמוד
6. **Spacer row** אחרי header border

---

## Feature Flags

```typescript
brand.features.aiParser       // AI parser tab in admin
brand.features.mobileUpload   // /upload page
brand.features.comparison      // Compare page
brand.features.comparisonMode  // "basic" | "advanced"
brand.features.chartPage       // Charts page
brand.features.benchmarks      // Benchmark comparison
```

Flags stored in `brand.json` per client, toggled in admin settings tab.

---

## AI Parser — Flow Summary

```
Upload PDF/Image or Paste Text
  → Claude API (temperature: 0)
  → parseCloudeResponse() — extract fields + swap correction
  → Return structured result + corrections[]
  → User reviews in draft UI
  → check-collision → diff review (changed/new/same/missing_in_pdf)
  → apply → write to funds.json via KV
  → audit log entry
```

Auto-apply path: if only `new` + `same` fields → skip diff UI → apply directly.
Batch apply: process all safe pending drafts sequentially.

---

## כללי עבודה

1. **אסור לשבור קוד קיים** — כל שינוי חייב להיות backward compatible
2. **Inline styles** — זה הסגנון, תמשיך ככה (לא להמיר ל-Tailwind classes)
3. **עברית** — כל הטקסטים ב-UI בעברית
4. **RTL** — תמיד לזכור שימין הוא שמאל
5. **`"use client"`** — דפי UI הם client components
6. **API routes** — server-side, no `"use client"`
7. **אל תפצל קבצים** — admin/page.tsx ו-parse/route.ts הם monoliths, זה בכוונה
8. **Storage abstraction** — תמיד דרך `storageRead`/`storageWrite`, לעולם לא fs ישירות
9. **Git commit** בסוף כל משימה עם תיאור ברור
10. **עדכן תיעוד** — אם שינית משהו משמעותי, עדכן את ה-MD files

---
