import type { CompareData } from "./types";

export default function CompareHero({ data }: { data: CompareData }) {
  return (
    <div className="cmp-hero">
      <div className="cmp-hero-left">
        <div className="cmp-hero-eyebrow">השוואת קרנות</div>
        <h1 className="cmp-hero-title">{data.category.label}</h1>
        <div className="cmp-hero-meta">
          <span>בנצ׳מרק: {data.category.benchmarkLabel}</span>
          <span>·</span>
          <span>{data.funds.length} קרנות</span>
        </div>
      </div>
      {data.asOfMonthLabel && (
        <div className="cmp-hero-date">נכון ל: {data.asOfMonthLabel}</div>
      )}
    </div>
  );
}
