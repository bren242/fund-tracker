"use client";

import { useEffect, useState } from "react";
import Hero from "./Hero";
import WindowsTable from "./WindowsTable";
import type { WindowLabel } from "@/lib/consistency";

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
