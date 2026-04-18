"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useClientKey, withClient } from "@/lib/useClientKey";
import { useBrand } from "@/lib/useBrand";
import { Indication, Fund, Category } from "@/lib/types";
import ClientGate from "@/components/ClientGate";
import BrandLogo from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeProvider";
import { brandCssVars } from "@/lib/colors";

/* ── helpers ─────────────────────────────────────────────── */
function currentReportMonth(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${yyyy}`;
}

function pct(v: number) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(2)}%`;
}

/* ── main page ───────────────────────────────────────────── */
function IndicationsContent() {
  const clientKey = useClientKey();
  const router = useRouter();
  const searchParams = useSearchParams();
  const brand = useBrand(clientKey);
  const passwordRef = useRef<string>("");
  const autoFundId = searchParams.get("fund");

  const [funds, setFunds] = useState<Fund[]>([]);
  const [indications, setIndications] = useState<Indication[]>([]);
  const [loading, setLoading] = useState(true);

  // Entry form
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedFund, setSelectedFund] = useState<Fund | null>(null);
  const [monthReturn, setMonthReturn] = useState("");
  const [ytd, setYtd] = useState("");
  const [reportMonth, setReportMonth] = useState(currentReportMonth());
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editMonthReturn, setEditMonthReturn] = useState("");
  const [editYtd, setEditYtd] = useState("");
  const [editReportMonth, setEditReportMonth] = useState("");

  const searchRef = useRef<HTMLInputElement>(null);

  // Read stored password after ClientGate auth
  useEffect(() => {
    const pw = sessionStorage.getItem(`client-auth-password-${clientKey}`) || "";
    passwordRef.current = pw;
  }, [clientKey]);

  // Check feature flag + load data
  useEffect(() => {
    if (!brand.features?.indications) return;

    const fetchAll = async () => {
      const [fundsRes, indRes] = await Promise.all([
        fetch(`/api/funds?client=${encodeURIComponent(clientKey)}`),
        fetch(`/api/indications?client=${encodeURIComponent(clientKey)}`),
      ]);
      const fundsData = await fundsRes.json();
      const indData = await indRes.json();
      const allFunds: Fund[] = (fundsData.categories || []).flatMap((c: Category) => c.funds);
      setFunds(allFunds.filter((f) => (f.active !== false)));
      setIndications(Array.isArray(indData) ? indData : []);
      setLoading(false);
    };
    fetchAll();
  }, [clientKey, brand.features?.indications]);

  // Redirect if feature disabled (after brand loaded)
  useEffect(() => {
    if (brand.name !== "" && brand.features?.indications === false) {
      router.replace(withClient("/", clientKey));
    }
  }, [brand, clientKey, router]);

  // Auto-select fund when navigated from fund-status (?fund=<id>)
  useEffect(() => {
    if (!autoFundId || funds.length === 0 || selectedFund) return;
    const match = funds.find((f) => f.id === autoFundId);
    if (match) selectFund(match);
  }, [autoFundId, funds]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredFunds = funds.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectFund = (f: Fund) => {
    setSelectedFund(f);
    setSearch(f.name);
    setShowDropdown(false);
    setMonthReturn("");
    setYtd("");
  };

  const clearSelection = () => {
    setSelectedFund(null);
    setSearch("");
    setShowDropdown(false);
    setMonthReturn("");
    setYtd("");
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const handleSave = useCallback(async () => {
    if (!selectedFund || monthReturn === "" || ytd === "") return;
    if (!reportMonth.match(/^\d{2}\/\d{4}$/)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/indications?client=${encodeURIComponent(clientKey)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": passwordRef.current,
        },
        body: JSON.stringify({
          fundId: selectedFund.id,
          monthReturn: parseFloat(monthReturn) / 100,
          ytd: parseFloat(ytd) / 100,
          reportMonth,
        }),
      });
      if (res.ok) {
        const newInd: Indication = await res.json();
        setIndications((prev) => [...prev, newInd]);
        setSavedId(newInd.id);
        setTimeout(() => setSavedId(null), 2000);
        clearSelection();
      }
    } finally {
      setSaving(false);
    }
  }, [selectedFund, monthReturn, ytd, reportMonth, clientKey]);

  const handleDeleteMonth = async () => {
    if (sorted.length === 0) return;
    const monthCounts: Record<string, number> = {};
    sorted.forEach((i) => { monthCounts[i.reportMonth] = (monthCounts[i.reportMonth] || 0) + 1; });
    const dominantMonth = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    if (!dominantMonth) return;
    if (!confirm(`למחוק את כל האינדיקציות של חודש ${dominantMonth}?`)) return;
    const res = await fetch(
      `/api/indications?month=${encodeURIComponent(dominantMonth)}&client=${encodeURIComponent(clientKey)}`,
      { method: "DELETE", headers: { "x-admin-password": passwordRef.current } }
    );
    if (res.ok) {
      setIndications((prev) => prev.filter((i) => i.reportMonth !== dominantMonth));
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/indications?id=${id}&client=${encodeURIComponent(clientKey)}`, {
      method: "DELETE",
      headers: { "x-admin-password": passwordRef.current },
    });
    if (res.ok) setIndications((prev) => prev.filter((i) => i.id !== id));
  };

  const startEdit = (ind: Indication) => {
    setEditId(ind.id);
    setEditMonthReturn((ind.monthReturn * 100).toFixed(2));
    setEditYtd((ind.ytd * 100).toFixed(2));
    setEditReportMonth(ind.reportMonth);
  };

  const saveEdit = async (id: string) => {
    const res = await fetch(`/api/indications?client=${encodeURIComponent(clientKey)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-admin-password": passwordRef.current },
      body: JSON.stringify({
        id,
        monthReturn: parseFloat(editMonthReturn) / 100,
        ytd: parseFloat(editYtd) / 100,
        reportMonth: editReportMonth,
      }),
    });
    if (res.ok) {
      const updated: Indication = await res.json();
      setIndications((prev) => prev.map((i) => (i.id === id ? updated : i)));
      setEditId(null);
    }
  };

  // Pending funds (in current reportMonth, not yet entered)
  const enteredFundIds = new Set(
    indications.filter((i) => i.reportMonth === reportMonth).map((i) => i.fundId)
  );
  const pendingCount = funds.filter((f) => !enteredFundIds.has(f.id)).length;

  // Sorted indications: high monthReturn first
  const sorted = [...indications].sort((a, b) => b.monthReturn - a.monthReturn);

  const canSave = selectedFund && monthReturn !== "" && ytd !== "" && reportMonth.match(/^\d{2}\/\d{4}$/);

  if (loading || brand.name === "") {
    return <div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)" }}>טוען...</div>;
  }

  const PRIMARY = brand.primaryColor || "#1B3A2F";
  const ACCENT = brand.accentColor || "#B8975A";

  return (
    <div style={{ minHeight: "100vh", ...brandCssVars(PRIMARY, ACCENT) as React.CSSProperties }}>
      {/* Header */}
      <div style={{ height: 4, backgroundColor: PRIMARY }} />
      <div style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <BrandLogo brand={brand} height={26} variant="light" />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>אינדיקציה מהירה</span>
            <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 10, backgroundColor: "#f59e0b20", color: "#f59e0b", fontWeight: 600 }}>
              אינדיקטיבי · לא מאומת
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a href={withClient("/indications/output", clientKey)} style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--bg-input)" }}>
              פלט ↗
            </a>
            <a href={withClient("/", clientKey)} style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)" }}>דוח</a>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 24px" }}>
        {/* Pending banner */}
        {pendingCount > 0 && (
          <div style={{ marginBottom: 16, padding: "10px 16px", borderRadius: 8, backgroundColor: "#f59e0b15", border: "1px solid #f59e0b40", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>⏳</span>
            <span style={{ fontSize: 13, color: "#d97706", fontWeight: 600 }}>
              ממתין ל-{pendingCount} קרנות לחודש {reportMonth}
            </span>
          </div>
        )}

        {/* Entry form */}
        <div style={{ backgroundColor: "var(--bg-surface)", borderRadius: 12, padding: "20px 24px", border: "1px solid var(--border)", marginBottom: 24, boxShadow: "var(--shadow-card)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>הזנה מהירה</div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            {/* Fund search */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 220px", minWidth: 0 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>שם קרן</label>
              <div style={{ position: "relative" }}>
              <input
                ref={searchRef}
                type="text"
                placeholder="חיפוש קרן..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShowDropdown(true);
                  if (selectedFund && e.target.value !== selectedFund.name) setSelectedFund(null);
                }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setShowDropdown(false); }
                }}
                style={{
                  width: "100%", padding: "8px 14px", borderRadius: 8, fontSize: 13,
                  border: `1px solid ${selectedFund ? PRIMARY : "var(--border)"}`,
                  backgroundColor: "var(--bg-input)", color: "var(--text-primary)", outline: "none",
                  boxSizing: "border-box",
                }}
                dir="rtl"
                autoComplete="off"
              />
              {selectedFund && (
                <button onClick={clearSelection} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16, padding: 2, lineHeight: 1 }}>✕</button>
              )}
              {showDropdown && !selectedFund && search.length > 0 && filteredFunds.length > 0 && (
                <div style={{ position: "absolute", top: "100%", right: 0, left: 0, zIndex: 100, backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, marginTop: 4, maxHeight: 220, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
                  {filteredFunds.slice(0, 20).map((f) => (
                    <div
                      key={f.id}
                      onMouseDown={() => selectFund(f)}
                      style={{ padding: "9px 14px", cursor: "pointer", fontSize: 13, color: "var(--text-primary)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-surface-alt)")}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      {f.currency && (
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, backgroundColor: f.currency === "USD" ? "#3b82f615" : "#10b98115", color: f.currency === "USD" ? "#3b82f6" : "#10b981", fontWeight: 600 }}>
                          {f.currency}
                        </span>
                      )}
                      {f.name}
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>

            {/* Month % */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>חודש%</label>
              <input
                type="number"
                placeholder="0.00"
                value={monthReturn}
                onChange={(e) => setMonthReturn(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave(); }}
                disabled={!selectedFund}
                style={{
                  width: 100, padding: "8px 12px", borderRadius: 8, fontSize: 14, textAlign: "center",
                  border: "1px solid var(--border)", backgroundColor: selectedFund ? "var(--bg-input)" : "var(--bg-surface-alt)",
                  color: "var(--text-primary)", outline: "none",
                }}
                dir="ltr"
                step="0.01"
              />
            </div>

            {/* YTD % */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>YTD%</label>
              <input
                type="number"
                placeholder="0.00"
                value={ytd}
                onChange={(e) => setYtd(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave(); }}
                disabled={!selectedFund}
                style={{
                  width: 100, padding: "8px 12px", borderRadius: 8, fontSize: 14, textAlign: "center",
                  border: "1px solid var(--border)", backgroundColor: selectedFund ? "var(--bg-input)" : "var(--bg-surface-alt)",
                  color: "var(--text-primary)", outline: "none",
                }}
                dir="ltr"
                step="0.01"
              />
            </div>

            {/* Report month */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>חודש דיווח</label>
              <input
                type="text"
                placeholder="MM/YYYY"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
                style={{
                  width: 100, padding: "8px 12px", borderRadius: 8, fontSize: 13, textAlign: "center",
                  border: "1px solid var(--border)", backgroundColor: "var(--bg-input)", color: "var(--text-primary)", outline: "none",
                }}
                dir="ltr"
              />
            </div>

            {/* Save button */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 11, color: "transparent" }}>‌</label>
              <button
                onClick={handleSave}
                disabled={!canSave || saving}
                style={{
                  padding: "8px 24px", borderRadius: 8, fontWeight: 700, fontSize: 13, border: "none",
                  backgroundColor: canSave && !saving ? PRIMARY : "var(--border)",
                  color: canSave && !saving ? "#fff" : "var(--text-muted)",
                  cursor: canSave && !saving ? "pointer" : "default",
                  transition: "background-color 0.15s",
                }}
              >
                {saving ? "שומר..." : "שמור"}
              </button>
            </div>
          </div>

          {selectedFund && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)" }}>
              נבחר: <strong style={{ color: "var(--text-primary)" }}>{selectedFund.name}</strong>
              {selectedFund.currency && (
                <span style={{ marginRight: 8, fontSize: 10, padding: "1px 6px", borderRadius: 4, backgroundColor: selectedFund.currency === "USD" ? "#3b82f615" : "#10b98115", color: selectedFund.currency === "USD" ? "#3b82f6" : "#10b981", fontWeight: 600 }}>
                  {selectedFund.currency}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        {sorted.length > 0 && (
          <div style={{ backgroundColor: "var(--bg-surface)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
            <div style={{ padding: "14px 20px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  {sorted.length} אינדיקציות
                </span>
                <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 10, backgroundColor: "#f59e0b20", color: "#f59e0b", fontWeight: 600 }}>
                  אינדיקטיבי · לא מאומת
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={handleDeleteMonth}
                  style={{ fontSize: 11, padding: "4px 12px", borderRadius: 6, border: "1px solid #ef444430", backgroundColor: "transparent", color: "#ef4444", cursor: "pointer", fontWeight: 600 }}
                >
                  🗑 איפוס חודש
                </button>
                <a href={withClient("/indications/output", clientKey)} style={{ fontSize: 12, color: PRIMARY, textDecoration: "none", fontWeight: 600 }}>
                  צור פלט →
                </a>
              </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ backgroundColor: "var(--bg-surface-alt)" }}>
                  <th style={thS}>שם קרן</th>
                  <th style={thS}>מטבע</th>
                  <th style={thS}>חודש%</th>
                  <th style={thS}>YTD%</th>
                  <th style={thS}>חודש דיווח</th>
                  <th style={thS}>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((ind, idx) => {
                  const isEditing = editId === ind.id;
                  const isNew = savedId === ind.id;
                  const bg = isNew ? `${PRIMARY}15` : idx % 2 === 0 ? "var(--bg-surface)" : "var(--bg-surface-alt)";
                  return (
                    <tr key={ind.id} style={{ backgroundColor: bg, transition: "background-color 0.3s" }}>
                      <td style={tdS}>{ind.fundName}</td>
                      <td style={{ ...tdS, textAlign: "center" }}>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, backgroundColor: ind.currency === "USD" ? "#3b82f615" : "#10b98115", color: ind.currency === "USD" ? "#3b82f6" : "#10b981", fontWeight: 600 }}>
                          {ind.currency}
                        </span>
                      </td>
                      {isEditing ? (
                        <>
                          <td style={tdS}>
                            <input type="number" value={editMonthReturn} onChange={(e) => setEditMonthReturn(e.target.value)} style={inlineInput} step="0.01" dir="ltr" />
                          </td>
                          <td style={tdS}>
                            <input type="number" value={editYtd} onChange={(e) => setEditYtd(e.target.value)} style={inlineInput} step="0.01" dir="ltr" />
                          </td>
                          <td style={tdS}>
                            <input type="text" value={editReportMonth} onChange={(e) => setEditReportMonth(e.target.value)} style={{ ...inlineInput, width: 90 }} dir="ltr" />
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ ...tdS, textAlign: "center", color: ind.monthReturn >= 0 ? "#10b981" : "#ef4444", fontWeight: 600 }}>
                            {pct(ind.monthReturn)}
                          </td>
                          <td style={{ ...tdS, textAlign: "center", color: ind.ytd >= 0 ? "#10b981" : "#ef4444", fontWeight: 600 }}>
                            {pct(ind.ytd)}
                          </td>
                          <td style={{ ...tdS, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>{ind.reportMonth}</td>
                        </>
                      )}
                      <td style={{ ...tdS, textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                          {isEditing ? (
                            <>
                              <button onClick={() => saveEdit(ind.id)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, backgroundColor: PRIMARY, color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }}>שמור</button>
                              <button onClick={() => setEditId(null)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, backgroundColor: "var(--bg-surface-alt)", color: "var(--text-secondary)", border: "1px solid var(--border)", cursor: "pointer" }}>ביטול</button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(ind)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, backgroundColor: "var(--bg-input)", color: "var(--text-secondary)", border: "1px solid var(--border)", cursor: "pointer" }}>עריכה</button>
                              <button onClick={() => handleDelete(ind.id)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, backgroundColor: "transparent", color: "#ef4444", border: "1px solid #ef444430", cursor: "pointer" }}>מחק</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {sorted.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: 13 }}>
            אין אינדיקציות עדיין — הזן קרן ראשונה למעלה
          </div>
        )}
      </div>
    </div>
  );
}

const thS: React.CSSProperties = {
  padding: "8px 12px", textAlign: "right", fontWeight: 500, fontSize: 11, color: "var(--text-muted)",
};
const tdS: React.CSSProperties = {
  padding: "9px 12px", borderBottom: "1px solid var(--border)", fontSize: 13, color: "var(--text-primary)",
};
const inlineInput: React.CSSProperties = {
  width: 80, padding: "4px 8px", borderRadius: 5, border: "1px solid var(--border)",
  fontSize: 13, textAlign: "center", backgroundColor: "var(--bg-input)", color: "var(--text-primary)",
};

export default function IndicationsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)" }}>טוען...</div>}>
      <IndicationsGate />
    </Suspense>
  );
}

function IndicationsGate() {
  const clientKey = useClientKey();
  return (
    <ClientGate clientKey={clientKey}>
      <IndicationsContent />
    </ClientGate>
  );
}
