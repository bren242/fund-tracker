import type { CmpFund, CmpWindow, CmpWM } from "./types";
import { FUND_ACCENTS } from "./types";

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(1) + "%";
}
function fmtIR(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(2);
}
function fmtRatio(a: number, b: number): string {
  return b === 0 ? "—" : `${a}/${b}`;
}

function irCls(v: number | null): string {
  if (v == null) return "cmp-metric-muted";
  if (v >= 0.5) return "cmp-metric-pos";
  if (v < 0)   return "cmp-metric-neg";
  return "cmp-metric-neu";
}
function retCls(v: number | null): string {
  if (v == null) return "cmp-metric-muted";
  return v > 0 ? "cmp-metric-pos" : v < 0 ? "cmp-metric-neg" : "cmp-metric-neu";
}

// Rank among selected funds by IR in chosen window
function rankByIR(funds: CmpFund[], window: CmpWindow): Map<string, number> {
  const sorted = [...funds]
    .map((f) => ({ id: f.id, ir: (f.windows[window] as CmpWM | null)?.informationRatio ?? null }))
    .filter((x) => x.ir != null)
    .sort((a, b) => (b.ir ?? 0) - (a.ir ?? 0));
  const map = new Map<string, number>();
  sorted.forEach((x, i) => map.set(x.id, i + 1));
  return map;
}

function formatInception(m: string): string {
  if (!m) return "";
  const [y, mo] = m.split("-");
  return `${mo}/${y}`;
}

export default function CompareHeadline({
  funds,
  window,
}: {
  funds: CmpFund[];
  window: CmpWindow;
}) {
  const ranks = rankByIR(funds, window);

  return (
    <div className="cmp-headline-grid">
      {funds.map((fund, i) => {
        const w: CmpWM | null = fund.windows[window];
        const accent = FUND_ACCENTS[i];
        const rank = ranks.get(fund.id);

        return (
          <div key={fund.id} className="cmp-card" style={{ "--accent": accent } as React.CSSProperties}>
            <div className="cmp-card-accent" />

            {rank && (
              <div className="cmp-rank-badge">
                דירוג #{rank} מתוך {funds.length}
              </div>
            )}

            <div className="cmp-card-name">{fund.name}</div>
            <div className="cmp-card-inception">
              פעילה מ-{formatInception(fund.inceptionMonth)} · {fund.monthsActive} חו׳
            </div>

            <div className={`cmp-card-return ${retCls(w?.fundReturn ?? null)}`}>
              {w ? fmtPct(w.fundReturn) : "—"}
            </div>
            <div className="cmp-card-return-label">תשואה מצטברת</div>

            <div className="cmp-card-metrics">
              <div className="cmp-mini-metric">
                <span className="cmp-mini-label">עודף</span>
                <span className={`cmp-mini-value ${retCls(w?.excessReturn ?? null)}`}>
                  {fmtPct(w?.excessReturn ?? null)}
                </span>
              </div>
              <div className="cmp-mini-metric">
                <span className="cmp-mini-label">IR</span>
                <span className={`cmp-mini-value ${irCls(w?.informationRatio ?? null)}`}>
                  {fmtIR(w?.informationRatio ?? null)}
                </span>
              </div>
              <div className="cmp-mini-metric">
                <span className="cmp-mini-label">מעל בנצ׳</span>
                <span className="cmp-mini-value">
                  {w ? fmtRatio(w.monthsAboveBenchmark.count, w.monthsAboveBenchmark.total) : "—"}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
