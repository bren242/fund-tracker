"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { FundsData, Fund } from "@/lib/types";
import { ThemeToggle } from "@/components/ThemeProvider";
import { formatDate } from "@/lib/format";
import { useBrand } from "@/lib/useBrand";
import { useClientKey, withClient } from "@/lib/useClientKey";
import BrandLogo from "@/components/BrandLogo";
import ClientGate from "@/components/ClientGate";
import { brandCssVars } from "@/lib/colors";

interface AnalysisEntry {
  catId: string;
  catName: string;
  fund: Fund;
  yearCount: number;
  yearlyVals: number[];
  computedAvg: number;
}

function analyzeData(data: FundsData) {
  const computable: AnalysisEntry[] = [];
  const notComputable: { fund: Fund; catName: string; yearCount: number }[] = [];

  for (const cat of data.categories) {
    for (const fund of cat.funds) {
      if (fund.active === false) continue;
      const hasAvg = fund.avgAnnualReturn !== null && fund.avgAnnualReturn !== undefined;
      if (hasAvg) continue;

      // Collect yearly returns
      const yearlyVals: number[] = [];
      for (const [k, v] of Object.entries(fund.returns)) {
        if (/^y\d{4}$/.test(k) && v !== null && v !== undefined) yearlyVals.push(v);
      }

      if (yearlyVals.length >= 2) {
        const computedAvg = yearlyVals.reduce((s, v) => s + v, 0) / yearlyVals.length;
        computable.push({
          catId: cat.id, catName: cat.name, fund,
          yearCount: yearlyVals.length, yearlyVals, computedAvg,
        });
      } else {
        notComputable.push({ fund, catName: cat.name, yearCount: yearlyVals.length });
      }
    }
  }

  return { computable, notComputable };
}

function DataCompletionContent() {
  const clientKey = useClientKey();
  const brand = useBrand(clientKey);
  const [data, setData] = useState<FundsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/funds?client=${encodeURIComponent(clientKey)}`)
      .then((r) => r.json())
      .then(setData);
  }, [clientKey]);

  const { computable, notComputable } = useMemo(() => {
    if (!data) return { computable: [], notComputable: [] };
    return analyzeData(data);
  }, [data]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return computable;
    const q = search.trim().toLowerCase();
    return computable.filter(a =>
      a.fund.name.toLowerCase().includes(q) || a.catName.toLowerCase().includes(q)
    );
  }, [computable, search]);

  // Init selection with all computable funds
  useEffect(() => {
    setSelected(new Set(computable.map(a => `${a.catId}-${a.fund.id}`)));
  }, [computable]);

  const selectedCount = filtered.filter(a => selected.has(`${a.catId}-${a.fund.id}`)).length;
  const allFilteredSelected = filtered.length > 0 && filtered.every(a => selected.has(`${a.catId}-${a.fund.id}`));

  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach(a => next.delete(`${a.catId}-${a.fund.id}`));
      } else {
        filtered.forEach(a => next.add(`${a.catId}-${a.fund.id}`));
      }
      return next;
    });
  };

  const toggleOne = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleCompute = async () => {
    if (!data || selectedCount === 0) return;
    const selectedEntries = computable.filter(a => selected.has(`${a.catId}-${a.fund.id}`));
    if (!window.confirm(`להשלים ממוצע שנתי ל-${selectedEntries.length} קרנות?\n\nהחישוב: ממוצע התשואות השנתיות`)) return;

    let updated = 0;
    const newData: FundsData = {
      ...data,
      categories: data.categories.map((cat) => ({
        ...cat,
        funds: cat.funds.map((fund) => {
          const entry = selectedEntries.find(a => a.fund.id === fund.id && a.catId === cat.id);
          if (!entry) return fund;
          updated++;
          return { ...fund, avgAnnualReturn: Math.round(entry.computedAvg * 10000) / 10000 };
        }),
      })),
    };

    // Save directly via API
    setSaving(true);
    const res = await fetch(`/api/funds?client=${encodeURIComponent(clientKey)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newData),
    });
    setSaving(false);

    if (res.ok) {
      setData(newData);
      setStatusMessage(`הושלם ממוצע שנתי ל-${updated} קרנות`);
    } else {
      setStatusMessage("שגיאה בשמירה");
    }
  };

  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>טוען נתונים...</div>;

  const totalMissing = computable.length + notComputable.length;
  const subtitle = brand.subtitleMode === "custom" && brand.customSubtitle
    ? brand.customSubtitle
    : `עדכון: ${formatDate(data.lastUpdated)}`;

  const linkStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", transition: "border-color 0.15s" };

  return (
    <ClientGate clientKey={clientKey}>
    <div style={{ minHeight: "100vh", ...brandCssVars(brand.primaryColor, brand.accentColor) } as React.CSSProperties}>
      <div className="no-print">
        {/* Thin brand color bar */}
        <div style={{ height: 4, backgroundColor: brand.primaryColor }} />
        {/* Header */}
        <div style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <BrandLogo brand={brand} height={28} variant="light" />
              <span style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 600 }}>{brand.mainTitle}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{subtitle}</span>
              {brand.version && (
                <span style={{ fontSize: 10, color: "var(--text-muted)", backgroundColor: "var(--bg-input)", padding: "2px 8px", borderRadius: 4, fontWeight: 500 }}>
                  v{brand.version}
                </span>
              )}
              <a href={withClient("/", clientKey)} style={linkStyle}>דוח</a>
              {brand.features?.chartPage && <a href={withClient("/charts", clientKey)} style={linkStyle}>גרפים</a>}
              <a href={withClient("/admin", clientKey)} style={linkStyle}>ניהול</a>
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 24px" }}>
          {/* Status bar */}
          {statusMessage && (
            <div style={{
              marginBottom: 16, padding: "10px 16px", borderRadius: 8,
              backgroundColor: statusMessage.includes("שגיאה") ? "#fef2f2" : "#f0fdf4",
              border: `1px solid ${statusMessage.includes("שגיאה") ? "#fecaca" : "#bbf7d0"}`,
              color: statusMessage.includes("שגיאה") ? "#dc2626" : "#059669",
              fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span>{statusMessage.includes("שגיאה") ? "❌" : "✓"} {statusMessage}</span>
              <button onClick={() => setStatusMessage("")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "inherit" }}>✕</button>
            </div>
          )}

          {/* Summary + search + action */}
          <div style={{
            marginBottom: 20, backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "16px 20px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: computable.length > 0 ? 12 : 0 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>
                  השלמת ממוצע שנתי
                </p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                  {totalMissing === 0
                    ? "כל הקרנות מלאות — ממוצע שנתי קיים בכל הקרנות הפעילות"
                    : `${totalMissing} קרנות ללא ממוצע שנתי, ${computable.length} ניתנות להשלמה (${notComputable.length} ללא מספיק שנים)`
                  }
                </p>
              </div>
              {selectedCount > 0 && (
                <button
                  onClick={handleCompute}
                  disabled={saving}
                  style={{
                    backgroundColor: "#059669", color: "#fff", fontWeight: 600, padding: "10px 24px",
                    borderRadius: 8, border: "none", cursor: saving ? "default" : "pointer",
                    fontSize: 13, opacity: saving ? 0.5 : 1,
                  }}>
                  {saving ? "שומר..." : `השלם ${selectedCount} קרנות נבחרות`}
                </button>
              )}
            </div>
            {/* Search */}
            {computable.length > 0 && (
              <input
                type="text"
                placeholder="חיפוש לפי שם קרן או קטגוריה..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%", padding: "8px 14px", borderRadius: 8,
                  border: "1px solid var(--border)", backgroundColor: "var(--bg-input)",
                  color: "var(--text-primary)", fontSize: 13, outline: "none",
                  boxSizing: "border-box",
                }}
              />
            )}
          </div>

          {/* Computable funds table */}
          {filtered.length > 0 && (
            <div style={{
              backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
              borderRadius: 10, overflow: "hidden", marginBottom: 20,
            }}>
              <div style={{ backgroundColor: "var(--bg-section)", color: "#fff", padding: "10px 16px", fontWeight: 600, fontSize: 13 }}>
                קרנות להשלמה ({filtered.length})
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ backgroundColor: "var(--bg-surface-alt)" }}>
                    <th style={{ padding: "8px 12px", textAlign: "center", width: 40 }}>
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleAll}
                        style={{ cursor: "pointer", width: 16, height: 16 }}
                      />
                    </th>
                    <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "var(--text-secondary)", fontSize: 11 }}>קרן</th>
                    <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "var(--text-secondary)", fontSize: 11 }}>קטגוריה</th>
                    <th style={{ padding: "8px 8px", textAlign: "center", fontWeight: 600, color: "var(--text-secondary)", fontSize: 11 }}>ממוצע שנתי מחושב</th>
                    <th style={{ padding: "8px 8px", textAlign: "center", fontWeight: 600, color: "var(--text-secondary)", fontSize: 11 }}>שנים</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => {
                    const key = `${a.catId}-${a.fund.id}`;
                    const isSelected = selected.has(key);
                    return (
                      <tr
                        key={key}
                        onClick={() => toggleOne(key)}
                        style={{
                          borderBottom: "1px solid var(--border-table)",
                          cursor: "pointer",
                          backgroundColor: isSelected ? "var(--bg-surface-alt)" : "transparent",
                          transition: "background-color 0.1s",
                        }}
                      >
                        <td style={{ padding: "6px 12px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(key)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ cursor: "pointer", width: 15, height: 15 }}
                          />
                        </td>
                        <td style={{ padding: "6px 12px", fontWeight: 500 }}>{a.fund.name}</td>
                        <td style={{ padding: "6px 12px", color: "var(--text-muted)", fontSize: 11 }}>{a.catName}</td>
                        <td style={{ padding: "6px 8px", textAlign: "center" }}>
                          <span style={{ color: "#3b82f6", fontWeight: 600 }}>{(a.computedAvg * 100).toFixed(2)}%</span>
                        </td>
                        <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 11, color: "var(--text-muted)" }}>
                          {a.yearCount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Funds that can't be computed */}
          {notComputable.length > 0 && (
            <div style={{
              backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
              borderRadius: 10, overflow: "hidden", marginBottom: 20,
            }}>
              <div style={{ backgroundColor: "#f59e0b30", padding: "10px 16px", fontWeight: 600, fontSize: 12, color: "#f59e0b" }}>
                קרנות ללא ממוצע שנתי — פחות מ-2 שנים ({notComputable.length})
              </div>
              <div style={{ padding: "8px 16px" }}>
                {notComputable.map((m) => (
                  <div key={m.fund.id} style={{ padding: "4px 0", fontSize: 11, display: "flex", gap: 8 }}>
                    <span style={{ fontWeight: 500 }}>{m.fund.name}</span>
                    <span style={{ color: "var(--text-muted)" }}>({m.catName})</span>
                    <span style={{ color: "#f59e0b" }}>{m.yearCount === 0 ? "אין תשואות שנתיות" : `שנה אחת בלבד`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All complete */}
          {totalMissing === 0 && (
            <div style={{
              backgroundColor: "#05966910", border: "1px solid #05966930",
              borderRadius: 10, padding: "40px 20px", textAlign: "center",
            }}>
              <p style={{ fontSize: 14, color: "#059669", fontWeight: 600, margin: 0 }}>&#10003; כל הקרנות מלאות</p>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0" }}>ממוצע שנתי קיים בכל הקרנות הפעילות</p>
            </div>
          )}
        </div>
      </div>
    </div>
    </ClientGate>
  );
}

export default function DataCompletionPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>טוען...</div>}>
      <DataCompletionContent />
    </Suspense>
  );
}
