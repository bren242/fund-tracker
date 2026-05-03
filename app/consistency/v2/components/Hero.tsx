interface HeroProps {
  fundName: string;
  categoryName: string;
  benchmarkShortName: string;
  endMonthLabel: string;
}

export default function Hero({ fundName, categoryName, benchmarkShortName, endMonthLabel }: HeroProps) {
  return (
    <div className="v2-hero">
      <h1 className="v2-hero-fund-name">{fundName}</h1>
      <div className="v2-hero-meta">
        <span>קטגוריה: {categoryName}</span>
        {benchmarkShortName && <span>בנצ׳מרק: {benchmarkShortName}</span>}
        {endMonthLabel && <span>נכון ל: {endMonthLabel}</span>}
      </div>
    </div>
  );
}
