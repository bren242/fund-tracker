"use client";

import type { CmpWindow } from "./types";

const WINDOWS: { id: CmpWindow; label: string }[] = [
  { id: "YTD",  label: "מ׳ השנה" },
  { id: "12M",  label: "12 חו׳" },
  { id: "24M",  label: "24 חו׳" },
  { id: "36M",  label: "36 חו׳" },
];

export default function CompareWindowPicker({
  selected,
  onChange,
}: {
  selected: CmpWindow;
  onChange: (w: CmpWindow) => void;
}) {
  return (
    <div className="cmp-window-picker">
      {WINDOWS.map((w) => (
        <button
          key={w.id}
          className={`cmp-pill${selected === w.id ? " cmp-pill-active" : ""}`}
          onClick={() => onChange(w.id)}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}
