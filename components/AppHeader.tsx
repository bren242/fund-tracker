"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useClientKey } from "@/lib/useClientKey";
import { useBrand } from "@/lib/useBrand";

interface AppHeaderProps {
  fundCount?: number;
}

type TabKey = "funds" | "analysis" | "tools";

function getActiveTab(pathname: string): TabKey | null {
  if (
    pathname.startsWith("/analysis") || pathname.startsWith("/charts") ||
    pathname.startsWith("/compare")  || pathname.startsWith("/consistency")
  ) return "analysis";
  if (pathname.startsWith("/indications") || pathname.startsWith("/fund-status"))
    return "tools";
  if (pathname.startsWith("/admin") || pathname.startsWith("/upload"))
    return null;
  return "funds";
}

export default function AppHeader({ fundCount: _fundCount = 84 }: AppHeaderProps) {
  const pathname  = usePathname();
  const router    = useRouter();
  const clientKey = useClientKey();
  const brand     = useBrand(clientKey);

  const [dropdownOpen, setDropdownOpen] = useState<TabKey | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTab    = getActiveTab(pathname);
  const onAdmin      = pathname.startsWith("/admin") || pathname.startsWith("/upload");
  const prefix       = `/${clientKey}`;
  const navigate     = (path: string) => { router.push(`${prefix}${path}`); setDropdownOpen(null); };
  const accentColor  = brand.accentColor  || "#B8975A";
  const primaryColor = brand.primaryColor || "#1B3A2F";
  const features     = brand.features;

  // ── Dropdown items ─────────────────────────────────────────────────────────
  const analysisItems = [
    { label: "דירוג",     path: "/analysis" },
    ...(features?.comparison         !== false ? [{ label: "השוואה",   path: "/compare"         }] : []),
    ...(features?.chartPage          !== false ? [{ label: "גרף",      path: "/charts"          }] : []),
    ...(features?.consistencyAnalysis !== false ? [{ label: "עקביות",   path: "/consistency/v2"  }] : []),
  ];

  const toolsItems = [
    ...(features?.indications !== false ? [{ label: "אינדיקציות",    path: "/indications" }] : []),
    ...(features?.fundStatus  !== false ? [{ label: "סטטוס קרנות",   path: "/fund-status" }] : []),
  ];

  const dropdownItems: Partial<Record<TabKey, { label: string; path: string }[]>> = {
    analysis: analysisItems,
    tools:    toolsItems,
  };

  // ── Hover handlers ─────────────────────────────────────────────────────────
  const openDropdown = (key: TabKey) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (dropdownItems[key]?.length) setDropdownOpen(key);
  };

  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setDropdownOpen(null), 150);
  };

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  // ── Feature visibility ─────────────────────────────────────────────────────
  const showTools = (features?.indications ?? true) || (features?.fundStatus ?? true);

  const tabs: { key: TabKey; label: string; path: string }[] = [
    { key: "funds",    label: "קרנות",  path: "/" },
    { key: "analysis", label: "ניתוח",  path: "/analysis" },
    ...(showTools ? [{ key: "tools" as TabKey, label: "כלים", path: toolsItems[0]?.path ?? "/indications" }] : []),
  ];

  const iconBtn = (active: boolean) => ({
    width: 32, height: 32, border: "none", borderRadius: 6,
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    background: active ? "rgba(27,58,47,0.09)" : "transparent",
    color: active ? primaryColor : "rgba(27,58,47,0.5)",
    flexShrink: 0, transition: "background 0.12s, color 0.12s",
  });

  return (
    <div
      className="app-header no-print"
      data-app-header="true"
      style={{ position: "sticky", top: 0, zIndex: 100, backgroundColor: "#ffffff" }}
    >
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
          <img src={brand.logoLight} alt={brand.name || clientKey}
            style={{ maxHeight: 34, width: "auto", objectFit: "contain", flexShrink: 0 }} />
        ) : brand.logo ? (
          <img src={brand.logo} alt={brand.name || clientKey}
            style={{ maxHeight: 34, width: "auto", objectFit: "contain", flexShrink: 0 }} />
        ) : (
          <span style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 18, fontWeight: 500, color: primaryColor,
            letterSpacing: "3px", lineHeight: 1, flexShrink: 0,
          }}>
            {brand.name || clientKey.toUpperCase()}
          </span>
        )}

        {/* Nav tabs */}
        <nav style={{ display: "flex", alignItems: "center", gap: 20, flexShrink: 0 }}>
          {tabs.map((tab) => {
            const isActive   = activeTab === tab.key;
            const items      = dropdownItems[tab.key] ?? [];
            const hasDropdown = items.length > 0;
            const isOpen     = dropdownOpen === tab.key;

            return (
              <div
                key={tab.key}
                style={{ position: "relative" }}
                onMouseEnter={() => openDropdown(tab.key)}
                onMouseLeave={scheduleClose}
              >
                {/* Tab button */}
                <button
                  onClick={() => navigate(tab.path)}
                  style={{
                    background: "none", border: "none",
                    borderBottom: isActive
                      ? `1.5px solid ${accentColor}`
                      : "1.5px solid transparent",
                    cursor: "pointer", padding: "4px 0",
                    fontSize: 13,
                    color: isActive ? primaryColor : "rgba(27, 58, 47, 0.6)",
                    fontWeight: isActive ? 500 : 400,
                    fontFamily: "inherit", whiteSpace: "nowrap",
                    transition: "color 0.12s ease, border-color 0.12s ease",
                    lineHeight: 1.2,
                    display: "flex", alignItems: "center", gap: 3,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = primaryColor;
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "rgba(27, 58, 47, 0.6)";
                  }}
                >
                  {tab.label}
                  {hasDropdown && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"
                      style={{ opacity: 0.45, marginTop: 1, transition: "transform 0.12s", transform: isOpen ? "rotate(180deg)" : "none" }}>
                      <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>

                {/* Dropdown panel */}
                {hasDropdown && isOpen && (
                  <div
                    onMouseEnter={cancelClose}
                    onMouseLeave={scheduleClose}
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      right: 0,
                      minWidth: 130,
                      backgroundColor: "#ffffff",
                      border: "1px solid rgba(27,58,47,0.12)",
                      borderRadius: 8,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                      padding: "4px 0",
                      zIndex: 200,
                      direction: "rtl",
                    }}
                  >
                    {items.map((item) => {
                      const itemActive = pathname.includes(item.path.replace("/v2", ""));
                      return (
                        <button
                          key={item.path}
                          onClick={() => navigate(item.path)}
                          style={{
                            display: "block", width: "100%",
                            background: itemActive ? `${primaryColor}0d` : "none",
                            border: "none", textAlign: "right",
                            padding: "8px 16px",
                            fontSize: 13,
                            color: itemActive ? primaryColor : "rgba(27,58,47,0.75)",
                            fontWeight: itemActive ? 600 : 400,
                            fontFamily: "inherit", cursor: "pointer",
                            whiteSpace: "nowrap",
                            transition: "background 0.1s, color 0.1s",
                          }}
                          onMouseEnter={(e) => {
                            if (!itemActive) {
                              (e.currentTarget as HTMLButtonElement).style.background = `${primaryColor}08`;
                              (e.currentTarget as HTMLButtonElement).style.color = primaryColor;
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!itemActive) {
                              (e.currentTarget as HTMLButtonElement).style.background = "none";
                              (e.currentTarget as HTMLButtonElement).style.color = "rgba(27,58,47,0.75)";
                            }
                          }}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Action icons: settings + print */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {/* Settings / Admin */}
          <button
            onClick={() => navigate("/admin")}
            title="ניהול"
            style={iconBtn(onAdmin)}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(27,58,47,0.08)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = onAdmin ? "rgba(27,58,47,0.09)" : "transparent"; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>

          {/* Print */}
          <button
            onClick={() => typeof window !== "undefined" && window.print()}
            title="הדפסה"
            style={iconBtn(false)}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(27,58,47,0.08)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/>
              <rect x="6" y="14" width="12" height="8" rx="1"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
