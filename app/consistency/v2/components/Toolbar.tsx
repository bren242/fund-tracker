"use client";

interface ToolbarProps {
  fundId?: string;
  fundName?: string;
  client?: string;
  isCompare?: boolean;
}

export default function Toolbar({ fundId, client = "green", isCompare }: ToolbarProps) {
  if (isCompare) {
    return (
      <div className="v2-toolbar">
        <div className="v2-spacer" />
        <button className="v2-btn" onClick={() => window.print()}>⎙ הדפס</button>
      </div>
    );
  }

  if (fundId) {
    return (
      <div className="v2-toolbar">
        <div className="v2-spacer" />
        <button className="v2-btn" onClick={() => window.print()}>⎙ הדפס</button>
        <a className="v2-btn" href={`/consistency/v2?preselect=${fundId}&client=${client}`}>+ השווה</a>
      </div>
    );
  }

  return null;
}
