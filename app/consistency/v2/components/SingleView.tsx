"use client";

import { useEffect, useState } from "react";
import Hero from "./Hero";
import WindowsTable from "./WindowsTable";
import GlossarySection, { SINGLE_GLOSSARY_TERMS } from "./GlossarySection";
import DisclaimerBlock from "./DisclaimerBlock";
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
  benchmarkShortName: string | null;
  endMonthLabel: string;
  windows: Record<WindowLabel, WM | null>;
  hasBenchmark?: boolean;
}

interface AIInsight {
  insightParagraph: string;
}

interface SingleViewProps {
  fundId: string;
  client: string;
}

function AIInsightSkeleton() {
  return (
    <div className="v2-ai-skeleton">
      <div className="v2-section-label v2-ai-skeleton-label">תובנה</div>
      <div className="v2-ai-skeleton-line" style={{ width: "100%" }} />
      <div className="v2-ai-skeleton-line" style={{ width: "88%" }} />
      <div className="v2-ai-skeleton-line" style={{ width: "72%" }} />
    </div>
  );
}

function EmptyState({ message, client }: { message: string; client: string }) {
  return (
    <div style={{
      margin: "48px auto",
      maxWidth: 480,
      padding: "32px 28px",
      borderRadius: 12,
      background: "var(--bg-card, #fafaf7)",
      border: "1px solid var(--border-subtle, #e5e1d8)",
      textAlign: "center",
      direction: "rtl",
    }}>
      <div style={{ fontSize: 28, marginBottom: 12 }}>ℹ️</div>
      <p style={{ margin: "0 0 20px", fontSize: 15, color: "var(--text-primary, #222)", lineHeight: 1.6 }}>
        {message}
      </p>
      <a
        href={`/${client}/consistency/v2`}
        style={{
          display: "inline-block",
          padding: "8px 20px",
          borderRadius: 8,
          background: "var(--bg-section, #064e3b)",
          color: "#fff",
          fontSize: 14,
          textDecoration: "none",
        }}
      >
        חזרה לרשימה
      </a>
    </div>
  );
}

export default function SingleView({ fundId, client }: SingleViewProps) {
  const [data, setData]           = useState<FundViewData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [aiLoading, setAiLoading] = useState(true);

  // Fast fetch — data only, no AI
  useEffect(() => {
    setDataLoading(true);
    setData(null);
    setDataError(null);
    setAiInsight(null);
    setAiLoading(true);
    fetch(`/api/consistency/v2/fund/${fundId}?client=${client}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({})) as { error?: string };
          setDataError(body.error || `שגיאה בטעינה (${r.status})`);
          setDataLoading(false);
          return;
        }
        const d = await r.json() as FundViewData;
        setData(d);
        setDataLoading(false);
      })
      .catch(() => { setDataError("שגיאת תקשורת"); setDataLoading(false); });
  }, [fundId, client]);

  // Slow fetch — AI insight, starts after data arrives
  useEffect(() => {
    if (!data) return;
    fetch(`/api/consistency/v2/fund/${fundId}/insight?client=${client}`)
      .then((r) => r.json())
      .then((res: { aiInsight: AIInsight | null }) => {
        setAiInsight(res.aiInsight);
        setAiLoading(false);
      })
      .catch(() => setAiLoading(false));
  }, [data, fundId, client]);

  if (dataLoading) return <div className="v2-loading">טוען נתונים...</div>;
  if (dataError || !data?.fund) {
    return <EmptyState message={dataError || "אין מספיק היסטוריה לחישוב עקביות"} client={client} />;
  }

  const { fund, benchmarkShortName, endMonthLabel, windows, hasBenchmark = true } = data;

  return (
    <>
      <Hero
        fundName={fund.name}
        categoryName={fund.category.name}
        benchmarkShortName={benchmarkShortName ?? ""}
        endMonthLabel={endMonthLabel}
      />

      {!hasBenchmark && (
        <div style={{
          margin: "0 0 16px",
          padding: "10px 16px",
          borderRadius: 8,
          background: "var(--bg-row-alt, #f5f4f0)",
          border: "1px solid var(--border-subtle, #e5e1d8)",
          fontSize: 14,
          color: "var(--text-secondary, #888)",
          direction: "rtl",
          textAlign: "right",
        }}>
          קטגוריה זו אינה מקושרת לבנצ׳מרק — מוצגות מטריקות מוחלטות בלבד
        </div>
      )}

      <div className="v2-section">
        <WindowsTable windows={windows} benchmarkShortName={benchmarkShortName} hasBenchmark={hasBenchmark} />
      </div>

      <GlossarySection terms={SINGLE_GLOSSARY_TERMS} />

      {aiLoading ? (
        <AIInsightSkeleton />
      ) : aiInsight?.insightParagraph ? (
        <div className="v2-section v2-ai-insight-section">
          <div className="v2-section-label">תובנה</div>
          <p className="v2-ai-insight-text">{aiInsight.insightParagraph}</p>
        </div>
      ) : null}

      <DisclaimerBlock />
    </>
  );
}
