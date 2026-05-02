"use client";

import { useRouter, usePathname } from "next/navigation";

interface ToolbarProps {
  windowSize: number;
  fundId?: string;
  fundName?: string;
  client?: string;
}

export default function Toolbar({ windowSize, fundId, fundName, client = "green" }: ToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();

  function changeWindow(w: number) {
    const q = new URLSearchParams();
    q.set("window", String(w));
    if (fundId) q.set("fund", fundId);
    router.push(`${pathname}?${q.toString()}`);
  }

  function clearFund() {
    router.push(`${pathname}?window=${windowSize}`);
  }

  function goCompare() {
    if (!fundId) return;
    router.push(`/${client}/consistency/v2/compare?funds=${fundId}&window=${windowSize}`);
  }

  return (
    <div className="v2-toolbar">
      {fundId && fundName ? (
        <div className="v2-toolbar-chip">
          {fundName}
          <span className="v2-chip-x" onClick={clearFund}>✕</span>
        </div>
      ) : (
        <div className="v2-toolbar-search">
          <span style={{ opacity: 0.5 }}>🔍</span>
          <input type="text" placeholder="חפש קרן..." readOnly />
        </div>
      )}
      <select
        className="v2-window-select"
        value={windowSize}
        onChange={(e) => changeWindow(Number(e.target.value))}
      >
        <option value={24}>חלון: 24 חודשים</option>
        <option value={36}>חלון: 36 חודשים</option>
        <option value={48}>חלון: 48 חודשים</option>
      </select>
      <div className="v2-spacer" />
      <button
        className={`v2-btn${fundId ? " active" : ""}`}
        disabled={!fundId}
        onClick={goCompare}
      >
        + השווה
      </button>
      <button className="v2-btn" onClick={() => window.print()}>
        ⎙ הדפס
      </button>
      <button className="v2-btn" disabled>⤓ PDF</button>
    </div>
  );
}
