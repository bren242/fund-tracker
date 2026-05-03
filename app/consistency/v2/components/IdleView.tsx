"use client";

import { useState } from "react";
import type { LeaderboardEntry } from "../page";

const CAT_SHORT: Record<string, string> = {
  "equity-hedged":  "לונג",
  "equity-long":    "לונג",
  "bond-hedged":    'אג"ח',
  "bonds":          'אג"ח',
  "multi-strategy": "מולטי",
  "multi-asset":    "מולטי",
};

function fmtIR(ir: number): string {
  return ir.toFixed(2);
}
function irClass(ir: number): string {
  if (ir >= 0.5) return "positive";
  if (ir < 0)   return "negative";
  return "neutral";
}

interface SearchEntry {
  fundId: string;
  fundName: string;
  categoryId: string;
  categoryLabel: string;
  ir: number;
  score: number;
}

export default function IdleView({
  top5,
  totalFunds,
  searchPool,
}: {
  top5: LeaderboardEntry[];
  totalFunds: number;
  windowSize: number;
  searchPool: SearchEntry[];
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const results = query.length >= 1
    ? searchPool.filter((f) => f.fundName.includes(query)).slice(0, 8)
    : [];

  const displayList: LeaderboardEntry[] = showAll
    ? searchPool.map((f, i) => ({ ...f, rank: i + 1 }))
    : top5;

  return (
    <>
      <div className="v2-intro">
        <div className="v2-intro-eyebrow">דוח עקביות קרנות</div>
        <h1>עקביות קרנות</h1>
        <div className="v2-intro-sub">
          נתוני עקביות לפי חלונות זמן — YTD, שנה, שנתיים, שלוש שנים וכל ההיסטוריה.
        </div>
      </div>

      <div className="v2-hero-search">
        <div className="v2-hero-search-wrap">
          <div className="v2-hero-search-box">
            <span className="v2-icon">🔍</span>
            <input
              type="text"
              placeholder="חפש שם קרן..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
          {results.length > 0 && (
            <div className="v2-search-dropdown">
              {results.map((f) => (
                <a
                  key={f.fundId}
                  className="v2-search-result"
                  href={`?fund=${f.fundId}`}
                >
                  <span className="v2-search-name">{f.fundName}</span>
                  {CAT_SHORT[f.categoryId] && (
                    <span className="v2-search-cat">{CAT_SHORT[f.categoryId]}</span>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="v2-hero-search-hint">חפש קרן · לחיצה תפתח את דוח העקביות שלה</div>
      </div>

      <div className="v2-divider">
        <span>או</span>
      </div>

      <div className="v2-top-section">
        <div className="v2-top-label">מובילות לפי Information Ratio (24 חו׳)</div>
        <div className="v2-top-list">
          {displayList.map((f) => {
            const catShort = CAT_SHORT[f.categoryId];
            const cls = irClass(f.ir);
            return (
              <a
                key={f.fundId}
                className="v2-top-item"
                href={`?fund=${f.fundId}`}
              >
                <div className="v2-rank">{String(f.rank).padStart(2, "0")}</div>
                <div className="v2-fund-name">{f.fundName}</div>
                {catShort
                  ? <div className="v2-cat-pill">{catShort}</div>
                  : <div />}
                <div className={`v2-ir-display v2-ir-${cls}`}>
                  <span className="v2-ir-display-label">IR</span>
                  <span className="v2-ir-display-value">{fmtIR(f.ir)}</span>
                </div>
              </a>
            );
          })}
        </div>
        {totalFunds > 5 && (
          <div className="v2-show-all">
            <button className="v2-show-all-btn" onClick={() => setShowAll((s) => !s)}>
              {showAll ? "הסתר" : `הצג את כל ${totalFunds} הקרנות`}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
