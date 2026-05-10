"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useClientKey } from "@/lib/useClientKey";
import { useBrand } from "@/lib/useBrand";
import type { AppFeatures } from "@/config/brand";

interface AppHeaderProps {
  fundCount?: number;
}

type TabKey = "funds" | "analysis" | "tools" | "admin";
type SubTab = { label: string; path: string; flag?: keyof AppFeatures };

const TABS: { key: TabKey; label: string }[] = [
  { key: "funds",    label: "קרנות" },
  { key: "analysis", label: "ניתוח" },
  { key: "tools",    label: "כלים" },
  { key: "admin",    label: "ניהול" },
];

const SUB_TABS: Record<TabKey, SubTab[]> = {
  funds: [],
  analysis: [
    { label: "דירוג",   path: "/analysis",    flag: "chartPage" },
    { label: "גרפים",   path: "/charts",       flag: "chartPage" },
    { label: "השוואה",  path: "/compare",      flag: "comparison" },
    { label: "עקביות",  path: "/consistency",  flag: "consistencyAnalysis" },
  ],
  tools: [
    { label: "אינדיקציה",    path: "/indications", flag: "indications" },
    { label: "סטטוס קרנות", path: "/fund-status",  flag: "fundStatus" },
  ],
  admin: [
    { label: "קרנות",      path: "/admin" },
    { label: "בנצ'מרקים", path: "/admin/benchmarks", flag: "benchmarks" },
    { label: "העלאת דוח", path: "/upload",            flag: "desktopUpload" },
  ],
};

function filterSubs(subs: SubTab[], features: AppFeatures | undefined): SubTab[] {
  return subs.filter((s) => !s.flag || (features?.[s.flag] ?? true));
}

function getActiveTab(pathname: string): TabKey {
  if (
    pathname.startsWith("/analysis") || pathname.startsWith("/charts") ||
    pathname.startsWith("/compare")  || pathname.startsWith("/consistency")
  ) return "analysis";
  if (pathname.startsWith("/indications") || pathname.startsWith("/fund-status"))
    return "tools";
  if (pathname.startsWith("/admin") || pathname.startsWith("/upload"))
    return "admin";
  return "funds";
}

export default function AppHeader({ fundCount: _fundCount = 84 }: AppHeaderProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const [hoveredTab, setHoveredTab] = useState<TabKey | null>(null);
  const clientKey = useClientKey();
  const brand     = useBrand(clientKey);

  useEffect(() => {
    if (typeof document === "undefined") return;
    let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = brand.favicon || "/favicon.svg";
  }, [brand.favicon]);

  const activeTab = getActiveTab(pathname);

  const visibleTabs = TABS.filter((tab) => {
    const subs = SUB_TABS[tab.key];
    if (subs.length === 0) return true;
    return filterSubs(subs, brand.features).length > 0;
  });

  const visibleSubBar = hoveredTab ?? (filterSubs(SUB_TABS[activeTab], brand.features).length > 0 ? activeTab : null);
  const subTabs = visibleSubBar ? filterSubs(SUB_TABS[visibleSubBar], brand.features) : [];

  const prefix   = `/${clientKey}`;
  const navigate = (path: string) => router.push(`${prefix}${path}`);
  const isSubActive = (path: string) => {
    const full = `${prefix}${path}`;
    if (path === "/admin") return pathname === full || pathname === `${prefix}/admin`;
    return pathname === full || pathname.startsWith(full + "/");
  };

  const accentColor  = brand.accentColor  || "#B8975A";
  const primaryColor = brand.primaryColor || "#1B3A2F";

  return (
    <div
      className="app-header no-print"
      data-app-header="true"
      onMouseLeave={() => setHoveredTab(null)}
      style={{ position: "sticky", top: 0, zIndex: 100 }}
    >
      {/* Single row: logo | nav | spacer | print button */}
      <div
        style={{
          height: 52,
          background: "#ffffff",
          borderBottom: "0.5px solid rgba(27, 58, 47, 0.18)",
          boxShadow: "0 1px 0 rgba(27, 58, 47, 0.04)",
          display: "flex",
          alignItems: "center",
          padding: "0 32px",
          direction: "rtl",
          gap: 24,
        }}
      >
        {/* Logo */}
        {brand.logoLight ? (
          <img
            src={brand.logoLight}
            alt={brand.name || clientKey}
            style={{ height: 34, width: "auto", objectFit: "contain", flexShrink: 0 }}
          />
        ) : brand.logo ? (
          <img
            src={brand.logo}
            alt={brand.name || clientKey}
            style={{ height: 34, width: "auto", objectFit: "contain", flexShrink: 0 }}
          />
        ) : (
          <span style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 18,
            fontWeight: 500,
            color: primaryColor,
            letterSpacing: "3px",
            lineHeight: 1,
            flexShrink: 0,
          }}>
            {brand.name || clientKey.toUpperCase()}
          </span>
        )}

        {/* Nav tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  const subs = filterSubs(SUB_TABS[tab.key], brand.features);
                  if (subs.length > 0) navigate(subs[0].path);
                  else navigate("/");
                }}
                onMouseEnter={() => setHoveredTab(tab.key)}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: isActive
                    ? `1.5px solid ${accentColor}`
                    : "1.5px solid transparent",
                  cursor: "pointer",
                  padding: "4px 0",
                  fontSize: 13,
                  color: isActive ? primaryColor : "rgba(27, 58, 47, 0.6)",
                  fontWeight: isActive ? 500 : 400,
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                  transition: "color 0.12s ease, border-color 0.12s ease",
                  lineHeight: 1.2,
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Print button */}
        <button
          onClick={() => typeof window !== "undefined" && window.print()}
          style={{
            padding: "5px 11px",
            border: "0.5px solid rgba(27, 58, 47, 0.27)",
            background: "white",
            borderRadius: 5,
            fontSize: 11,
            cursor: "pointer",
            color: primaryColor,
            fontFamily: "inherit",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 4,
            transition: "background 0.12s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#FAFAF7"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "white"; }}
        >
          ⎙ הדפסה
        </button>
      </div>

      {/* Sub bar */}
      {subTabs.length > 0 && (
        <div
          style={{
            height: 36,
            background: "#f5f5f7",
            display: "flex",
            alignItems: "center",
            padding: "0 32px",
            direction: "rtl",
            gap: 4,
            borderBottom: `1px solid ${accentColor}`,
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
                  color: primaryColor,
                  fontWeight: isActive ? 500 : 400,
                  borderBottom: isActive
                    ? `2px solid ${accentColor}`
                    : "2px solid transparent",
                  transition: "border 0.12s, color 0.12s",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.fontWeight = "500";
                  if (!isActive) el.style.borderBottom = `2px solid ${primaryColor}`;
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.fontWeight = isActive ? "500" : "400";
                  el.style.borderBottom = isActive
                    ? `2px solid ${accentColor}`
                    : "2px solid transparent";
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
