"use client";

interface ToolbarProps {
  fundId?: string;
  fundName?: string;
}

export default function Toolbar({ fundId }: ToolbarProps) {
  if (fundId) {
    return (
      <div className="v2-toolbar">
        <div className="v2-spacer" />
        <button className="v2-btn" onClick={() => window.print()}>⎙ הדפס</button>
        <a className="v2-btn" href={`/consistency/v2?preselect=${fundId}`}>+ השווה</a>
      </div>
    );
  }

  return null;
}
