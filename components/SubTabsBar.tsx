"use client";

import { AppFeatures } from "@/config/brand";

interface SubTabsBarProps {
  client: string;
  active: "דירוג" | "השוואה" | "גרף" | "עקביות";
  features?: AppFeatures | null;
  primaryColor?: string;
  slot?: React.ReactNode;
  topOffset?: number;
}

export default function SubTabsBar({
  client,
  active,
  features,
  primaryColor = "#1B3A2F",
  slot,
  topOffset = 52,
}: SubTabsBarProps) {
  const tabs = [
    { label: "דירוג",  path: `/${client}/analysis`,       locked: false },
    { label: "השוואה", path: `/${client}/compare`,        locked: features?.comparison === false },
    { label: "גרף",    path: `/${client}/charts`,         locked: features?.chartPage === false },
    { label: "עקביות", path: `/${client}/consistency/v2`, locked: features?.consistencyAnalysis === false },
  ];

  return (
    <div
      className="no-print"
      style={{
        position: "sticky",
        top: topOffset,
        zIndex: 99,
        background: "#FAFAF7",
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 28px",
        direction: "rtl",
        borderBottom: "0.5px solid #eaecee",
      }}
    >
      {/* Nav pills */}
      <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>
        {tabs.map(({ label, path, locked }) => {
          const isActive = label === active;
          return (
            <a
              key={label}
              href={isActive || locked ? undefined : path}
              style={{
                padding: "6px 15px",
                borderRadius: 20,
                fontSize: 13,
                cursor: isActive || locked ? "default" : "pointer",
                whiteSpace: "nowrap",
                background: isActive ? primaryColor : "#F4F3EF",
                color: isActive ? "#fff" : locked ? "#c4c9d0" : "#6b7280",
                fontWeight: isActive ? 600 : 400,
                transition: "all 0.12s",
                flexShrink: 0,
                opacity: locked ? 0.6 : 1,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              {locked ? `🔒 ${label}` : label}
            </a>
          );
        })}
      </div>

      {/* Slot — left side (RTL: screen-left) */}
      {slot && <div style={{ flexShrink: 0 }}>{slot}</div>}
    </div>
  );
}
