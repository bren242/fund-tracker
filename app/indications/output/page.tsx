"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useClientKey, withClient } from "@/lib/useClientKey";
import { useBrand } from "@/lib/useBrand";
import { Indication } from "@/lib/types";
import ClientGate from "@/components/ClientGate";
import BrandLogo from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeProvider";
import { brandCssVars } from "@/lib/colors";

/* ── helpers ─────────────────────────────────────────────── */
// No + sign — color distinguishes positive/negative
function pctCard(v: number) {
  return `${(v * 100).toFixed(2)}%`;
}
function today() {
  return new Date().toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* ── Inline logo — SVG-style div on beige ────────────────── */
function GreenLogoInline() {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, backgroundColor: "#f5f0e8", padding: "10px 16px 10px 10px", borderRadius: 6, marginBottom: 14 }}>
      <div style={{ backgroundColor: "#1B3A2F", padding: "6px 14px", borderRadius: 4 }}>
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 20, letterSpacing: 3, fontFamily: "Arial, sans-serif" }}>GREEN</span>
      </div>
      <span style={{ color: "#5a7a6a", fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase" as const, fontFamily: "Arial, sans-serif" }}>WEALTH MANAGEMENT</span>
    </div>
  );
}

/* ── Shared card content (used in hidden div + modal mirror) */
function CardContent({ selectedList, primary, accent, reportMonth }: {
  selectedList: Indication[];
  primary: string;
  accent: string;
  reportMonth: string;
}) {
  return (
    <div style={{ width: 1080, backgroundColor: "#F8F9FA", fontFamily: "Arial, sans-serif", direction: "rtl" }}>
      {/* Header strip */}
      <div style={{ backgroundColor: primary, padding: "10px 24px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <GreenLogoInline />
            <div style={{ color: accent, fontSize: 22, fontWeight: 800, letterSpacing: 0.5 }}>
              GREEN Wealth Management
            </div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 4 }}>
              נתונים אינדיקטיביים · {reportMonth} · {today()}
            </div>
          </div>
          <div>
            <span style={{ backgroundColor: "#f59e0b", color: "#fff", padding: "6px 18px", borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
              אינדיקטיבי · לא מאומת
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ padding: "32px 48px 0px" }}>
        <div style={{ display: "flex", borderBottom: `2px solid ${primary}`, paddingBottom: 10, marginBottom: 4 }}>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: primary }}>שם קרן</div>
          <div style={{ width: 80, textAlign: "center", fontSize: 14, fontWeight: 700, color: primary }}>מטבע</div>
          <div style={{ width: 140, textAlign: "center", fontSize: 14, fontWeight: 700, color: primary }}>חודש אחרון</div>
          <div style={{ width: 140, textAlign: "center", fontSize: 14, fontWeight: 700, color: primary }}>YTD</div>
        </div>
        {selectedList.map((ind, idx) => (
          <div
            key={ind.id}
            style={{ display: "flex", alignItems: "center", padding: "13px 0", borderBottom: "1px solid #e5e7eb", backgroundColor: idx % 2 === 0 ? "transparent" : "#f9fafb" }}
          >
            <div style={{ flex: 1, fontSize: 16, color: "#111827", fontWeight: 500 }}>{ind.fundName}</div>
            <div style={{ width: 80, textAlign: "center" }}>
              <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, backgroundColor: ind.currency === "USD" ? "#dbeafe" : "#d1fae5", color: ind.currency === "USD" ? "#1d4ed8" : "#047857", fontWeight: 700 }}>
                {ind.currency}
              </span>
            </div>
            <div style={{ width: 140, textAlign: "center", fontSize: 18, fontWeight: 700, color: ind.monthReturn >= 0 ? "#059669" : "#dc2626" }}>
              {pctCard(ind.monthReturn)}
            </div>
            <div style={{ width: 140, textAlign: "center", fontSize: 18, fontWeight: 700, color: ind.ytd >= 0 ? "#059669" : "#dc2626" }}>
              {pctCard(ind.ytd)}
            </div>
          </div>
        ))}

        {/* Footnote */}
        <div style={{ borderTop: "1px solid #c8bfa8", marginTop: 20, paddingTop: 10, paddingBottom: 16 }}>
          <span style={{ fontSize: 9, color: "#7a6a55" }}>*אינדיקציה לתשואות כפי שנמסרו מהקרנות</span>
        </div>
      </div>

      {/* Footer */}
      <div style={{ backgroundColor: primary, padding: "16px 60px" }}>
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, textAlign: "center" }}>
          GREEN Wealth Management · {today()}
        </div>
      </div>
    </div>
  );
}

/* ── output content ─────────────────────────────────────── */
function OutputContent() {
  const clientKey = useClientKey();
  const brand = useBrand(clientKey);

  const [indications, setIndications] = useState<Indication[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<"image" | "pdf">("image");
  const [downloading, setDownloading] = useState(false);

  // Card ref for dynamic height calculation
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(0);

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

  // Recalculate card height when selection changes
  useEffect(() => {
    const measure = () => {
      if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
    };
    measure();
    const timer = setTimeout(measure, 100);
    return () => clearTimeout(timer);
  }, [selected, indications]);

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

  // Most common reportMonth among selected
  const reportMonth = selectedList.length > 0
    ? [...selectedList]
        .map((i) => i.reportMonth)
        .sort((a, b) =>
          selectedList.filter((x) => x.reportMonth === b).length -
          selectedList.filter((x) => x.reportMonth === a).length
        )[0]
    : today().slice(3); // MM/YYYY fallback

  const openPreview = (mode: "image" | "pdf") => {
    setPreviewMode(mode);
    setPreviewOpen(true);
  };

  /* ── Download handler ──────────────────────────────────── */
  const handleDownload = async () => {
    if (!cardRef.current || selectedList.length === 0) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#F8F9FA",
        logging: false,
      });

      const fileName = `green-indications-${reportMonth.replace("/", "-")}`;

      if (previewMode === "image") {
        const link = document.createElement("a");
        link.download = `${fileName}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      } else {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "a4" });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const imgHeight = (canvas.height * pageWidth) / canvas.width;
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, pageWidth, imgHeight);
        pdf.save(`${fileName}.pdf`);
      }
      setPreviewOpen(false);
    } finally {
      setDownloading(false);
    }
  };

  if (loading || brand.name === "") {
    return <div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)" }}>טוען...</div>;
  }

  const scaleRatio = 0.42;
  const previewHeight = cardHeight > 0 ? Math.round(cardHeight * scaleRatio) : 300;

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
            onClick={() => openPreview("image")}
            disabled={selectedList.length === 0}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 10, fontWeight: 700, fontSize: 14, border: "none",
              backgroundColor: selectedList.length > 0 ? "#25D366" : "var(--border)",
              color: selectedList.length > 0 ? "#fff" : "var(--text-muted)",
              cursor: selectedList.length > 0 ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <span style={{ fontSize: 18 }}>📱</span>
            תמונה לוואטסאפ
          </button>

          <button
            onClick={() => openPreview("pdf")}
            disabled={selectedList.length === 0}
            style={{
              flex: 1, padding: "12px 0", borderRadius: 10, fontWeight: 700, fontSize: 14, border: "none",
              backgroundColor: selectedList.length > 0 ? PRIMARY : "var(--border)",
              color: selectedList.length > 0 ? "#fff" : "var(--text-muted)",
              cursor: selectedList.length > 0 ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <span style={{ fontSize: 18 }}>📄</span>
            PDF
          </button>
        </div>

        {selectedList.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)", fontSize: 13 }}>
            בחר לפחות קרן אחת לייצוא
          </div>
        )}
      </div>

      {/* Hidden card for html2canvas — 1080px, off-screen */}
      <div style={{ position: "absolute", left: -9999, top: 0, width: 1080, pointerEvents: "none" }}>
        <div ref={cardRef} style={{ width: 1080 }}>
          <CardContent selectedList={selectedList} primary={PRIMARY} accent={ACCENT} reportMonth={reportMonth} />
        </div>
      </div>

      {/* Preview Modal */}
      {previewOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewOpen(false); }}
          style={{
            position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.72)",
            zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{
            backgroundColor: "#fff", borderRadius: 12, width: "90vw", maxWidth: 480,
            maxHeight: "90vh", overflowY: "auto", position: "relative",
            display: "flex", flexDirection: "column",
          }}>
            {/* Modal header */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#111827", direction: "rtl" }}>
                תצוגה מקדימה — {previewMode === "image" ? "תמונה" : "PDF"}
              </span>
              <button onClick={() => setPreviewOpen(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6b7280", lineHeight: 1, padding: "0 4px" }}>✕</button>
            </div>

            {/* Scaled preview */}
            <div style={{ padding: "16px 20px", backgroundColor: "#f9fafb", overflow: "hidden" }}>
              <div style={{ height: previewHeight, overflow: "hidden", position: "relative" }}>
                <div style={{
                  width: 1080,
                  transform: `scale(${scaleRatio})`,
                  transformOrigin: "top right",
                  position: "absolute", top: 0, right: 0,
                }}>
                  {/* Mirror of hidden card */}
                  <CardContent selectedList={selectedList} primary={PRIMARY} accent={ACCENT} reportMonth={reportMonth} />
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <button
                onClick={() => setPreviewOpen(false)}
                style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #d1d5db", backgroundColor: "#fff", color: "#374151", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
              >
                סגור
              </button>
              <button
                onClick={handleDownload}
                disabled={downloading}
                style={{
                  padding: "8px 24px", borderRadius: 8, border: "none",
                  backgroundColor: downloading ? "#9ca3af" : PRIMARY,
                  color: "#fff", cursor: downloading ? "default" : "pointer",
                  fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8,
                }}
              >
                {downloading ? "מוריד..." : previewMode === "image" ? "📱 הורד תמונה" : "📄 הורד PDF"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
