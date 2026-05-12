# Period Coverage — שיטת חישוב התשואות

> קובץ: `lib/period-coverage.ts`  
> נוצר: 2026-05-12

---

## הבעיה שהביאה לכאן

קרן עם 40 חודשי היסטוריה (ינואר 2023–אפריל 2026) הציגה "5Y = 193.2%".
המספר נכון מבחינת compound — אבל ה-label שקרי: אין 5 שנות נתונים.

בנוסף, קרן עם 36M=210.8% ו-5Y=193.2% נראתה כ-"באג מתמטי". בפועל:
- 36M חותך מ-מאי 2023 — **אחרי** תקופת הפסד ינואר–אפריל 2023
- 5Y כולל את הפסדי תחילת 2023
- אין באג. זו תוצאה לגיטימית של חלון שמתחיל מאוחר יותר

---

## הלוגיקה

### `computePeriodWithCoverage()`

```typescript
computePeriodWithCoverage(
  monthlyReturns: Record<string, number> | undefined,
  fromYearMonth: string | null,   // "2021-05" | null for MAX
  toYearMonth: string,            // "2026-05"
  requestedLabel: "YTD" | "12M" | "3Y" | "5Y" | "MAX",
  expectedMonths: number          // 12/36/60/0. YTD: ignored internally
): PeriodResult
```

### Coverage thresholds

| actual / expected | Status | Label |
|-------------------|--------|-------|
| ≥ 95% | `full` | label רגיל ("5Y") |
| 50–94% | `partial` | כתום ("40M · מ-01/2023") |
| < 50% | `insufficient` | "—" (value = null) |

### חריגים

**YTD:** `expectedMonths` מחושב פנימית כ-`month(toYearMonth) − 1`  
לדוגמה: toYearMonth="2026-05" → expected=4 (ינואר–אפריל הושלמו; מאי עדיין פתוח)  
פונד עם 4/4 חודשים → full. פונד עם 2/4 → partial.

**MAX:** `expectedMonths = monthsActual`. Coverage תמיד 1.0. Status תמיד `full` (אם יש נתונים).

### ערכי החזרה (`PeriodResult`)

```typescript
{
  value: number | null;       // compound decimal (0.77 = 77%). null אם insufficient
  cagr: number | null;        // (1+compound)^(12/actual) − 1. null אם value null
  monthsActual: number;       // חודשים שנמצאו בחלון
  monthsExpected: number;     // חודשים מצופים (0 for MAX/YTD-edge)
  coverage: number;           // actual/expected (0–1)
  status: CoverageStatus;     // "full" | "partial" | "insufficient"
  effectiveFromYM: string | null; // "2023-01" — תחילת הנתונים בחלון
  effectiveLabel: string;     // "5Y" | "40M · מ-01/2023" | ""
}
```

---

## Iron Rule #12

> **כל חישוב period return במערכת חייב לעבור דרך `computePeriodWithCoverage`.**  
> לא להכניס חישובי תקופה ad-hoc ב-components או pages.  
> הפונקציה היא single source of truth.

### סיבה
לפני הפונקציה, `FundTableV2` ו-`analysis/page.tsx` חישבו period returns עצמאית — שני implementations שונים, ללא coverage check. תוצאה: קרן עם 40 חודשים הציגה "5Y" בשקט.

---

## שימוש ב-components

### FundTableV2.tsx
```typescript
const pr = computePeriodWithCoverage(
  fund.monthlyReturns,
  range.from,       // RANGES[timeRange].from
  range.to,         // RANGES[timeRange].to
  re.label,         // RANGE_EXPECTED[timeRange].label
  re.months,        // RANGE_EXPECTED[timeRange].months
);
// periodReturn = pr.value (decimal)
// periodSubLabel = pr.effectiveLabel בכתום אם partial
// ממוצע שנתי = pr.cagr
```

### app/analysis/page.tsx
```typescript
const result = calcPeriodResult(fund, sortKey); // wraps computePeriodWithCoverage
// value * 100 for display
// result.status === "partial" → amber sub-label below the number
```

---

## טסטים

קובץ: `__tests__/period-coverage.test.ts` — 12 test cases

| # | תרחיש | ציפייה |
|---|-------|--------|
| 1 | 60/60 חודשים | full, label="5Y", CAGR נכון |
| 2 | 40/60 חודשים | partial, label="40M · מ-01/2023" |
| 3 | 20/60 חודשים | insufficient, value=null |
| 4 | בדיוק 50% (30/60) | partial |
| 5 | 95% (57/60) | full |
| 6 | MAX עם 5 חודשים | full, expected=actual |
| 7 | מפתחות ריקים/undefined | insufficient |
| 8 | YTD מאי + 4 חודשים | full (4/4=100%) |
| 9 | YTD מאי + 2 חודשים | partial (2/4=50%) |
| + | formatYM, formatDuration | format helpers |
