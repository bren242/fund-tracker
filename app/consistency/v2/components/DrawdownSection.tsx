const MONTH_SHORT = ["ינו׳","פבר׳","מרץ","אפר׳","מאי","יוני","יולי","אוג׳","ספט׳","אוק׳","נוב׳","דצ׳"];

function toShort(key: string | null): string {
  if (!key) return "—";
  const [y, mo] = key.split("-").map(Number);
  return `${MONTH_SHORT[mo - 1]} ${String(y).slice(2)}`;
}

function fmtMdd(pct: number): string {
  if (pct === 0) return "ללא ירידה";
  return `${pct.toFixed(1)}%`;
}

function fmtRecovery(r: number | null, drawdownPct: number): string {
  if (drawdownPct === 0) return "—";
  if (r === null) return "טרם התאוששה";
  return `${r} חודשים`;
}

interface MDD {
  drawdownPct: number;
  peakMonthKey: string | null;
  troughMonthKey: string | null;
  durationMonths: number;
  recoveryMonths: number | null;
  monthsAvailable: number;
}

interface DrawdownData { fund: MDD; benchmark: MDD; category: MDD }

interface DrawdownBlockProps {
  label: string;
  data: DrawdownData;
  benchmarkName: string;
}

function DrawdownBlock({ label, data, benchmarkName }: DrawdownBlockProps) {
  const f = data.fund;
  const noData = f.monthsAvailable === 0;
  const noDD   = f.drawdownPct === 0;

  return (
    <div className="v2-dd-block">
      <div className="v2-dd-block-label">{label}</div>

      {noData ? (
        <div className="v2-dd-no-data">אין נתונים</div>
      ) : (
        <>
          <div className={`v2-dd-main${noDD ? " zero" : " negative"}`}>
            {fmtMdd(f.drawdownPct)}
          </div>

          {!noDD && (
            <div className="v2-dd-details">
              <div className="v2-dd-period" dir="ltr">
                {toShort(f.peakMonthKey)} → {toShort(f.troughMonthKey)}
              </div>
              <div className="v2-dd-meta">
                <span>משך: {f.durationMonths} חודשים</span>
                <span>התאוששות: {fmtRecovery(f.recoveryMonths, f.drawdownPct)}</span>
              </div>
            </div>
          )}

          <div className="v2-dd-compare">
            {data.benchmark.monthsAvailable > 0 && (
              <span>{benchmarkName}: {fmtMdd(data.benchmark.drawdownPct)}</span>
            )}
            {data.category.monthsAvailable > 0 && (
              <span>ממוצע קטגוריה: {fmtMdd(data.category.drawdownPct)}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface DrawdownSectionProps {
  drawdownWindow: DrawdownData;
  lifetime: DrawdownData;
  benchmarkName: string;
  windowSize: number;
}

export default function DrawdownSection({ drawdownWindow, lifetime, benchmarkName, windowSize }: DrawdownSectionProps) {
  return (
    <div className="v2-dd-grid">
      <DrawdownBlock
        label={`${windowSize} חודשים`}
        data={drawdownWindow}
        benchmarkName={benchmarkName}
      />
      <DrawdownBlock
        label="כל ההיסטוריה"
        data={lifetime}
        benchmarkName={benchmarkName}
      />
    </div>
  );
}
