"use client";

interface ToolbarProps {
  windowSize?: number;
  fundId?: string;
  fundName?: string;
  client?: string;
}

export default function Toolbar({ fundId }: ToolbarProps) {
  if (fundId) {
    return (
      <div className="v2-toolbar">
        <div className="v2-spacer" />
        <button className="v2-btn" onClick={() => window.print()}>⎙ הדפס</button>
        <button className="v2-btn" disabled title="בקרוב">+ השווה</button>
      </div>
    );
  }

  return null;
}
