"use client";

import { usePathname, useRouter } from "next/navigation";
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


  const activeTab    = getActiveTab(pathname);
  const onAdmin      = pathname.startsWith("/admin") || pathname.startsWith("/upload");
  const prefix       = `/${clientKey}`;
  const navigate     = (path: string) => router.push(`${prefix}${path}`);
  const accentColor  = brand.accentColor  || "#B8975A";
  const primaryColor = brand.primaryColor || "#1B3A2F";
  const features     = brand.features;

  // tools tab: show if at least one tool is enabled (default true when no features set)
  const toolsPath = (features?.indications ?? true) ? "/indications" : "/fund-status";
  const showTools = (features?.indications ?? true) || (features?.fundStatus ?? true);

  const tabs: { key: TabKey; label: string; path: string }[] = [
    { key: "funds",    label: "קרנות",  path: "/" },
    { key: "analysis", label: "ניתוח",  path: "/analysis" },
    ...(showTools ? [{ key: "tools" as TabKey, label: "כלים", path: toolsPath }] : []),
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
          <img
            src={brand.logoLight}
            alt={brand.name || clientKey}
            style={{ maxHeight: 34, width: "auto", objectFit: "contain", flexShrink: 0 }}
          />
        ) : brand.logo ? (
          <img
            src={brand.logo}
            alt={brand.name || clientKey}
            style={{ maxHeight: 34, width: "auto", objectFit: "contain", flexShrink: 0 }}
          />
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
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
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
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = primaryColor;
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "rgba(27, 58, 47, 0.6)";
                }}
              >
                {tab.label}
              </button>
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
            {/* Settings — lucide-react SVG paths */}
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
            {/* Printer — lucide-react SVG paths */}
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
