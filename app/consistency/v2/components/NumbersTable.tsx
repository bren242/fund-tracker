interface NumbersTableProps {
  ir: number | null;
  benchmarkName: string;
  benchmarkWins: number | null;
  benchmarkTotal: number | null;
  categoryWins: number | null;
  categoryTotal: number | null;
  worstMonthGap: number | null;
  categoryName: string;
  categoryRank: number | null;
  categoryFundCount: number | null;
  globalRank: number | null;
  totalInSystem: number;
}

function fmtPct(v: number): string {
  const pct = (Math.abs(v) * 100).toFixed(1);
  return v >= 0 ? `+${pct}%` : `−${pct}%`;
}

export default function NumbersTable({
  ir, benchmarkName, benchmarkWins, benchmarkTotal,
  categoryWins, categoryTotal, worstMonthGap,
  categoryName, categoryRank, categoryFundCount,
  globalRank, totalInSystem,
}: NumbersTableProps) {
  const rows: { label: string; value: string; small?: string; neg?: boolean }[] = [
    {
      label: "Information Ratio",
      value: ir != null ? ir.toFixed(2) : "—",
      neg: (ir ?? 0) < 0,
    },
    {
      label: `חודשים שעקפו את ${benchmarkName}`,
      value: benchmarkWins != null ? String(benchmarkWins) : "—",
      small: benchmarkTotal != null ? `/${benchmarkTotal}` : undefined,
    },
    {
      label: "חודשים שעקפו את ממוצע הקטגוריה",
      value: categoryWins != null ? String(categoryWins) : "—",
      small: categoryTotal != null ? `/${categoryTotal}` : undefined,
    },
    {
      label: "החודש הקשה ביותר ביחס לבנצ׳מרק",
      value: worstMonthGap != null ? fmtPct(worstMonthGap) : "—",
      neg: worstMonthGap != null && worstMonthGap < -0.0001,
    },
    {
      label: `דירוג בקטגוריית ${categoryName}`,
      value: categoryRank != null ? `#${categoryRank}` : "—",
      small: categoryFundCount != null ? `/${categoryFundCount}` : undefined,
    },
    {
      label: "דירוג עקביות במערכת GREEN",
      value: globalRank != null ? `#${globalRank}` : "—",
      small: totalInSystem > 0 ? `/${totalInSystem}` : undefined,
    },
  ];

  return (
    <div className="v2-numbers">
      {rows.map((row, i) => (
        <div key={i} className="v2-numbers-row">
          <div className="v2-numbers-label">{row.label}</div>
          <div className={`v2-numbers-value${row.neg ? " negative" : ""}`}>
            {row.value}
            {row.small && <span className="small">{row.small}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
