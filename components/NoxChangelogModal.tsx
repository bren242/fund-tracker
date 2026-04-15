"use client";

import { useEffect, useState } from "react";

/**
 * One-time changelog modal — shown once per session for NOX only.
 * Dismissed via sessionStorage flag (versioned so we can reset with a new release).
 */
const DISMISS_KEY = "nox-changelog-seen-apr2026";
const NOX_PRIMARY = "#1a365d";
const NOX_GOLD    = "#c8a96b";

export default function NoxChangelogModal({ clientKey }: { clientKey: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (clientKey !== "nox") return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    setOpen(true);
  }, [clientKey]);

  if (clientKey !== "nox" || !open) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setOpen(false);
  };

  return (
    <div
      onClick={dismiss}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 20,
        direction: "rtl",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#ffffff",
          borderRadius: 14,
          maxWidth: 460,
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          borderTop: `4px solid ${NOX_GOLD}`,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "24px 28px 20px" }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: NOX_PRIMARY,
              marginBottom: 14,
              letterSpacing: 0.2,
            }}
          >
            עדכון מערכת — אפריל 2026
          </div>

          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "0 0 16px",
              fontSize: 14,
              lineHeight: 1.75,
              color: "#334155",
            }}
          >
            {[
              "ממשק מחודש ומהיר יותר",
              "דף קרנות עם פילטור לפי שנה (2020–YTD 2026)",
              "השוואת עד 4 קרנות עם גרף שנתי",
              "ממשק עדכון חודשי משופר",
            ].map((item) => (
              <li key={item} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ color: NOX_GOLD, fontWeight: 700, marginTop: 1 }}>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div
            style={{
              fontSize: 13,
              color: "#64748b",
              paddingTop: 12,
              borderTop: "1px solid #e2e8f0",
              marginBottom: 18,
            }}
          >
            נשמח לפידבק — [שם/מייל איש קשר]
          </div>

          <button
            onClick={dismiss}
            style={{
              width: "100%",
              background: NOX_GOLD,
              color: "#ffffff",
              border: "none",
              borderRadius: 8,
              padding: "11px 0",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: 0.3,
              fontFamily: "inherit",
              transition: "background 0.12s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#b4955c")}
            onMouseLeave={(e) => (e.currentTarget.style.background = NOX_GOLD)}
          >
            הבנתי
          </button>
        </div>
      </div>
    </div>
  );
}
