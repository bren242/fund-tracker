import type { CmpFund, CmpWindow, CmpWM } from "./types";
import { FUND_ACCENTS } from "./types";
import { Tooltip } from "../Tooltip";

function fmtCapture(v: number | null): string {
  if (v == null) return "—";
  return Math.abs(v).toFixed(0) + "%";
}
function fmtRatio(a: number, b: number): string {
  if (b === 0) return "—";
  return `${Math.max(0, a)}/${b}`;
}

interface MetricDef {
  label: string;
  tooltip: string;
  getValue: (w: CmpWM) => number | null;
  format: (w: CmpWM) => string;
  higherIsBetter: boolean;
}

const METRICS: MetricDef[] = [
  {
    label: "חודשים מעל בנצ׳מרק",
    tooltip: "מספר החודשים שבהם תשואת הקרן עלתה על הבנצ׳מרק, מתוך סך חודשי חלון הזמן.",
    getValue: (w) => w.monthsAboveBenchmark.total > 0 ? w.monthsAboveBenchmark.count / w.monthsAboveBenchmark.total : null,
    format: (w) => fmtRatio(w.monthsAboveBenchmark.count, w.monthsAboveBenchmark.total),
    higherIsBetter: true,
  },
  {
    label: "Up Capture",
    tooltip: "אחוז מתשואת הבנצ׳מרק שהשיגה הקרן בחודשי עליה. מעל 100% — הקרן עלתה יותר.",
    getValue: (w) => w.upCapture,
    format: (w) => fmtCapture(w.upCapture),
    higherIsBetter: true,
  },
  {
    label: "Down Capture",
    tooltip: "אחוז מירידת הבנצ׳מרק שספגה הקרן בחודשי ירידה. מתחת ל-100% — הגנה טובה יותר.",
    getValue: (w) => w.downCapture,
    format: (w) => fmtCapture(w.downCapture),
    higherIsBetter: false,
  },
  {
    label: "ירידה מקסימלית",
    tooltip: "הירידה המרבית מנקודת שיא לשפל בתקופה.",
    getValue: (w) => w.maxDrawdown.drawdownPct !== 0 ? w.maxDrawdown.drawdownPct : null,
    format: (w) => {
      const v = w.maxDrawdown.drawdownPct;
      return v !== 0 ? `-${Math.abs(v).toFixed(1)}%` : "—";
    },
    higherIsBetter: true,
  },
];

export default function CompareProfile({
  funds,
  window,
}: {
  funds: CmpFund[];
  window: CmpWindow;
}) {
  const windows: (CmpWM | null)[] = funds.map((f) => f.windows[window]);

  return (
    <div className="cmp-profile-wrap">
      <div className="cmp-section-label">מדדי איכות — {window === "YTD" ? "מ׳ השנה" : window}</div>
      <table className="cmp-profile-table">
        <thead>
          <tr>
            <th className="cmp-ptd-metric" />
            {funds.map((f, i) => (
              <th key={f.id} className="cmp-pth-fund">
                <span className="cmp-dot" style={{ background: FUND_ACCENTS[i] }} />
                {f.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRICS.map((metric) => {
            const values = windows.map((w) => (w ? metric.getValue(w) : null));
            const validValues = values.filter((v): v is number => v != null);
            const bestVal  = validValues.length > 0 ? (metric.higherIsBetter ? Math.max(...validValues) : Math.min(...validValues)) : null;
            const worstVal = validValues.length > 1 ? (metric.higherIsBetter ? Math.min(...validValues) : Math.max(...validValues)) : null;

            return (
              <tr key={metric.label} className="cmp-ptr">
                <td className="cmp-ptd-label">
                  <Tooltip text={metric.tooltip} />
                  {metric.label}
                </td>
                {funds.map((f, i) => {
                  const w = windows[i];
                  const val = w ? metric.getValue(w) : null;
                  const text = w ? metric.format(w) : "—";
                  const isBest  = val != null && val === bestVal;
                  const isWorst = val != null && val === worstVal && worstVal !== bestVal;

                  return (
                    <td key={f.id} className={`cmp-ptd${isBest ? " cmp-ptd-best" : isWorst ? " cmp-ptd-worst" : ""}`}>
                      {isBest && <span className="cmp-best-dot">●</span>}
                      {text}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
