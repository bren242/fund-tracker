import type { CmpFund, CmpWindow, CmpWM } from "./types";
import { FUND_ACCENTS } from "./types";

function fmtPct(v: number | null, d = 1): string {
  if (v == null) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(d) + "%";
}
function fmtCapture(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(0) + "%";
}
function fmtRatio(a: number, b: number): string {
  return b === 0 ? "—" : `${a}/${b}`;
}

interface MetricDef {
  label: string;
  getValue: (w: CmpWM) => number | null;
  format: (w: CmpWM) => string;
  higherIsBetter: boolean;
}

const METRICS: MetricDef[] = [
  {
    label: "חודשים מעל בנצ׳מרק",
    getValue: (w) => w.monthsAboveBenchmark.total > 0 ? w.monthsAboveBenchmark.count / w.monthsAboveBenchmark.total : null,
    format: (w) => fmtRatio(w.monthsAboveBenchmark.count, w.monthsAboveBenchmark.total),
    higherIsBetter: true,
  },
  {
    label: "Up Capture",
    getValue: (w) => w.upCapture,
    format: (w) => fmtCapture(w.upCapture),
    higherIsBetter: true,
  },
  {
    label: "Down Capture",
    getValue: (w) => w.downCapture,
    format: (w) => fmtCapture(w.downCapture),
    higherIsBetter: false,
  },
  {
    label: "ירידה מקסימלית",
    getValue: (w) => w.maxDrawdown.drawdownPct !== 0 ? w.maxDrawdown.drawdownPct : null,
    format: (w) => w.maxDrawdown.drawdownPct !== 0 ? fmtPct(w.maxDrawdown.drawdownPct) : "—",
    higherIsBetter: false,
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
                <td className="cmp-ptd-label">{metric.label}</td>
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
