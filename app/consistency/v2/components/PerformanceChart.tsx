const SVG_W = 800, SVG_H = 280;
const X_LEFT = 30, X_RIGHT = 780;
const Y_ZERO = 140;
const Y_TOP = 30, Y_BOT = 255;
const AVAIL = Math.min(Y_ZERO - Y_TOP, Y_BOT - Y_ZERO); // 110

interface DataPoint { month: string; shortLabel: string; excessReturn: number }

interface PerformanceChartProps {
  chartData: DataPoint[];
  worstMonthKey: string | null;
  worstMonthShortLabel: string | null;
  bestMonthKey: string | null;
  bestMonthShortLabel: string | null;
  benchmarkName: string;
  fundName: string;
}

function pickTickStep(maxAbs: number): number {
  const target = maxAbs * 0.45;
  for (const s of [0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.05, 0.10]) {
    if (s >= target) return s;
  }
  return 0.10;
}

function fmtPct(v: number): string {
  const pct = (Math.abs(v) * 100).toFixed(1);
  return v >= 0 ? `+${pct}%` : `-${pct}%`;
}

export default function PerformanceChart({
  chartData, worstMonthKey, worstMonthShortLabel, bestMonthKey, bestMonthShortLabel,
  benchmarkName, fundName,
}: PerformanceChartProps) {
  if (!chartData.length) return null;

  const n = chartData.length;
  const excesses = chartData.map(d => d.excessReturn);
  const maxAbsRaw = Math.max(...excesses.map(e => Math.abs(e)));
  const maxAbs = Math.max(maxAbsRaw, 0.02);
  const paddedMax = maxAbs * 1.2;
  const scale = AVAIL / paddedMax;

  const xOf = (i: number) =>
    n === 1 ? (X_LEFT + X_RIGHT) / 2 : X_LEFT + (i * (X_RIGHT - X_LEFT)) / (n - 1);
  const yOf = (e: number) => Y_ZERO - e * scale;

  const pts = chartData.map((d, i) => ({ x: xOf(i), y: yOf(d.excessReturn) }));

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath =
    linePath +
    ` L ${pts[pts.length - 1].x.toFixed(1)},${Y_ZERO} L ${pts[0].x.toFixed(1)},${Y_ZERO} Z`;

  const tickStep = pickTickStep(maxAbs);
  const gridLines = [-2, -1, 1, 2]
    .map(m => m * tickStep)
    .filter(t => { const y = yOf(t); return y > Y_TOP && y < Y_BOT; });

  const worstIdx = worstMonthKey ? chartData.findIndex(d => d.month === worstMonthKey) : -1;
  const bestIdx  = bestMonthKey  ? chartData.findIndex(d => d.month === bestMonthKey)  : -1;

  return (
    <div className="v2-chart-wrap">
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: "100%", height: "280px" }}
      >
        {/* Gridlines */}
        {gridLines.map(t => {
          const y = yOf(t);
          return (
            <g key={t}>
              <line x1={0} y1={y} x2={SVG_W} y2={y} stroke="#e8e6e0" strokeWidth={0.5} strokeDasharray="2,3" />
              <text x={SVG_W - 5} y={y + 4} textAnchor="end" fontFamily="Heebo" fontSize={10} fill="#a8a8a8">
                {fmtPct(t)}
              </text>
            </g>
          );
        })}

        {/* Zero line */}
        <line x1={0} y1={Y_ZERO} x2={SVG_W} y2={Y_ZERO} stroke="#1a1a1a" strokeWidth={1} />
        <text x={SVG_W - 5} y={Y_ZERO + 4} textAnchor="end" fontFamily="Heebo" fontSize={10} fill="#6b6b6b" fontWeight="500">
          0%
        </text>

        {/* Area fill */}
        <path d={areaPath} fill="rgba(184, 151, 90, 0.08)" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="#b8975a"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Worst month marker */}
        {worstIdx >= 0 && (
          <>
            <circle cx={pts[worstIdx].x} cy={pts[worstIdx].y} r={4} fill="#9b3030" />
            <text
              x={pts[worstIdx].x}
              y={Math.min(pts[worstIdx].y + 18, Y_BOT + 4)}
              textAnchor="middle"
              fontFamily="Heebo"
              fontSize={10}
              fill="#9b3030"
              fontWeight="500"
            >
              {worstMonthShortLabel}
            </text>
          </>
        )}

        {/* Best month marker */}
        {bestIdx >= 0 && bestIdx !== worstIdx && (
          <>
            <circle cx={pts[bestIdx].x} cy={pts[bestIdx].y} r={4} fill="#1b3a2f" />
            <text
              x={pts[bestIdx].x}
              y={Math.max(pts[bestIdx].y - 8, Y_TOP - 2)}
              textAnchor="middle"
              fontFamily="Heebo"
              fontSize={10}
              fill="#1b3a2f"
              fontWeight="500"
            >
              {bestMonthShortLabel}
            </text>
          </>
        )}

        {/* X-axis start / end labels */}
        <text x={X_LEFT} y={SVG_H - 4} textAnchor="start" fontFamily="Heebo" fontSize={11} fill="#6b6b6b">
          {chartData[0].shortLabel}
        </text>
        <text x={X_RIGHT} y={SVG_H - 4} textAnchor="end" fontFamily="Heebo" fontSize={11} fill="#6b6b6b">
          {chartData[chartData.length - 1].shortLabel}
        </text>
      </svg>
      <div className="v2-chart-caption">
        תשואה חודשית של {fundName} ביחס ל{benchmarkName} · הקו השחור = ביצועי הבנצ׳מרק
      </div>
    </div>
  );
}
