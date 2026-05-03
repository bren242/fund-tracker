"use client";

import { useEffect, useState } from "react";
import Hero from "./Hero";
import WindowsTable from "./WindowsTable";
import type { WindowLabel } from "@/lib/consistency";

const GLOSSARY_TERMS = [
  { term: "Information Ratio (IR)", def: "עודף התשואה החודשי הממוצע על הבנצ׳מרק, מחולק בסטיית התקן שלו. IR מעל 0.5 = עקביות גבוהה. IR מתחת לאפס = הקרן הפסידה בממוצע לבנצ׳מרק." },
  { term: "ירידה מקסימלית (MDD)", def: "הירידה המרבית מנקודת שיא לנקודת שפל בתקופה. מדד לגרוע ביותר שחווה המשקיע." },
  { term: "Up Capture", def: "אחוז מתשואת הבנצ׳מרק שהשיגה הקרן בחודשים שבהם הבנצ׳מרק עלה. מעל 100% — הקרן עלתה יותר." },
  { term: "Down Capture", def: "אחוז מירידת הבנצ׳מרק שספגה הקרן בחודשים שבהם הבנצ׳מרק ירד. מתחת ל-100% — הגנה טובה יותר בירידות." },
  { term: "עודף על בנצ׳מרק", def: "הפרש התשואה המצטברת בין הקרן לבנצ׳מרק באותה תקופה. מחושב כ: תשואת קרן פחות תשואת בנצ׳מרק." },
  { term: "דירוג בקטגוריה", def: "מיקום הקרן בין כלל הקרנות בקטגוריה לפי IR, מהגבוה לנמוך. דירוג 1 = ה-IR הגבוה ביותר בקטגוריה." },
  { term: "מעל בנצ׳מרק", def: "מספר החודשים שבהם תשואת הקרן עלתה על תשואת הבנצ׳מרק, מתוך סך החודשים בחלון הזמן." },
  { term: "מעל קטגוריה", def: "מספר החודשים שבהם תשואת הקרן עלתה על ממוצע תשואות כלל הקרנות בקטגוריה." },
];

interface MDD {
  drawdownPct: number;
  peakMonthKey: string | null;
  troughMonthKey: string | null;
  durationMonths: number;
  recoveryMonths: number | null;
  monthsAvailable: number;
}
interface WM {
  windowLabel: WindowLabel;
  monthsCount: number;
  fundReturn: number;
  benchmarkReturn: number;
  excessReturn: number;
  informationRatio: number | null;
  monthsAboveBenchmark: { count: number; total: number };
  monthsAboveCategory:  { count: number; total: number };
  maxDrawdown: MDD;
  upCapture: number | null;
  downCapture: number | null;
  rankInCategory: number | null;
  totalInCategory: number | null;
}
interface FundViewData {
  fund: { id: string; name: string; category: { id: string; name: string } };
  benchmarkShortName: string;
  endMonthLabel: string;
  windows: Record<WindowLabel, WM | null>;
  ai: { insightParagraph: string } | null;
  error?: string;
}

interface SingleViewProps {
  fundId: string;
  client: string;
}

export default function SingleView({ fundId, client }: SingleViewProps) {
  const [data, setData] = useState<FundViewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/consistency/v2/fund/${fundId}?client=${client}`)
      .then((r) => r.json())
      .then((d: FundViewData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [fundId, client]);

  if (loading) return <div className="v2-loading">טוען...</div>;
  if (!data || data.error) return <div className="v2-loading">לא נמצאו נתונים</div>;

  const { fund, benchmarkShortName, endMonthLabel, windows, ai } = data;

  return (
    <>
      <Hero
        fundName={fund.name}
        categoryName={fund.category.name}
        benchmarkShortName={benchmarkShortName}
        endMonthLabel={endMonthLabel}
      />

      <div className="v2-section">
        <WindowsTable windows={windows} benchmarkShortName={benchmarkShortName} />
      </div>

      <details id="v2-glossary" className="v2-glossary">
        <summary className="v2-glossary-summary">מילון מונחים</summary>
        <div className="v2-glossary-grid">
          {GLOSSARY_TERMS.map(({ term, def }) => (
            <div key={term} className="v2-glossary-item">
              <dt className="v2-glossary-term">{term}</dt>
              <dd className="v2-glossary-def">{def}</dd>
            </div>
          ))}
        </div>
      </details>

      {ai?.insightParagraph && (
        <div className="v2-section v2-ai-insight-section">
          <div className="v2-section-label">תובנה</div>
          <p className="v2-ai-insight-text">{ai.insightParagraph}</p>
        </div>
      )}

      <div className="v2-disclaimer">
        הנתונים לצורך מידע בלבד ואינם מהווים ייעוץ השקעות.
        הביצועים בעבר אינם מבטיחים תשואה עתידית.
      </div>
    </>
  );
}
