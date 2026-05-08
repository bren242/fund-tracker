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
  { key: "funds", label: "קרנות" },
  { key: "analysis", label: "ניתוח" },
  { key: "tools", label: "כלים" },
  { key: "admin", label: "ניהול" },
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

/** Returns subs that pass their feature flag (missing flag = always visible) */
function filterSubs(subs: SubTab[], features: AppFeatures | undefined): SubTab[] {
  return subs.filter((s) => !s.flag || (features?.[s.flag] ?? true));
}

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

export default function AppHeader({ fundCount = 84 }: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [hoveredTab, setHoveredTab] = useState<TabKey | null>(null);
  const clientKey = useClientKey();
  const brand = useBrand(clientKey);

  // Dynamic favicon per tenant (uses brand.favicon if set, else default)
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

  // Filter tabs + sub-tabs by feature flags
  const visibleTabs = TABS.filter((tab) => {
    const subs = SUB_TABS[tab.key];
    if (subs.length === 0) return true; // "funds" / tabs with no subs — always show
    return filterSubs(subs, brand.features).length > 0;
  });

  const visibleSubBar = hoveredTab ?? (filterSubs(SUB_TABS[activeTab], brand.features).length > 0 ? activeTab : null);
  const subTabs = visibleSubBar ? filterSubs(SUB_TABS[visibleSubBar], brand.features) : [];

  const prefix = `/${clientKey}`;

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
      data-app-header="true"
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
        {brand.logoLight ? (
          <img
            src={brand.logoLight}
            alt={brand.name || clientKey}
            style={{ height: "38px", width: "auto", objectFit: "contain", display: "block" }}
          />
        ) : brand.logo ? (
          <img
            src={brand.logo}
            alt={brand.name || clientKey}
            style={{ height: "38px", width: "auto", objectFit: "contain", display: "block" }}
          />
        ) : (
          <span style={{ fontSize: 16, fontWeight: 700, color: "#1B3A2F", letterSpacing: "1px" }}>
            {brand.name || clientKey.toUpperCase()}
          </span>
        )}
        <span style={{ fontSize: 12, color: "#999" }}>
          {pathname !== "/" ? `${fundCount} קרנות פעילות` : null}
        </span>
      </div>

      {/* Nav bar */}
      <div
        style={{
          height: 44,
          background: brand.primaryColor || "#1B3A2F",
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          direction: "rtl",
          gap: 4,
        }}
      >
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
                cursor: "pointer",
                padding: "0 14px",
                height: 44,
                fontSize: 14,
                color: isActive ? "#ffffff" : "rgba(255,255,255,0.65)",
                borderBottom: isActive ? `2px solid ${brand.accentColor || "#B8975A"}` : "2px solid transparent",
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
            borderBottom: `1px solid ${brand.accentColor || "#B8975A"}`,
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
                  color: brand.primaryColor || "#1B3A2F",
                  fontWeight: isActive ? 500 : 400,
                  borderBottom: isActive ? `2px solid ${brand.accentColor || "#B8975A"}` : "2px solid transparent",
                  transition: "border 0.12s, color 0.12s",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.fontWeight = "500";
                  if (!isActive) el.style.borderBottom = `2px solid ${brand.primaryColor || "#1B3A2F"}`;
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.fontWeight = isActive ? "500" : "400";
                  el.style.borderBottom = isActive ? `2px solid ${brand.accentColor || "#B8975A"}` : "2px solid transparent";
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
