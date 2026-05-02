interface WorstMonthProps {
  monthLabel: string;
  fundName: string;
  fundReturn: number;
  categoryAvg: number | null;
  benchmarkReturn: number;
  benchmarkName: string;
  narrative: string;
}

function fmtPct(v: number): string {
  const pct = (v * 100).toFixed(1);
  return v >= 0 ? `+${pct}%` : `${pct}%`;
}

function valueClass(v: number): string {
  if (Math.abs(v) < 0.0001) return "v2-bar-value zero";
  if (v > 0) return "v2-bar-value pos";
  return "v2-bar-value";
}

export default function WorstMonth({
  monthLabel, fundName, fundReturn, categoryAvg, benchmarkReturn, benchmarkName, narrative
}: WorstMonthProps) {
  return (
    <div className="v2-worst-month">
      <div className="v2-worst-when">{monthLabel}</div>
      <div className="v2-worst-bars">
        <div className="v2-bar-row primary">
          <div className="v2-bar-label">
            <span className="v2-bar-swatch" />
            <span>{fundName}</span>
          </div>
          <div className={valueClass(fundReturn)}>{fmtPct(fundReturn)}</div>
        </div>
        {categoryAvg != null && (
          <div className="v2-bar-row">
            <div className="v2-bar-label">
              <span className="v2-bar-swatch" />
              <span>ממוצע הקטגוריה</span>
            </div>
            <div className={valueClass(categoryAvg)}>{fmtPct(categoryAvg)}</div>
          </div>
        )}
        <div className="v2-bar-row benchmark">
          <div className="v2-bar-label">
            <span className="v2-bar-swatch" />
            <span>בנצ׳מרק ({benchmarkName})</span>
          </div>
          <div className={valueClass(benchmarkReturn)}>{fmtPct(benchmarkReturn)}</div>
        </div>
      </div>
      {narrative && <div className="v2-worst-conclusion">{narrative}</div>}
    </div>
  );
}
