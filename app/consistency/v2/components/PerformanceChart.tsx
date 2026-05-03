/**
 * PerformanceChart — monthly excess-return bar chart.
 * Green bar = fund beat benchmark, red = missed, near-zero = gray.
 * X-axis labels every ~4 months. Y-axis gridlines with % labels on the right.
 */

const SVG_W = 800, SVG_H = 280;
const BAR_X_LEFT  = 8;
const BAR_X_RIGHT = 750;   // bar area ends here; 750-800 reserved for Y labels
const LABEL_X     = 755;   // Y-axis label start
const Y_TOP = 24, Y_BOT = 248;
const Y_ZERO = Math.round((Y_TOP + Y_BOT) / 2); // 136
const AVAIL = Y_ZERO - Y_TOP;                    // 112px above/below zero

interface DataPoint { month: string; shortLabel: string; excessReturn: number }

interface PerformanceChartProps {
  chartData: DataPoint[];
  benchmarkName: string;
}

function pickTickStep(maxAbs: number): number {
  for (const s of [0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.075, 0.10]) {
    if (s >= maxAbs * 0.40) return s;
  }
  return 0.10;
}

function fmtPct(v: number): string {
  const pct = (Math.abs(v) * 100).toFixed(1);
  return v >= 0 ? `+${pct}%` : `-${pct}%`;
}

export default function PerformanceChart({ chartData, benchmarkName }: PerformanceChartProps) {
  if (!chartData.length) return null;

  const n = chartData.length;
  const excesses   = chartData.map(d => d.excessReturn);
  const maxAbsRaw  = Math.max(...excesses.map(e => Math.abs(e)));
  const maxAbs     = Math.max(maxAbsRaw, 0.01);
  const scale      = AVAIL / (maxAbs * 1.18); // 18% headroom

  const SLOT  = (BAR_X_RIGHT - BAR_X_LEFT) / n;
  const BAR_W = Math.max(5, Math.min(22, SLOT * 0.72));

  const bX = (i: number) => BAR_X_LEFT + i * SLOT + (SLOT - BAR_W) / 2;
  const bY = (e: number) => e >= 0 ? Y_ZERO - e * scale : Y_ZERO;
  const bH = (e: number) => Math.max(1.5, Math.abs(e) * scale);

  const tickStep = pickTickStep(maxAbs);
  const gridTicks = [-2, -1, 1, 2]
    .map(m => m * tickStep)
    .filter(t => {
      const y = Y_ZERO - t * scale;
      return y > Y_TOP + 6 && y < Y_BOT - 6;
    });

  // Show X-axis label every ~4 months (aim for ≤7 labels total)
  const interval = Math.max(1, Math.ceil(n / 7));

  return (
    <div className="v2-chart-wrap">
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: "100%", height: "280px" }}
      >
        {/* Gridlines + Y labels */}
        {gridTicks.map(t => {
          const y = Y_ZERO - t * scale;
          return (
            <g key={t}>
              <line
                x1={BAR_X_LEFT} y1={y} x2={BAR_X_RIGHT} y2={y}
                stroke="#e8e6e0" strokeWidth={0.6} strokeDasharray="3,4"
              />
              <text
                x={LABEL_X} y={y + 3.5}
                textAnchor="start"
                fontFamily="Heebo, sans-serif"
                fontSize={9}
                fill="#b0b0b0"
                direction="ltr"
              >
                {fmtPct(t)}
              </text>
            </g>
          );
        })}

        {/* Zero baseline */}
        <line
          x1={BAR_X_LEFT} y1={Y_ZERO} x2={BAR_X_RIGHT} y2={Y_ZERO}
          stroke="#1a1a1a" strokeWidth={0.8}
        />

        {/* Bars */}
        {chartData.map((d, i) => {
          const e = d.excessReturn;
          const color = e > 0.0005 ? "#1b3a2f" : e < -0.0005 ? "#9b3030" : "#c8c8c8";
          return (
            <rect
              key={d.month}
              x={bX(i)} y={bY(e)}
              width={BAR_W} height={bH(e)}
              fill={color} opacity={0.85}
            />
          );
        })}

        {/* X-axis date labels (every `interval` bars + always first + always last) */}
        {chartData.map((d, i) => {
          const isFirst = i === 0;
          const isLast  = i === n - 1;
          if (!isFirst && !isLast && i % interval !== 0) return null;
          // Avoid overlapping last label with a nearby interval label
          if (isLast && n > 1 && (n - 1) % interval < 2 && !isFirst) return null;
          const cx = bX(i) + BAR_W / 2;
          return (
            <text
              key={d.month + "-lbl"}
              x={cx} y={SVG_H - 4}
              textAnchor="middle"
              fontFamily="Heebo, sans-serif"
              fontSize={10}
              fill="#6b6b6b"
            >
              {d.shortLabel}
            </text>
          );
        })}
      </svg>

      <div className="v2-chart-caption">
        כל עמודה = חודש אחד · ירוק = עקפה את {benchmarkName} · אדום = פיגרה
      </div>
    </div>
  );
}
