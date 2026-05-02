"use client";

import { useRouter, usePathname } from "next/navigation";

export default function Toolbar({ windowSize }: { windowSize: number }) {
  const router = useRouter();
  const pathname = usePathname();

  function changeWindow(w: number) {
    router.push(`${pathname}?window=${w}`);
  }

  return (
    <div className="v2-toolbar">
      <div className="v2-toolbar-search">
        <span style={{ opacity: 0.5 }}>🔍</span>
        <input type="text" placeholder="חפש קרן..." readOnly />
      </div>
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
      <button className="v2-btn" disabled>+ השווה</button>
      <button
        className="v2-btn"
        onClick={() => window.print()}
      >
        ⎙ הדפס
      </button>
      <button className="v2-btn" disabled>⤓ PDF</button>
    </div>
  );
}
