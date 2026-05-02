interface HeroProps {
  fundName: string;
  verdictLabel: string;
  windowSize: number;
  categoryName: string;
  benchmarkShortName: string;
}

export default function Hero({ fundName, verdictLabel, windowSize, categoryName, benchmarkShortName }: HeroProps) {
  return (
    <div className="v2-hero">
      <h1 className="v2-hero-fund-name">{fundName}</h1>
      {verdictLabel && <div className="v2-hero-verdict">{verdictLabel}</div>}
      <div className="v2-hero-meta">
        <span>חלון {windowSize} חודשים</span>
        <span>קטגוריה: {categoryName}</span>
        {benchmarkShortName && <span>בנצ׳מרק: {benchmarkShortName}</span>}
      </div>
    </div>
  );
}
