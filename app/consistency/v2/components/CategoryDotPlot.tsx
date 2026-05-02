const SVG_W = 800, SVG_H = 200;
const AX1 = 40, AX2 = 780, AXY = 140;
const AXW = AX2 - AX1;

interface DotFund { fundId: string; ir: number }

interface CategoryDotPlotProps {
  funds: DotFund[];
  thisFundId: string;
  fundName: string;
  avgIR: number;
  categoryName: string;
  fundCount: number;
}

function computeAxis(irs: number[]): { minAxis: number; maxAxis: number; ticks: number[] } {
  if (!irs.length) return { minAxis: 0, maxAxis: 1.0, ticks: [0, 0.25, 0.5, 0.75, 1.0] };
  const minIR = Math.min(...irs);
  const maxIR = Math.max(...irs);

  if (minIR >= -0.05) {
    const top = Math.max(1.0, Math.ceil(maxIR * 4) / 4);
    const ticks = [0, 0.25, 0.5, 0.75, top];
    return { minAxis: 0, maxAxis: top, ticks: [...new Set(ticks)] };
  }

  const minAxis = Math.floor(minIR * 4) / 4 - 0.25;
  const maxAxis = Math.max(1.0, Math.ceil(maxIR * 4) / 4 + 0.25);
  const ticks: number[] = [];
  let t = minAxis;
  while (t <= maxAxis + 0.001) {
    ticks.push(Math.round(t * 100) / 100);
    t = Math.round((t + 0.25) * 1000) / 1000;
  }
  return { minAxis, maxAxis, ticks };
}

function xFor(ir: number, min: number, max: number) {
  return AX1 + ((ir - min) / (max - min)) * AXW;
}

function fmtTick(v: number) {
  const r = Math.round(v * 100) / 100;
  return r === Math.floor(r) ? r.toFixed(1) : r.toFixed(2);
}

export default function CategoryDotPlot({
  funds, thisFundId, fundName, avgIR, categoryName, fundCount
}: CategoryDotPlotProps) {
  if (!funds.length) return null;

  const allIRs = funds.map(f => f.ir);
  const { minAxis, maxAxis, ticks } = computeAxis(allIRs);
  const thisFund = funds.find(f => f.fundId === thisFundId);
  if (!thisFund) return null;

  const xFund = xFor(thisFund.ir, minAxis, maxAxis);
  const xAvg  = xFor(avgIR, minAxis, maxAxis);

  const anchor: "middle" | "end" | "start" =
    xFund > SVG_W - 80 ? "end" : xFund < 80 ? "start" : "middle";
  const lx = anchor === "end" ? xFund - 4 : anchor === "start" ? xFund + 4 : xFund;

  return (
    <div className="v2-dotplot-wrap">
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: "100%", height: "200px" }}
      >
        {/* Axis */}
        <line x1={AX1} y1={AXY} x2={AX2} y2={AXY} stroke="#1a1a1a" strokeWidth={1} />

        {/* Tick marks + labels */}
        {ticks.map(t => {
          const x = xFor(t, minAxis, maxAxis);
          return (
            <g key={t}>
              <line x1={x} y1={AXY} x2={x} y2={AXY + 6} stroke="#1a1a1a" strokeWidth={1} />
              <text x={x} y={AXY + 20} textAnchor="middle" fontFamily="Heebo" fontSize={11} fill="#6b6b6b">
                {fmtTick(t)}
              </text>
            </g>
          );
        })}

        {/* Category average dashed line */}
        {avgIR >= minAxis && avgIR <= maxAxis && (
          <>
            <line x1={xAvg} y1={AXY - 60} x2={xAvg} y2={AXY} stroke="#a8a8a8" strokeWidth={1} strokeDasharray="3,3" />
            <text x={xAvg} y={AXY - 64} textAnchor="middle" fontFamily="Heebo" fontSize={10} fill="#6b6b6b">
              {`ממוצע ${avgIR.toFixed(2)}`}
            </text>
          </>
        )}

        {/* Other funds — gray dots */}
        {funds.filter(f => f.fundId !== thisFundId).map(f => (
          <circle
            key={f.fundId}
            cx={xFor(f.ir, minAxis, maxAxis)}
            cy={AXY}
            r={6}
            fill="#a8a8a8"
            opacity={0.5}
          />
        ))}

        {/* This fund — gold dot with label */}
        <line x1={xFund} y1={AXY - 40} x2={xFund} y2={AXY} stroke="#b8975a" strokeWidth={1.5} />
        <circle cx={xFund} cy={AXY} r={9} fill="#b8975a" />
        <text
          x={lx} y={AXY - 48}
          textAnchor={anchor}
          fontFamily="Frank Ruhl Libre"
          fontSize={16}
          fontWeight="700"
          fill="#0a0a0a"
        >
          {fundName}
        </text>
        <text
          x={lx} y={AXY - 66}
          textAnchor={anchor}
          fontFamily="Heebo"
          fontSize={11}
          fontWeight="500"
          fill="#b8975a"
        >
          {thisFund.ir.toFixed(2)}
        </text>
      </svg>
      <div className="v2-dotplot-axis-label">
        Information Ratio של {fundCount} הקרנות בקטגוריית {categoryName}
      </div>
    </div>
  );
}
