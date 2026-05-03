"use client";

import { useRouter, usePathname } from "next/navigation";

interface ToolbarProps {
  windowSize: number;
  fundId?: string;
  fundName?: string;
  client?: string;
}

export default function Toolbar({ windowSize, fundId, client = "green" }: ToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Single fund view: minimal toolbar — 3 buttons only, right-aligned
  if (fundId) {
    return (
      <div className="v2-toolbar">
        <div className="v2-spacer" />
        <button className="v2-btn" disabled title="בקרוב">+ השווה</button>
        <button className="v2-btn" onClick={() => window.print()}>⎙ הדפס</button>
        <button className="v2-btn" disabled>⤓ PDF</button>
      </div>
    );
  }

  // Idle / leaderboard view: hint + window select + spacer + buttons
  function changeWindow(w: number) {
    const q = new URLSearchParams();
    q.set("window", String(w));
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <div className="v2-toolbar">
      <div className="v2-toolbar-hint">בחר קרן מהרשימה לצפייה בנתונים</div>
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
      <button className="v2-btn" disabled title="בקרוב">+ השווה</button>
      <button className="v2-btn" onClick={() => window.print()}>⎙ הדפס</button>
      <button className="v2-btn" disabled>⤓ PDF</button>
    </div>
  );
}
