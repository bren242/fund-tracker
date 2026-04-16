"use client";

/**
 * /fund-report/[id] — Standalone print page for fund one-pager.
 * Opened in a new tab from the modal's print button.
 * Dynamically imports Body/Skel (ssr:false) to avoid recharts SSR crash.
 * Auto-triggers print dialog after data loads.
 */

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useBrand } from "@/lib/useBrand";
import type { ReportPayload } from "@/components/FundOnePagerModal";

/* Dynamic imports — ssr:false prevents recharts from running on server */
const Body = dynamic(
  () => import("@/components/FundOnePagerModal").then((m) => ({ default: m.Body })),
  { ssr: false, loading: () => null },
);
const Skel = dynamic(
  () => import("@/components/FundOnePagerModal").then((m) => ({ default: m.Skel })),
  { ssr: false, loading: () => null },
);

/* ── Inner page (needs useSearchParams → must be inside Suspense) ─── */

function PrintPageInner() {
  const params       = useParams();
  const searchParams = useSearchParams();
  const fundId    = Array.isArray(params.id) ? params.id[0] : (params.id as string);
  const clientKey = searchParams.get("client") || "green";

  const brand   = useBrand(clientKey);
  const primary = brand.primaryColor || "#1B3A2F";
  const accent  = brand.accentColor  || "#B8975A";
  const logo    = brand.logoLight || brand.logo || "";
  const today   = new Date().toLocaleDateString("he-IL");

  const [data,  setData]  = useState<ReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fundId) return;
    fetch(`/api/fund-report?fundId=${encodeURIComponent(fundId)}&client=${encodeURIComponent(clientKey)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Error");
        return r.json() as Promise<ReportPayload>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [fundId, clientKey]);

  /* Auto-print once data is ready (500ms delay for styles to settle) */
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => window.print(), 500);
    return () => clearTimeout(t);
  }, [data]);

  return (
    <>
      <style>{`
        /* Skeleton animation — required because Body is dynamically imported */
        @keyframes opSkel {
          0%   { background-position: 200% 0 }
          100% { background-position: -200% 0 }
        }
        * { box-sizing: border-box; }
        body {
          margin: 0; padding: 0;
          background: #f0ede8;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        /* Hide app header/nav — this is a dedicated print page */
        header, nav, [data-app-header] { display: none !important; }
        .print-page-shell {
          max-width: 740px; margin: 32px auto;
          background: #fff; border-radius: 12px;
          padding: 0 40px 32px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.12);
          direction: rtl;
        }
        .print-btn-bar {
          position: sticky; top: 0; z-index: 10;
          background: #fff; padding: 12px 0 4px;
          display: flex; justify-content: flex-start;
          margin-bottom: 4px;
        }
        .print-btn {
          padding: 7px 18px;
          background: ${primary}; color: #fff;
          border: none; border-radius: 7px;
          font-size: 13px; font-weight: 600;
          cursor: pointer; letter-spacing: 0.3px;
        }
        /* print-header / print-footer: hidden on screen, shown in print */
        .print-ph { display: none; }
        .print-pf { display: none; }

        @media print {
          header, nav, [data-app-header] { display: none !important; }
          body { background: #fff; }
          .print-btn-bar { display: none !important; }
          /* Hide Body's screen-only disclaimer section */
          .no-print { display: none !important; }
          .print-ph { display: flex !important; }
          .print-pf { display: flex !important; }
          .print-page-shell {
            margin: 0 !important; border-radius: 0 !important;
            box-shadow: none !important;
            padding: 0 18mm 0 !important;
            max-width: 100% !important;
          }
          /* Tighten section spacing to fit 2 pages */
          .onepager-section { margin-bottom: 18px !important; }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @page {
            size: A4 portrait;
            margin: 12mm 0 12mm 0;
          }
        }
      `}</style>

      <div className="print-page-shell">
        {/* Gradient top bar */}
        <div aria-hidden="true" style={{
          height: 3,
          background: `linear-gradient(90deg, ${primary}, ${accent})`,
          margin: "0 -40px",
          borderRadius: "12px 12px 0 0",
        }} />

        {/* Print button bar (hidden on print) */}
        <div className="print-btn-bar">
          <button className="print-btn" onClick={() => window.print()}>
            🖨 הדפסה
          </button>
        </div>

        {/* Print header */}
        <div className="print-ph" style={{
          justifyContent: "space-between", alignItems: "center",
          paddingBottom: 16, borderBottom: `0.5px solid #ddd`,
          marginBottom: 28, marginTop: 4,
        }}>
          {logo
            ? <img src={logo} alt="" style={{ height: 26, objectFit: "contain" }} />
            : <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, color: primary }}>{brand.fullName || brand.name}</div>
          }
          <div style={{ fontSize: 9, color: "#999", letterSpacing: 0.3 }}>
            ONE PAGER • {brand.fullName || brand.name} • {today}
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div style={{ padding: "60px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>⚠️</div>
            <div style={{ fontSize: 14, color: "#666" }}>לא ניתן לטעון את הדוח</div>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 6 }}>{error}</div>
          </div>
        )}

        {/* Loading skeleton */}
        {!data && !error && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 12 }}>
            <Skel w="55%" h={10} />
            <Skel w="75%" h={32} />
            <Skel w="40%" h={12} />
            <div style={{ height: 90, background: "#f0f0f0", borderRadius: 14 }} />
            <Skel h={200} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 8 }}>
              <Skel w="90%" h={18} /><Skel w="80%" h={18} /><Skel w="65%" h={18} />
            </div>
          </div>
        )}

        {/* Content */}
        {data && (
          <>
            <Body data={data} primary={primary} accent={accent} brand={brand} />

            {/* Print footer */}
            <div className="print-pf" style={{ flexDirection: "column", marginTop: 16 }}>
              <div style={{ borderTop: "0.5px solid #ddd", paddingTop: 14, textAlign: "center" }}>
                <div style={{ fontSize: 7.5, color: "#bbb", lineHeight: 1.6, marginBottom: 8 }}>
                  {brand.footerDisclaimer || "המידע לצורך ניתוח בלבד ואינו מהווה ייעוץ השקעות. אין לראות במידע המלצה לרכישה או מכירה של ניירות ערך."}
                </div>
                {logo && <img src={logo} alt="" style={{ height: 20, objectFit: "contain", marginBottom: 4 }} />}
                <div style={{ fontSize: 10, color: primary, letterSpacing: 2, fontWeight: 700 }}>
                  {brand.fullName || brand.name}
                </div>
                <div style={{ fontSize: 7, color: "#ccc", marginTop: 4 }}>
                  © {new Date().getFullYear()} {brand.fullName || brand.name}. כל הזכויות שמורות.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ── Page export ──────────────────────────────────────────────────── */

export default function FundReportPrintPage() {
  return (
    <Suspense fallback={
      <div style={{ direction: "rtl", padding: "60px 24px", textAlign: "center", color: "#888", fontFamily: "sans-serif" }}>
        טוען דוח...
      </div>
    }>
      <PrintPageInner />
    </Suspense>
  );
}
