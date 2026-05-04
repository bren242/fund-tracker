"use client";

import { useEffect, useRef, useState } from "react";
import type { CompareData, CmpWindow } from "./types";
import CompareHero from "./CompareHero";
import CompareWindowPicker from "./CompareWindowPicker";
import CompareHeadline from "./CompareHeadline";
import CompareProfile from "./CompareProfile";
import CompareHeatmap from "./CompareHeatmap";
import { CompareInsightSkeleton, CompareInsightContent } from "./CompareInsight";
import GlossarySection, { COMPARE_GLOSSARY_TERMS } from "../GlossarySection";

interface AIInsight { text: string }

function hasValidWindows(data: CompareData): boolean {
  return data.funds.some(
    (f) =>
      Object.values(f.windows).some((w) => w != null && w.monthsCount > 0) ||
      (f.itd != null && f.itd.monthsCount > 0)
  );
}

function CompareSkeleton() {
  return (
    <div className="cmp-skeleton-wrap">
      <div className="cmp-skeleton-hero" />
      <div className="cmp-skeleton-pills">
        {["YTD", "12M", "24M", "36M"].map((w) => (
          <div key={w} className="cmp-skeleton-pill" />
        ))}
      </div>
      <div className="cmp-skeleton-cards">
        {[0, 1, 2].map((i) => <div key={i} className="cmp-skeleton-card" />)}
      </div>
      <div className="cmp-skeleton-rows">
        {[0, 1, 2, 3].map((i) => <div key={i} className="cmp-skeleton-row" />)}
      </div>
      <div className="cmp-skeleton-heatmap" />
    </div>
  );
}

function CompareError() {
  return (
    <div className="cmp-error">
      <p>שגיאה בטעינת נתוני ההשוואה. נסה לרענן את הדף.</p>
      <button className="cmp-error-btn" onClick={() => globalThis.location.reload()}>
        רענן
      </button>
    </div>
  );
}

export default function CompareView({
  fundIds,
  client,
}: {
  fundIds: string[];
  client: string;
}) {
  const [selectedWindow, setSelectedWindow] = useState<CmpWindow>("24M");
  const [data, setData]                     = useState<CompareData | null>(null);
  const [dataLoading, setDataLoading]       = useState(true);
  const [dataError, setDataError]           = useState(false);
  const [aiInsight, setAiInsight]           = useState<AIInsight | null>(null);
  const [aiLoading, setAiLoading]           = useState(true);

  const fundIdsKey = fundIds.join(",");
  const prevKey = useRef<string>("");

  useEffect(() => {
    if (prevKey.current === fundIdsKey) return;
    prevKey.current = fundIdsKey;

    setDataLoading(true);
    setDataError(false);
    setData(null);
    setAiInsight(null);
    setAiLoading(true);

    const url = `/api/consistency/v2/compare?funds=${fundIdsKey}&client=${client}`;

    async function fetchWithRetry() {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1000));
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const d: CompareData = await res.json();
          if (hasValidWindows(d)) {
            setData(d);
            setDataLoading(false);
            return;
          }
        } catch { /* retry */ }
      }
      setDataError(true);
      setDataLoading(false);
    }

    fetchWithRetry();
  }, [fundIdsKey, client]);

  // AI insight — starts after data loads
  useEffect(() => {
    if (!data) return;
    const ids = data.funds.map((f) => f.id).join(",");
    fetch(`/api/consistency/v2/compare/insight?funds=${ids}&client=${client}`)
      .then((r) => r.json())
      .then((res: { aiInsight: AIInsight | null }) => {
        setAiInsight(res.aiInsight);
        setAiLoading(false);
      })
      .catch(() => setAiLoading(false));
  }, [data, client]);

  if (dataLoading) return <CompareSkeleton />;
  if (dataError || !data) return <CompareError />;

  return (
    <>
      <CompareHero data={data} />
      <CompareWindowPicker selected={selectedWindow} onChange={setSelectedWindow} />
      <CompareHeadline funds={data.funds} window={selectedWindow} />
      <CompareProfile funds={data.funds} window={selectedWindow} />
      <CompareHeatmap funds={data.funds} />

      {aiLoading ? (
        <CompareInsightSkeleton />
      ) : aiInsight?.text ? (
        <CompareInsightContent text={aiInsight.text} />
      ) : null}

      <GlossarySection terms={COMPARE_GLOSSARY_TERMS} />

      <div className="v2-disclaimer">
        הנתונים לצורך מידע בלבד ואינם מהווים ייעוץ השקעות.
        הביצועים בעבר אינם מבטיחים תשואה עתידית.
      </div>
    </>
  );
}
