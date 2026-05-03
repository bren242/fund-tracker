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

function verdictInfo(score: number): { tier: string; label: string } {
  if (score >= 90) return { tier: "high",     label: "עקבית מאוד" };
  if (score >= 70) return { tier: "mid",      label: "עקבית" };
  if (score >= 50) return { tier: "low-mid",  label: "חלקית" };
  return             { tier: "low",      label: "לא עקבית" };
}

interface SearchEntry {
  fundId: string;
  fundName: string;
  categoryId: string;
  categoryLabel: string;
  score: number;
}

export default function IdleView({
  top5,
  totalFunds,
  windowSize,
  searchPool,
}: {
  top5: LeaderboardEntry[];
  totalFunds: number;
  windowSize: number;
  searchPool: SearchEntry[];
}) {
  const [query, setQuery] = useState("");

  const results = query.length >= 1
    ? searchPool.filter(f => f.fundName.includes(query)).slice(0, 8)
    : [];

  return (
    <>
      <div className="v2-intro">
        <div className="v2-intro-eyebrow">דוח עקביות קרנות</div>
        <h1>עקביות</h1>
        <div className="v2-intro-sub">
          מי מהקרנות עקבית באמת. מי מנצחת באופן רציף את הבנצ׳מרק שלה.
          <br />
          ומי פשוט הייתה ברת מזל.
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
              onChange={e => setQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
          {results.length > 0 && (
            <div className="v2-search-dropdown">
              {results.map(f => (
                <a
                  key={f.fundId}
                  className="v2-search-result"
                  href={`?fund=${f.fundId}&window=${windowSize}`}
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
        <div className="v2-top-label">חמש המובילות בעקביות</div>
        <div className="v2-top-list">
          {top5.map((f) => {
            const { tier, label } = verdictInfo(f.score);
            const catShort = CAT_SHORT[f.categoryId];
            return (
              <a
                key={f.fundId}
                className="v2-top-item"
                href={`?fund=${f.fundId}&window=${windowSize}`}
              >
                <div className="v2-rank">{String(f.rank).padStart(2, "0")}</div>
                <div className="v2-fund-name">{f.fundName}</div>
                {catShort
                  ? <div className="v2-cat-tag">{catShort}</div>
                  : <div />}
                <div className={`v2-verdict-tag ${tier}`}>
                  <span className="v2-dot" />
                  {label}
                </div>
                <div className="v2-fund-score">{Math.round(f.score)}</div>
              </a>
            );
          })}
        </div>
        {totalFunds > 5 && (
          <div className="v2-show-all">
            <a href="#">הצג את כל {totalFunds} הקרנות</a>
          </div>
        )}
      </div>
    </>
  );
}
