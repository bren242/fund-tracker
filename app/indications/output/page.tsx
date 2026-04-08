"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import dynamic from "next/dynamic";
import { useClientKey, withClient } from "@/lib/useClientKey";
import { useBrand } from "@/lib/useBrand";
import { Indication } from "@/lib/types";
import ClientGate from "@/components/ClientGate";
import BrandLogo from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeProvider";
import { brandCssVars } from "@/lib/colors";

/* ── react-pdf: client-only ─────────────────────────────── */
const PDFDownloadButton = dynamic(() => import("./PDFDownloadButton"), { ssr: false });

/* ── helpers ─────────────────────────────────────────────── */
function pct(v: number) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(2)}%`;
}
function today() {
  return new Date().toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* ── output content ─────────────────────────────────────── */
function OutputContent() {
  const clientKey = useClientKey();
  const brand = useBrand(clientKey);

  const [indications, setIndications] = useState<Indication[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);

  const hiddenRef = useRef<HTMLDivElement>(null);

  const PRIMARY = brand.primaryColor || "#1B3A2F";
  const ACCENT = brand.accentColor || "#B8975A";

  useEffect(() => {
    fetch(`/api/indications?client=${encodeURIComponent(clientKey)}`)
      .then((r) => r.json())
      .then((arr: Indication[]) => {
        const sorted = [...arr].sort((a, b) => b.monthReturn - a.monthReturn);
        setIndications(sorted);
        setSelected(new Set(sorted.map((i) => i.id)));
        setLoading(false);
      });
  }, [clientKey]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(indications.map((i) => i.id)));
  const clearAll = () => setSelected(new Set());

  const selectedList = indications.filter((i) => selected.has(i.id));

  /* ── WhatsApp image ─────────────────────────────────── */
  const handleWhatsapp = async () => {
    if (selectedList.length === 0) return;
    setCapturing(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      if (!hiddenRef.current) return;
      const canvas = await html2canvas(hiddenRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#F8F9FA",
        width: 1080,
        height: hiddenRef.current.scrollHeight,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `indications-${today().replace(/\//g, "-")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setCapturing(false);
    }
  };

  if (loading || brand.name === "") {
    return <div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)" }}>טוען...</div>;
  }

  return (
    <div style={{ minHeight: "100vh", ...brandCssVars(PRIMARY, ACCENT) as React.CSSProperties }}>
      {/* Header */}
      <div style={{ height: 4, backgroundColor: PRIMARY }} />
      <div style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <BrandLogo brand={brand} height={26} variant="light" />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>פלט אינדיקציה</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a href={withClient("/indications", clientKey)} style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)" }}>← הזנה</a>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 24px" }}>

        {/* Selection */}
        <div style={{ backgroundColor: "var(--bg-surface)", borderRadius: 12, padding: "16px 20px", border: "1px solid var(--border)", marginBottom: 20, boxShadow: "var(--shadow-card)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              בחר קרנות לפלט ({selected.size}/{indications.length})
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={selectAll} style={smallBtn}>הכל</button>
              <button onClick={clearAll} style={smallBtn}>נקה הכל</button>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {indications.map((ind) => {
              const on = selected.has(ind.id);
              return (
                <button
                  key={ind.id}
                  onClick={() => toggleSelect(ind.id)}
                  style={{
                    padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                    border: `1px solid ${on ? PRIMARY : "var(--border)"}`,
                    backgroundColor: on ? `${PRIMARY}15` : "var(--bg-input)",
                    color: on ? PRIMARY : "var(--text-secondary)",
                    fontWeight: on ? 600 : 400,
                    transition: "all 0.15s",
                  }}
                >
                  {ind.fundName}
                </button>
              );
            })}
          </div>
        </div>

        {/* Export buttons */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <button
            onClick={handleWhatsapp}
            disabled={selectedList.length === 0 || capturing}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 10, fontWeight: 700, fontSize: 14, border: "none",
              backgroundColor: selectedList.length > 0 && !capturing ? "#25D366" : "var(--border)",
              color: selectedList.length > 0 && !capturing ? "#fff" : "var(--text-muted)",
              cursor: selectedList.length > 0 && !capturing ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "opacity 0.15s",
            }}
          >
            <span style={{ fontSize: 18 }}>📱</span>
            {capturing ? "מייצר תמונה..." : "תמונה לוואטסאפ"}
          </button>

          <PDFDownloadButton
            selectedList={selectedList}
            brand={brand}
            clientKey={clientKey}
          />
        </div>

        {/* Preview table */}
        {selectedList.length > 0 && (
          <div style={{ backgroundColor: "var(--bg-surface)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>תצוגה מקדימה</span>
              <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 10, backgroundColor: "#f59e0b20", color: "#f59e0b", fontWeight: 600 }}>אינדיקטיבי · לא מאומת</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: "var(--bg-surface-alt)" }}>
                  <th style={thP}>שם קרן</th>
                  <th style={thPC}>מטבע</th>
                  <th style={thPC}>חודש אחרון</th>
                  <th style={thPC}>YTD</th>
                </tr>
              </thead>
              <tbody>
                {selectedList.map((ind, idx) => (
                  <tr key={ind.id} style={{ backgroundColor: idx % 2 === 0 ? "var(--bg-surface)" : "var(--bg-surface-alt)" }}>
                    <td style={tdP}>{ind.fundName}</td>
                    <td style={{ ...tdP, textAlign: "center" }}>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, backgroundColor: ind.currency === "USD" ? "#3b82f615" : "#10b98115", color: ind.currency === "USD" ? "#3b82f6" : "#10b981", fontWeight: 600 }}>
                        {ind.currency}
                      </span>
                    </td>
                    <td style={{ ...tdP, textAlign: "center", color: ind.monthReturn >= 0 ? "#10b981" : "#ef4444", fontWeight: 600 }}>{pct(ind.monthReturn)}</td>
                    <td style={{ ...tdP, textAlign: "center", color: ind.ytd >= 0 ? "#10b981" : "#ef4444", fontWeight: 600 }}>{pct(ind.ytd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedList.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)", fontSize: 13 }}>
            בחר לפחות קרן אחת לייצוא
          </div>
        )}
      </div>

      {/* Hidden canvas div for html2canvas — 1080px wide */}
      <div style={{ position: "absolute", left: -9999, top: 0, width: 1080, pointerEvents: "none" }}>
        <div ref={hiddenRef} style={{ width: 1080, backgroundColor: "#F8F9FA", fontFamily: "Arial, sans-serif", direction: "rtl" }}>
          {/* Header */}
          <div style={{ backgroundColor: PRIMARY, padding: "36px 60px 28px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                {(brand.logoLight || brand.logo) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={brand.logoLight || brand.logo}
                    alt={brand.name}
                    style={{ height: 60, marginBottom: 14, display: "block" }}
                    crossOrigin="anonymous"
                  />
                )}
                <div style={{ color: ACCENT, fontSize: 28, fontWeight: 800, letterSpacing: 0.5 }}>
                  {brand.mainTitle || "GREEN Wealth Management"}
                </div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 16, marginTop: 6 }}>
                  נתונים אינדיקטיביים · {today()}
                </div>
              </div>
              <div style={{ textAlign: "left" }}>
                <span style={{ backgroundColor: "#f59e0b", color: "#fff", padding: "6px 18px", borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
                  אינדיקטיבי · לא מאומת
                </span>
              </div>
            </div>
          </div>

          {/* Table */}
          <div style={{ padding: "32px 48px 20px" }}>
            {/* Column headers */}
            <div style={{ display: "flex", borderBottom: `2px solid ${PRIMARY}`, paddingBottom: 10, marginBottom: 4 }}>
              <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: PRIMARY }}>שם קרן</div>
              <div style={{ width: 80, textAlign: "center", fontSize: 14, fontWeight: 700, color: PRIMARY }}>מטבע</div>
              <div style={{ width: 140, textAlign: "center", fontSize: 14, fontWeight: 700, color: PRIMARY }}>חודש אחרון</div>
              <div style={{ width: 140, textAlign: "center", fontSize: 14, fontWeight: 700, color: PRIMARY }}>YTD</div>
            </div>
            {selectedList.map((ind, idx) => (
              <div
                key={ind.id}
                style={{
                  display: "flex", alignItems: "center",
                  padding: "13px 0",
                  borderBottom: "1px solid #e5e7eb",
                  backgroundColor: idx % 2 === 0 ? "transparent" : "#f9fafb",
                }}
              >
                <div style={{ flex: 1, fontSize: 16, color: "#111827", fontWeight: 500 }}>{ind.fundName}</div>
                <div style={{ width: 80, textAlign: "center" }}>
                  <span style={{
                    fontSize: 12, padding: "3px 10px", borderRadius: 6,
                    backgroundColor: ind.currency === "USD" ? "#dbeafe" : "#d1fae5",
                    color: ind.currency === "USD" ? "#1d4ed8" : "#047857",
                    fontWeight: 700,
                  }}>
                    {ind.currency}
                  </span>
                </div>
                <div style={{
                  width: 140, textAlign: "center", fontSize: 18, fontWeight: 700,
                  color: ind.monthReturn >= 0 ? "#059669" : "#dc2626",
                }}>
                  {pct(ind.monthReturn)}
                </div>
                <div style={{
                  width: 140, textAlign: "center", fontSize: 18, fontWeight: 700,
                  color: ind.ytd >= 0 ? "#059669" : "#dc2626",
                }}>
                  {pct(ind.ytd)}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ backgroundColor: PRIMARY, padding: "20px 60px", marginTop: 20 }}>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, textAlign: "center" }}>
              נתונים אינדיקטיביים בלבד · GREEN Wealth Management · {today()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const thP: React.CSSProperties = { padding: "8px 14px", textAlign: "right", fontWeight: 500, fontSize: 11, color: "var(--text-muted)" };
const thPC: React.CSSProperties = { ...thP, textAlign: "center" };
const tdP: React.CSSProperties = { padding: "9px 14px", borderBottom: "1px solid var(--border)", fontSize: 13, color: "var(--text-primary)" };
const smallBtn: React.CSSProperties = { fontSize: 11, padding: "4px 12px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--bg-input)", color: "var(--text-secondary)", cursor: "pointer" };

export default function OutputPage() {
  return (
    <Suspense fallback={<div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)" }}>טוען...</div>}>
      <OutputGate />
    </Suspense>
  );
}

function OutputGate() {
  const clientKey = useClientKey();
  return (
    <ClientGate clientKey={clientKey}>
      <OutputContent />
    </ClientGate>
  );
}
