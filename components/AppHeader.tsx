"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

interface AppHeaderProps {
  fundCount?: number;
  client?: string;
  tenant?: string;
}

type TabKey = "funds" | "analysis" | "tools" | "admin";

const TABS: { key: TabKey; label: string }[] = [
  { key: "funds", label: "קרנות" },
  { key: "analysis", label: "ניתוח" },
  { key: "tools", label: "כלים" },
  { key: "admin", label: "ניהול" },
];

const SUB_TABS: Record<TabKey, { label: string; path: string }[]> = {
  funds: [],
  analysis: [
    { label: "דירוג", path: "/analysis" },
    { label: "גרפים", path: "/charts" },
    { label: "השוואה", path: "/compare" },
    { label: "עקביות", path: "/consistency" },
  ],
  tools: [
    { label: "אינדיקציה", path: "/indications" },
    { label: "סטטוס קרנות", path: "/fund-status" },
  ],
  admin: [
    { label: "קרנות", path: "/admin" },
    { label: "בנצ'מרקים", path: "/admin/benchmarks" },
    { label: "העלאת דוח", path: "/upload" },
  ],
};

function getActiveTab(pathname: string): TabKey {
  if (
    pathname.startsWith("/analysis") ||
    pathname.startsWith("/charts") ||
    pathname.startsWith("/compare") ||
    pathname.startsWith("/consistency")
  )
    return "analysis";
  if (
    pathname.startsWith("/indications") ||
    pathname.startsWith("/fund-status")
  )
    return "tools";
  if (pathname.startsWith("/admin") || pathname.startsWith("/upload"))
    return "admin";
  return "funds";
}

export default function AppHeader({ fundCount = 84, client, tenant = "green" }: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [hoveredTab, setHoveredTab] = useState<TabKey | null>(null);

  // /nox routes use legacy interface — no AppHeader
  if (pathname.startsWith("/nox")) return null;

  const activeTab = getActiveTab(pathname);
  const visibleSubBar = hoveredTab ?? (SUB_TABS[activeTab].length > 0 ? activeTab : null);
  const subTabs = visibleSubBar ? SUB_TABS[visibleSubBar] : [];

  const prefix = client ? `/${client}` : "";

  const navigate = (path: string) => {
    router.push(`${prefix}${path}`);
  };

  const isSubActive = (path: string) => {
    const full = `${prefix}${path}`;
    if (path === "/admin") return pathname === full || pathname === `${prefix}/admin`;
    return pathname === full || pathname.startsWith(full + "/");
  };

  return (
    <div
      onMouseLeave={() => setHoveredTab(null)}
      style={{ position: "sticky", top: 0, zIndex: 100 }}
    >
      {/* Top bar */}
      <div
        style={{
          height: 52,
          background: "#ffffff",
          borderBottom: "0.5px solid #e8e8e8",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          direction: "rtl",
        }}
      >
        {tenant === "nox" ? (
          <span style={{ color: "#ffffff", fontSize: 20, fontWeight: 700, letterSpacing: "2px" }}>NOX</span>
        ) : (
          <img
            src="/branding/green/green-logo-transparent.png"
            alt="GREEN"
            style={{ height: "38px", width: "auto", objectFit: "contain", display: "block" }}
          />
        )}
        <span style={{ fontSize: 12, color: "#999" }}>
          {fundCount} קרנות פעילות
        </span>
      </div>

      {/* Nav bar */}
      <div
        style={{
          height: 44,
          background: "#1B3A2F",
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          direction: "rtl",
          gap: 4,
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                const subs = SUB_TABS[tab.key];
                if (subs.length > 0) navigate(subs[0].path);
                else navigate("/");
              }}
              onMouseEnter={() => setHoveredTab(tab.key)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "0 14px",
                height: 44,
                fontSize: 14,
                color: isActive ? "#ffffff" : "rgba(255,255,255,0.65)",
                borderBottom: isActive ? "2px solid #B8975A" : "2px solid transparent",
                transition: "color 0.12s ease, border-color 0.12s ease",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sub bar */}
      {subTabs.length > 0 && (
        <div
          style={{
            height: 36,
            background: "#f5f5f7",
            display: "flex",
            alignItems: "center",
            padding: "0 24px",
            direction: "rtl",
            gap: 4,
            borderBottom: "1px solid #B8975A",
          }}
        >
          {subTabs.map((sub) => {
            const isActive = isSubActive(sub.path);
            return (
              <button
                key={sub.path}
                onClick={() => navigate(sub.path)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0 12px",
                  height: 36,
                  fontSize: 13,
                  color: "#1B3A2F",
                  fontWeight: isActive ? 500 : 400,
                  borderBottom: isActive ? "2px solid #B8975A" : "2px solid transparent",
                  transition: "border 0.12s, color 0.12s",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.fontWeight = "500";
                  if (!isActive) el.style.borderBottom = "2px solid #1B3A2F";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.fontWeight = isActive ? "500" : "400";
                  el.style.borderBottom = isActive ? "2px solid #B8975A" : "2px solid transparent";
                }}
              >
                {sub.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
