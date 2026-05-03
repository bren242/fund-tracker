import type { CmpFund, CmpWM } from "./types";
import { FUND_ACCENTS } from "./types";

function fmtIR(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(2);
}

function irCellClass(v: number | null): string {
  if (v == null) return "cmp-hm-muted";
  if (v >= 0.5)  return "cmp-hm-high-pos";
  if (v >= 0)    return "cmp-hm-low-pos";
  if (v >= -0.5) return "cmp-hm-low-neg";
  return "cmp-hm-high-neg";
}

const WIN_COLS: { key: "YTD" | "12M" | "24M" | "36M"; label: string }[] = [
  { key: "YTD",  label: "YTD" },
  { key: "12M",  label: "12 חו׳" },
  { key: "24M",  label: "24 חו׳" },
  { key: "36M",  label: "36 חו׳" },
];

export default function CompareHeatmap({ funds }: { funds: CmpFund[] }) {
  return (
    <div className="cmp-heatmap-wrap">
      <div className="cmp-section-label">Information Ratio — כל החלונות</div>
      <table className="cmp-heatmap">
        <thead>
          <tr>
            <th className="cmp-hm-th-fund" />
            {WIN_COLS.map((col) => (
              <th key={col.key} className="cmp-hm-th">{col.label}</th>
            ))}
            <th className="cmp-hm-th cmp-hm-th-sep">ITD</th>
          </tr>
        </thead>
        <tbody>
          {funds.map((fund, i) => {
            const itd: CmpWM | null = fund.itd;
            return (
              <tr key={fund.id} className="cmp-hm-row">
                <td className="cmp-hm-fund">
                  <span className="cmp-dot" style={{ background: FUND_ACCENTS[i] }} />
                  {fund.name}
                </td>
                {WIN_COLS.map(({ key }) => {
                  const w: CmpWM | null = fund.windows[key];
                  const ir = w?.informationRatio ?? null;
                  return (
                    <td key={key} className={`cmp-hm-cell ${irCellClass(ir)}`}>
                      <span className="cmp-hm-ir">{fmtIR(ir)}</span>
                      {w && <span className="cmp-hm-months">{w.monthsCount} חו׳</span>}
                    </td>
                  );
                })}
                <td className={`cmp-hm-cell cmp-hm-cell-itd ${irCellClass(itd?.informationRatio ?? null)}`}>
                  <span className="cmp-hm-ir">{fmtIR(itd?.informationRatio ?? null)}</span>
                  {itd && <span className="cmp-hm-months">{itd.monthsCount} חו׳</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
