"use client";

import { useEffect, useState } from "react";
import type { CompareData, CmpWindow } from "./types";
import CompareHero from "./CompareHero";
import CompareWindowPicker from "./CompareWindowPicker";
import CompareHeadline from "./CompareHeadline";
import CompareProfile from "./CompareProfile";
import CompareHeatmap from "./CompareHeatmap";
import { CompareInsightSkeleton, CompareInsightContent } from "./CompareInsight";

interface AIInsight { text: string }

export default function CompareView({
  data,
  client,
}: {
  data: CompareData;
  client: string;
}) {
  const [window, setWindow]       = useState<CmpWindow>("24M");
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [aiLoading, setAiLoading] = useState(true);

  useEffect(() => {
    const fundIds = data.funds.map((f) => f.id).join(",");
    fetch(`/api/consistency/v2/compare/insight?funds=${fundIds}&client=${client}`)
      .then((r) => r.json())
      .then((res: { aiInsight: AIInsight | null }) => {
        setAiInsight(res.aiInsight);
        setAiLoading(false);
      })
      .catch(() => setAiLoading(false));
  }, [data, client]);

  return (
    <>
      <CompareHero data={data} />
      <CompareWindowPicker selected={window} onChange={setWindow} />
      <CompareHeadline funds={data.funds} window={window} />
      <CompareProfile funds={data.funds} window={window} />
      <CompareHeatmap funds={data.funds} />

      {aiLoading ? (
        <CompareInsightSkeleton />
      ) : aiInsight?.text ? (
        <CompareInsightContent text={aiInsight.text} />
      ) : null}

      <div className="v2-disclaimer">
        הנתונים לצורך מידע בלבד ואינם מהווים ייעוץ השקעות.
        הביצועים בעבר אינם מבטיחים תשואה עתידית.
      </div>
    </>
  );
}
