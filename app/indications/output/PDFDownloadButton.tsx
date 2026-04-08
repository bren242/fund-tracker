"use client";

import { useState } from "react";
import { Document, Page, View, Text, StyleSheet, Font, pdf } from "@react-pdf/renderer";
import { Indication } from "@/lib/types";
import { BrandConfig } from "@/config/brand";

/* ── register Heebo font ─────────────────────────────────── */
Font.register({
  family: "Heebo",
  fonts: [
    { src: "/fonts/Heebo.ttf", fontWeight: 400 },
    { src: "/fonts/Heebo.ttf", fontWeight: 700 },
  ],
});

/* ── helpers ─────────────────────────────────────────────── */
function pctPdf(v: number) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(2)}%`;
}
function todayPdf() {
  return new Date().toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* ── PDF Document ────────────────────────────────────────── */
function IndicationsPDF({ items, brand }: { items: Indication[]; brand: BrandConfig }) {
  const PRIMARY = brand.primaryColor || "#1B3A2F";
  const ACCENT = brand.accentColor || "#B8975A";

  const styles = StyleSheet.create({
    page: { backgroundColor: "#FFFFFF", fontFamily: "Heebo", direction: "rtl" },
    header: { backgroundColor: PRIMARY, padding: "28 40 22 40", flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
    headerTitle: { color: ACCENT, fontSize: 22, fontWeight: 700 },
    headerSub: { color: "rgba(255,255,255,0.65)", fontSize: 11, marginTop: 5 },
    badge: { backgroundColor: "#f59e0b", color: "#ffffff", fontSize: 10, fontWeight: 700, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
    tableWrap: { paddingHorizontal: 32, paddingTop: 20 },
    colHeader: { flexDirection: "row-reverse", borderBottomWidth: 2, borderBottomColor: PRIMARY, paddingBottom: 6, marginBottom: 2 },
    colHeaderText: { color: PRIMARY, fontSize: 11, fontWeight: 700 },
    row: { flexDirection: "row-reverse", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#e5e7eb", alignItems: "center" },
    rowAlt: { backgroundColor: "#f9fafb" },
    fundName: { flex: 1, fontSize: 11, color: "#111827" },
    currencyCell: { width: 50, alignItems: "center" },
    currencyBadge: { fontSize: 9, fontWeight: 700, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    numCell: { width: 80, alignItems: "center" },
    numText: { fontSize: 13, fontWeight: 700 },
    positive: { color: "#059669" },
    negative: { color: "#dc2626" },
    footer: { backgroundColor: PRIMARY, padding: "14 40", marginTop: 20 },
    footerText: { color: "rgba(255,255,255,0.55)", fontSize: 9, textAlign: "center" },
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{brand.mainTitle || "GREEN Wealth Management"}</Text>
            <Text style={styles.headerSub}>נתונים אינדיקטיביים · {todayPdf()}</Text>
          </View>
          <View>
            <Text style={styles.badge}>אינדיקטיבי · לא מאומת</Text>
          </View>
        </View>

        {/* Table */}
        <View style={styles.tableWrap}>
          {/* Column headers */}
          <View style={styles.colHeader}>
            <Text style={[styles.colHeaderText, { flex: 1 }]}>שם קרן</Text>
            <Text style={[styles.colHeaderText, { width: 50, textAlign: "center" }]}>מטבע</Text>
            <Text style={[styles.colHeaderText, { width: 80, textAlign: "center" }]}>חודש אחרון</Text>
            <Text style={[styles.colHeaderText, { width: 80, textAlign: "center" }]}>YTD</Text>
          </View>

          {/* Rows */}
          {items.map((ind, idx) => (
            <View key={ind.id} style={[styles.row, idx % 2 === 1 ? styles.rowAlt : {}]}>
              <Text style={styles.fundName}>{ind.fundName}</Text>
              <View style={styles.currencyCell}>
                <Text style={[
                  styles.currencyBadge,
                  { backgroundColor: ind.currency === "USD" ? "#dbeafe" : "#d1fae5", color: ind.currency === "USD" ? "#1d4ed8" : "#047857" }
                ]}>
                  {ind.currency}
                </Text>
              </View>
              <View style={styles.numCell}>
                <Text style={[styles.numText, ind.monthReturn >= 0 ? styles.positive : styles.negative]}>
                  {pctPdf(ind.monthReturn)}
                </Text>
              </View>
              <View style={styles.numCell}>
                <Text style={[styles.numText, ind.ytd >= 0 ? styles.positive : styles.negative]}>
                  {pctPdf(ind.ytd)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            נתונים אינדיקטיביים בלבד · GREEN Wealth Management · {todayPdf()}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

/* ── Button component ────────────────────────────────────── */
export default function PDFDownloadButton({ selectedList, brand }: {
  selectedList: Indication[];
  brand: BrandConfig;
  clientKey: string;
}) {
  const [generating, setGenerating] = useState(false);

  const handlePDF = async () => {
    if (selectedList.length === 0 || generating) return;
    setGenerating(true);
    try {
      const blob = await pdf(<IndicationsPDF items={selectedList} brand={brand} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const d = new Date();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      link.download = `indications-${mm}-${yyyy}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setGenerating(false);
    }
  };

  const PRIMARY = brand.primaryColor || "#1B3A2F";

  return (
    <button
      onClick={handlePDF}
      disabled={selectedList.length === 0 || generating}
      style={{
        flex: 1, padding: "12px 0", borderRadius: 10, fontWeight: 700, fontSize: 14, border: "none",
        backgroundColor: selectedList.length > 0 && !generating ? PRIMARY : "var(--border)",
        color: selectedList.length > 0 && !generating ? "#fff" : "var(--text-muted)",
        cursor: selectedList.length > 0 && !generating ? "pointer" : "default",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        transition: "opacity 0.15s",
      }}
    >
      <span style={{ fontSize: 18 }}>📄</span>
      {generating ? "מייצר PDF..." : "הורדת PDF"}
    </button>
  );
}
