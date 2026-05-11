"use client";

import { useEffect, useState, useCallback, useRef, useMemo, Suspense } from "react";
import { FundsData, Fund, Category, Benchmark } from "@/lib/types";
import { pct, returnColorInline, formatReportDate } from "@/lib/format";
import {
  computeLatestMonth,
  computeYTDFromMonthlyReturns,
  computeAnnualReturn,
  computeAvgAnnualReturn,
  computeSharpe,
  computeStdDev,
} from "@/lib/metrics";
import { getLastUpdated } from "@/lib/fundDerived";
import { ThemeToggle } from "@/components/ThemeProvider";
import { useBrand, invalidateBrandCache } from "@/lib/useBrand";
import { useClientKey, withClient } from "@/lib/useClientKey";
import { BrandConfig, AppFeatures } from "@/config/brand";
import BrandLogo from "@/components/BrandLogo";
import PasswordInput from "@/components/PasswordInput";
import BulkUpdateFromText from "@/components/admin/BulkUpdateFromText";

/* ================================================================== */
/*  Admin Page                                                         */
/* ================================================================== */
function AdminContent() {
  const clientKey = useClientKey();
  const [role, setRole] = useState<"super" | "admin" | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [data, setData] = useState<FundsData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<"data" | "bulk-text" | "funds" | "branding" | "settings" | "monthly-history" | "ai-parser" | "benchmarks" | "indications" | "consistency">("data");
  const brand = useBrand(clientKey);
  const [showAddFund, setShowAddFund] = useState(false);
  const [addFundCategory, setAddFundCategory] = useState("");
  const [editingFund, setEditingFund] = useState<{ catId: string; fund: Fund } | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const passwordRef = useRef(password);
  passwordRef.current = password;

  const categoryInitRef = useRef(false);
  const loadData = useCallback(() => {
    fetch(`/api/funds?admin=true&client=${encodeURIComponent(clientKey)}`).then((r) => r.json()).then((d: FundsData) => {
      // Guard against corrupted data (missing categories array)
      if (!d.categories || !Array.isArray(d.categories)) {
        d.categories = [];
      }
      setData(d);
      if (!categoryInitRef.current && d.categories.length > 0) {
        setAddFundCategory(d.categories[0].id);
        categoryInitRef.current = true;
      }
    });
  }, [clientKey]);

  useEffect(() => {
    if (role) loadData();
  }, [role, loadData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`/api/funds?action=verify&client=${encodeURIComponent(clientKey)}`, {
      method: "POST",
      headers: { "x-admin-password": password },
    });
    if (res.ok) {
      const { role: r } = await res.json();
      setRole(r);
      setError("");
    } else {
      setError("סיסמה שגויה");
    }
  };

  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showStatus = (msg: string) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatusMessage(msg);
    const isError = msg.startsWith("❌");
    if (!isError) {
      statusTimerRef.current = setTimeout(() => setStatusMessage(""), 3000);
    }
    // Errors stay until dismissed
  };

  const updateFund = (categoryId: string, fundId: string, field: string, value: string) => {
    if (!data) return;
    setDirty(true);
    setSaved(false);

    const numVal = value === "" || value === "—" ? null : parseFloat(value) / 100;

    setData({
      ...data,
      categories: data.categories.map((cat) => {
        if (cat.id !== categoryId) return cat;
        return {
          ...cat,
          funds: cat.funds.map((fund) => {
            if (fund.id !== fundId) return fund;
            if (field === "monthlyReturn") {
              // Also save to monthlyReturns history based on lastUpdated
              const mr = { ...(fund.monthlyReturns || {}) };
              if (data.lastUpdated && numVal !== null) {
                const monthKey = data.lastUpdated.slice(0, 7); // "2026-04" — already YYYY-MM, slice is a no-op guard
                mr[monthKey] = numVal;
              }
              return { ...fund, monthlyReturn: numVal, monthlyReturns: mr };
            }
            if (field === "ytd2026") return { ...fund, returns: { ...fund.returns, ytd2026: numVal } };
            return fund;
          }),
        };
      }),
    });
  };

  const deleteFund = (categoryId: string, fundId: string, fundName: string) => {
    if (!data) return;
    if (!window.confirm(`למחוק את הקרן "${fundName}"? פעולה זו בלתי הפיכה.`)) return;
    setDirty(true);
    setSaved(false);
    setData({
      ...data,
      categories: data.categories.map((cat) => {
        if (cat.id !== categoryId) return cat;
        return { ...cat, funds: cat.funds.filter((f) => f.id !== fundId) };
      }),
    });
    showStatus("✓ הקרן נמחקה — שמור לפרסום");
  };

  const toggleActive = (categoryId: string, fundId: string) => {
    if (!data) return;
    setDirty(true);
    setSaved(false);
    setData({
      ...data,
      categories: data.categories.map((cat) => {
        if (cat.id !== categoryId) return cat;
        return {
          ...cat,
          funds: cat.funds.map((fund) => {
            if (fund.id !== fundId) return fund;
            const current = fund.active !== undefined ? fund.active : true;
            return { ...fund, active: !current };
          }),
        };
      }),
    });
  };

  const moveFund = async (categoryId: string, fundId: string, direction: "up" | "down") => {
    if (!data) return;
    try {
      const res = await fetch(`/api/funds?action=move-fund&client=${encodeURIComponent(clientKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ categoryId, fundId, direction }),
      });
      if (res.ok) {
        loadData();
      }
    } catch {
      showStatus("❌ שגיאה בהזזת קרן");
    }
  };

  const updateLastUpdated = (dateStr: string) => {
    if (!data) return;
    setDirty(true);
    setSaved(false);
    setData({ ...data, lastUpdated: dateStr });
  };

  /** Sync local state after per-fund lastUpdated PATCH succeeds.
   * Does NOT mark dirty — server already persisted the value via PATCH.
   * Without this, a later global handleSave would overwrite the PATCH value
   * with the stale React state (→ reset to current-month default). */
  const applyFundLastUpdatedLocal = (
    categoryId: string,
    fundId: string,
    lastUpdated: string,
    lastUpdatedAt: string,
  ) => {
    if (!data) return;
    setData({
      ...data,
      categories: data.categories.map((cat) => {
        if (cat.id !== categoryId) return cat;
        return {
          ...cat,
          funds: cat.funds.map((fund) =>
            fund.id === fundId ? { ...fund, lastUpdated, lastUpdatedAt } : fund,
          ),
        };
      }),
    });
  };

  const handleSave = async () => {
    if (!data || saving) return;
    setSaving(true);

    const toSave = { ...data };

    const res = await fetch(`/api/funds?client=${encodeURIComponent(clientKey)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": passwordRef.current,
      },
      body: JSON.stringify(toSave),
    });

    setSaving(false);
    if (res.ok) {
      setData(toSave);
      setSaved(true);
      setDirty(false);
      showStatus("✓ הנתונים נשמרו בהצלחה");
    } else {
      showStatus("❌ שגיאה בשמירה");
    }
  };

  const handleExport = () => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${clientKey}-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus("✓ הגיבוי יורד");
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        if (!imported.categories || !Array.isArray(imported.categories)) {
          showStatus("❌ קובץ לא תקין");
          return;
        }
        const res = await fetch(`/api/funds?action=import&client=${encodeURIComponent(clientKey)}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-admin-password": passwordRef.current,
          },
          body: text,
        });
        if (res.ok) {
          loadData();
          showStatus("✓ הנתונים יובאו בהצלחה");
          setDirty(false);
        } else {
          showStatus("❌ שגיאה בייבוא");
        }
      } catch {
        showStatus("❌ קובץ לא תקין");
      }
    };
    input.click();
  };

  const addFund = (fund: Fund, categoryId: string) => {
    if (!data) return;
    setDirty(true);
    setSaved(false);

    // Handle new category creation: "__new__:{id}:{name}:{parentSection}"
    if (categoryId.startsWith("__new__:")) {
      const parts = categoryId.split(":");
      const newCat: Category = {
        id: parts[1],
        name: parts[2],
        parentSection: parts.slice(3).join(":"), // parentSection may contain colons
        funds: [fund],
      };
      setData({ ...data, categories: [...data.categories, newCat] });
    } else {
      setData({
        ...data,
        categories: data.categories.map((cat) => {
          if (cat.id !== categoryId) return cat;
          return { ...cat, funds: [...cat.funds, fund] };
        }),
      });
    }
    setShowAddFund(false);
    showStatus("✓ הקרן נוספה — שמור לפרסום");
  };

  const updateFullFund = (categoryId: string, updatedFund: Fund) => {
    if (!data) return;
    setDirty(true);
    setSaved(false);
    setData({
      ...data,
      categories: data.categories.map((cat) => {
        if (cat.id !== categoryId) return cat;
        return {
          ...cat,
          funds: cat.funds.map((f) => (f.id === updatedFund.id ? updatedFund : f)),
        };
      }),
    });
    setEditingFund(null);
    showStatus("✓ הקרן עודכנה — שמור לפרסום");
  };

  /* ---- Login screen ---- */
  if (!role) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--bg-page)" }}>
        <form onSubmit={handleLogin} style={{ backgroundColor: "var(--bg-surface)", borderRadius: 14, padding: 40, width: 360, boxShadow: "var(--shadow-card)", border: "1px solid var(--border)" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <BrandLogo brand={brand} height={36} variant="light" style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>כניסה לממשק ניהול</p>
          </div>
          <PasswordInput value={password} onChange={setPassword} autoFocus style={{ marginBottom: 12 }} />
          {error && <p style={{ color: "var(--negative)", fontSize: 13, textAlign: "center", marginBottom: 12 }}>{error}</p>}
          <button
            type="submit"
            style={{ width: "100%", backgroundColor: brand.primaryColor, color: "#fff", borderRadius: 8, padding: "10px 0", fontWeight: 700, border: "none", cursor: "pointer", fontSize: 14, letterSpacing: 0.3 }}
          >
            כניסה
          </button>
          <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "16px 0 0", opacity: 0.6, textAlign: "center" }}>Developed by Brenner</p>
        </form>
      </div>
    );
  }

  /* ---- Loading ---- */
  if (!data) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 16, color: "var(--text-muted)" }}>טוען נתונים...</span>
      </div>
    );
  }

  /* ---- Main admin UI ---- */
  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Sticky controls bar */}
      <div style={{ position: "sticky", top: 52, zIndex: 99, background: "#FAFAF7", borderBottom: "0.5px solid #eaecee" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "10px 24px", display: "flex", alignItems: "center", gap: 6, direction: "rtl" }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "nowrap", overflowX: "auto", scrollbarWidth: "none" } as React.CSSProperties}>
            {[
              { id: "data" as const, label: "עדכון חודשי" },
              { id: "bulk-text" as const, label: "עדכון מטקסט" },
              { id: "funds" as const, label: "ניהול קרנות" },
              ...(role === "super" ? [
                { id: "monthly-history" as const, label: "היסטוריה חודשית" },
                ...(brand.features?.aiParser ? [{ id: "ai-parser" as const, label: "קליטת נתונים" }] : []),
                ...(brand.features?.benchmarks ? [{ id: "benchmarks" as const, label: "מדדי ייחוס" }] : []),
                ...(brand.features?.consistencyAnalysis ? [{ id: "consistency" as const, label: "עקביות" }] : []),
                { id: "indications" as const, label: "אינדיקציה" },
                { id: "branding" as const, label: "מיתוג" },
                { id: "settings" as const, label: "הגדרות" },
              ] : []),
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "5px 14px", borderRadius: 20, fontSize: 12, border: "none",
                  cursor: "pointer", whiteSpace: "nowrap",
                  background: activeTab === tab.id ? (brand.primaryColor || "#1B3A2F") : "#F4F3EF",
                  color: activeTab === tab.id ? "#fff" : "#6b7280",
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  transition: "all 0.12s",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          {statusMessage && (
            <span style={{ fontSize: 12, fontWeight: 500, color: statusMessage.startsWith("✓") ? "#34d399" : "#f87171", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {statusMessage}
              {statusMessage.startsWith("❌") && (
                <button onClick={() => setStatusMessage("")} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 14, padding: "0 2px", lineHeight: 1 }}>✕</button>
              )}
            </span>
          )}
          {dirty && !saved && !statusMessage && (
            <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 500, flexShrink: 0 }}>● שינויים לא נשמרו</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: saving || !dirty ? "#9ca3af" : "#1B3A2F",
              color: "#fff", fontWeight: 600, padding: "6px 16px",
              borderRadius: 8, border: "none",
              cursor: saving || !dirty ? "default" : "pointer",
              fontSize: 12, opacity: saving || !dirty ? 0.5 : 1,
              transition: "opacity 0.15s, background 0.15s",
              flexShrink: 0,
            }}
          >
            {!saving && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
            )}
            {saving ? "שומר..." : "שמירה ופרסום"}
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 24px" }}>
        {activeTab === "data" && (
          <MonthlyDataTab data={data} password={passwordRef.current} clientKey={clientKey} onAfterSave={loadData} />
        )}
        {activeTab === "bulk-text" && (
          <BulkUpdateFromText clientKey={clientKey} password={passwordRef.current} onStatus={showStatus} onReload={loadData} />
        )}
        {activeTab === "funds" && (
          <FundManagementTab
            data={data}
            onToggleActive={toggleActive}
            onDelete={deleteFund}
            onShowAdd={() => setShowAddFund(true)}
            onEdit={(catId, fund) => setEditingFund({ catId, fund })}
            onMoveFund={moveFund}
            addFundCategory={addFundCategory}
            setAddFundCategory={setAddFundCategory}
          />
        )}
        {activeTab === "monthly-history" && (
          <MonthlyHistoryTab data={data} onUpdateMonthlyReturn={(catId, fundId, month, value) => {
            if (!data) return;
            setDirty(true);
            setSaved(false);
            const numVal = value === "" ? undefined : parseFloat(value) / 100;
            setData({
              ...data,
              categories: data.categories.map((cat) => {
                if (cat.id !== catId) return cat;
                return {
                  ...cat,
                  funds: cat.funds.map((fund) => {
                    if (fund.id !== fundId) return fund;
                    const mr = { ...(fund.monthlyReturns || {}) };
                    if (numVal === undefined) {
                      delete mr[month];
                    } else {
                      mr[month] = numVal;
                    }
                    return { ...fund, monthlyReturns: mr };
                  }),
                };
              }),
            });
          }} />
        )}
        {activeTab === "ai-parser" && brand.features?.aiParser && (
          <AiParserTab password={passwordRef.current} clientKey={clientKey} data={data} brand={brand} onStatus={showStatus} onReload={loadData} />
        )}
        {activeTab === "benchmarks" && brand.features?.benchmarks && (
          <BenchmarkTab password={passwordRef.current} clientKey={clientKey} onStatus={showStatus} />
        )}
        {activeTab === "consistency" && brand.features?.consistencyAnalysis && (
          <ConsistencyAdminTab clientKey={clientKey} password={password} />
        )}
        {activeTab === "indications" && (
          <IndicationsAdminTab password={passwordRef.current} clientKey={clientKey} onStatus={showStatus} brand={brand} onBrandRefresh={() => invalidateBrandCache(clientKey)} />
        )}
        {activeTab === "branding" && (
          <BrandingTab password={passwordRef.current} clientKey={clientKey} onStatus={showStatus} />
        )}
        {activeTab === "settings" && (
          <SettingsTab password={passwordRef.current} clientKey={clientKey} onStatus={showStatus} onExport={handleExport} onImport={handleImport} />
        )}
      </div>

      {/* Add Fund Modal */}
      {showAddFund && (
        <FundModal
          title="הוספת קרן חדשה"
          categories={data.categories}
          selectedCategory={addFundCategory}
          onCategoryChange={setAddFundCategory}
          onSave={(fund, catId) => addFund(fund, catId)}
          onClose={() => setShowAddFund(false)}
        />
      )}

      {/* Edit Fund Modal */}
      {editingFund && (
        <FundModal
          title="עריכת קרן"
          categories={data.categories}
          selectedCategory={editingFund.catId}
          existingFund={editingFund.fund}
          onSave={(fund, catId) => updateFullFund(catId, fund)}
          onClose={() => setEditingFund(null)}
        />
      )}

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "12px 0 16px", fontSize: 10, color: "var(--text-muted)" }}>
        {[brand.fullName, brand.version ? `v${brand.version}` : "", brand.showCredit && brand.creditText ? brand.creditText : ""].filter(Boolean).join(" — ")}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Monthly Data Tab                                                   */
/* ================================================================== */
function MonthlyDataTab({ data, password, clientKey, onAfterSave }: {
  data: FundsData;
  password: string;
  clientKey: string;
  onAfterSave: () => void;
}) {
  const [search, setSearch] = useState("");

  return (
    <>
      {/* Search */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="text"
          placeholder="חיפוש קרן..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "7px 14px",
            fontSize: 13,
            width: 260,
            backgroundColor: "var(--bg-input)",
            color: "var(--text-primary)",
            outline: "none",
          }}
          dir="rtl"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            style={{ fontSize: 12, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}
          >
            ✕ נקה
          </button>
        )}
      </div>

      {data.categories.map((cat) => {
        const visibleFunds = cat.funds.filter((f) => {
          const active = f.active !== undefined ? f.active : true;
          if (!active) return false;
          if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
          return true;
        });
        if (visibleFunds.length === 0) return null;
        return (
          <div key={cat.id} style={{ marginBottom: 24 }}>
            <div style={{ backgroundColor: "var(--bg-section)", color: "#fff", padding: "7px 16px", borderRadius: "10px 10px 0 0", fontWeight: 600, fontSize: 12 }}>
              {cat.name} <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.7 }}>({visibleFunds.length})</span>
            </div>
            <div style={{ backgroundColor: "var(--bg-surface)", borderRadius: "0 0 10px 10px", overflow: "hidden", border: "1px solid var(--border)", borderTop: "none" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: "var(--bg-surface-alt)" }}>
                    <th style={thStyle(190)}>שם קרן</th>
                    <th style={thStyle(80)}>מטבע</th>
                    <th style={thStyle(150)}>חודש</th>
                    <th style={thStyle(100)}>תשואה (%)</th>
                    <th style={thStyle(undefined)}>מדדים מחושבים</th>
                    <th style={thStyle(80)}></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleFunds.map((fund, idx) => (
                    <MonthlyRow key={fund.id} fund={fund} categoryId={cat.id} odd={idx % 2 === 1} password={password} clientKey={clientKey} onAfterSave={onAfterSave} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}

function thStyle(width?: number): React.CSSProperties {
  return {
    padding: "7px 10px",
    textAlign: "center",
    fontWeight: 500,
    fontSize: 11,
    color: "var(--text-muted)",
    width,
  };
}

const MONTH_HE_ADMIN: Record<string, string> = {
  "01": "ינואר", "02": "פברואר", "03": "מרץ", "04": "אפריל",
  "05": "מאי", "06": "יוני", "07": "יולי", "08": "אוגוסט",
  "09": "ספטמבר", "10": "אוקטובר", "11": "נובמבר", "12": "דצמבר",
};

function generateMonthOptions(): { value: string; label: string }[] {
  const now = new Date();
  const opts: { value: string; label: string }[] = [];
  for (let offset = 6; offset >= -35; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    opts.push({ value: `${yr}-${mo}`, label: `${MONTH_HE_ADMIN[mo]} ${yr}` });
  }
  return opts;
}

const MONTH_OPTIONS = generateMonthOptions();

function MonthlyRow({ fund, categoryId: _categoryId, odd, password, clientKey, onAfterSave }: {
  fund: Fund; categoryId: string; odd: boolean;
  password: string; clientKey: string;
  onAfterSave: () => void;
}) {
  const isNoxClient = clientKey === "nox";

  const defaultMonth = useMemo(() => {
    if (isNoxClient) {
      const mr2026 = fund.monthlyReturns2026 ?? {};
      const keys = Object.keys(mr2026).sort();
      if (keys.length === 0) {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
      const latestMo = parseInt(keys.at(-1)!);
      return latestMo === 12 ? "2027-01" : `2026-${String(latestMo + 1).padStart(2, "0")}`;
    }
    const latest = computeLatestMonth(fund.monthlyReturns ?? {});
    if (!latest) {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }
    const yr = parseInt(latest.slice(0, 4));
    const mo = parseInt(latest.slice(5, 7));
    return mo === 12
      ? `${yr + 1}-01`
      : `${yr}-${String(mo + 1).padStart(2, "0")}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [mtdInput, setMtdInput] = useState(() => {
    if (isNoxClient) {
      const mm = defaultMonth.slice(5, 7);
      const existing = (fund.monthlyReturns2026 as Record<string, number> | undefined)?.[mm];
      return typeof existing === "number" ? (existing * 100).toFixed(2) : "";
    }
    const existing = (fund.monthlyReturns as Record<string, number> | undefined)?.[defaultMonth];
    return typeof existing === "number" ? (existing * 100).toFixed(2) : "";
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [currVal, setCurrVal] = useState(fund.currency ?? "");
  const [currSaving, setCurrSaving] = useState(false);
  const [currSaved, setCurrSaved] = useState(false);

  useEffect(() => { setCurrVal(fund.currency ?? ""); }, [fund.currency]);

  useEffect(() => {
    if (isNoxClient) {
      const mm = selectedMonth.slice(5, 7);
      const existing = (fund.monthlyReturns2026 as Record<string, number> | undefined)?.[mm];
      setMtdInput(typeof existing === "number" ? (existing * 100).toFixed(2) : "");
    } else {
      const existing = (fund.monthlyReturns as Record<string, number> | undefined)?.[selectedMonth];
      setMtdInput(typeof existing === "number" ? (existing * 100).toFixed(2) : "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  const previewValue = useMemo(() => {
    const trimmed = mtdInput.trim();
    if (!trimmed) return null;
    const n = parseFloat(trimmed);
    return isNaN(n) ? null : n / 100;
  }, [mtdInput]);

  const previewMr = useMemo((): Record<string, number> => {
    const base: Record<string, number> = {};
    for (const [k, v] of Object.entries(fund.monthlyReturns ?? {})) {
      if (typeof v === "number") base[k] = v;
    }
    if (previewValue !== null) base[selectedMonth] = previewValue;
    return base;
  }, [fund.monthlyReturns, selectedMonth, previewValue]);

  const computed = useMemo(() => {
    if (isNoxClient) {
      const base: Record<string, number> = { ...(fund.monthlyReturns2026 ?? {}) };
      if (previewValue !== null && selectedMonth.startsWith("2026-")) {
        base[selectedMonth.slice(5, 7)] = previewValue;
      }
      const ytd2026 = Object.keys(base).length > 0
        ? Object.values(base).reduce((acc, r) => acc * (1 + r), 1) - 1
        : fund.returns?.ytd2026 ?? null;
      return {
        ytd2026,
        y2025: fund.returns?.y2025 ?? null,
        y2024: fund.returns?.y2024 ?? null,
        cagr:  fund.avgAnnualReturn,
        sharpe: fund.sharpe,
        stdDev: fund.stdDev,
      };
    }
    return {
      ytd2026: computeYTDFromMonthlyReturns(previewMr, "2026"),
      y2025:   computeAnnualReturn(previewMr, 2025),
      y2024:   computeAnnualReturn(previewMr, 2024),
      cagr:    computeAvgAnnualReturn(previewMr),
      sharpe:  computeSharpe(previewMr),
      stdDev:  computeStdDev(previewMr),
    };
  }, [previewMr, isNoxClient, fund, selectedMonth, previewValue]);

  const isPreview = previewValue !== null;
  const canSave = isPreview && !saving && (!isNoxClient || selectedMonth.startsWith("2026-"));
  const monthHasData = isNoxClient
    ? (fund.monthlyReturns2026 as Record<string, number> | undefined)?.[selectedMonth.slice(5, 7)] !== undefined
    : (fund.monthlyReturns as Record<string, number> | undefined)?.[selectedMonth] !== undefined;

  async function handleDelete() {
    if (!window.confirm(`למחוק את ${selectedMonth} מ-${fund.name}?`)) return;
    setSaving(true);
    if (isNoxClient) {
      const monthKey = selectedMonth.slice(5, 7);
      const res = await fetch(`/api/funds?action=delete-nox-monthly-2026&client=${encodeURIComponent(clientKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ fundId: fund.id, monthKey }),
      });
      setSaving(false);
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); onAfterSave(); }
    } else {
      const res = await fetch(`/api/funds?action=delete-monthly-return&client=${encodeURIComponent(clientKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ fundId: fund.id, month: selectedMonth }),
      });
      setSaving(false);
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000); onAfterSave(); }
    }
  }

  async function handleSave() {
    if (!canSave || previewValue === null) return;
    setSaving(true);
    if (isNoxClient) {
      const monthKey = selectedMonth.slice(5, 7);
      const res = await fetch(`/api/funds?action=set-nox-monthly-2026&client=${encodeURIComponent(clientKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ fundId: fund.id, monthKey, value: previewValue }),
      });
      setSaving(false);
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); onAfterSave(); }
    } else {
      const res = await fetch(`/api/funds?action=set-monthly-return&client=${encodeURIComponent(clientKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ fundId: fund.id, month: selectedMonth, value: previewValue }),
      });
      setSaving(false);
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); onAfterSave(); }
    }
  }

  async function handleCurrencySave(newCurrency: string) {
    if (newCurrency !== "ILS" && newCurrency !== "USD") return;
    setCurrVal(newCurrency);
    setCurrSaving(true);
    const res = await fetch(`/api/funds?action=set-currency&client=${encodeURIComponent(clientKey)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ fundId: fund.id, currency: newCurrency }),
    });
    setCurrSaving(false);
    if (res.ok) {
      setCurrSaved(true);
      setTimeout(() => setCurrSaved(false), 1500);
      onAfterSave();
    } else {
      setCurrVal(fund.currency ?? "");
    }
  }

  const latestUpdated = getLastUpdated(fund);
  const bg = odd ? "var(--bg-surface-alt)" : "var(--bg-surface)";

  const chips = [
    { label: "YTD 2026", value: computed.ytd2026, isPct: true  },
    { label: "2025",     value: computed.y2025,   isPct: true  },
    { label: "2024",     value: computed.y2024,   isPct: true  },
    { label: "CAGR",     value: computed.cagr,    isPct: true  },
    { label: "Sharpe",   value: computed.sharpe,  isPct: false },
    { label: "StdDev",   value: computed.stdDev,  isPct: true  },
  ] as const;

  return (
    <tr style={{ backgroundColor: bg, borderBottom: "1px solid var(--border-table)" }}>
      {/* Fund name */}
      <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13, direction: "rtl", whiteSpace: "nowrap" }}>
        {fund.name}
      </td>

      {/* Currency */}
      <td style={{
        padding: "6px 8px", textAlign: "center", verticalAlign: "middle",
        backgroundColor: !fund.currency ? "rgba(251,191,36,0.08)" : "transparent",
      }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <select
            value={currVal}
            onChange={(e) => handleCurrencySave(e.target.value)}
            disabled={currSaving}
            style={{
              fontSize: 11, padding: "4px 6px", borderRadius: 6,
              border: `1px solid ${
                !currVal ? "rgba(251,191,36,0.5)"
                : currVal === "USD" ? "rgba(37,99,235,0.3)"
                : "rgba(16,185,129,0.3)"
              }`,
              backgroundColor: !currVal ? "rgba(251,191,36,0.12)"
                : currVal === "USD" ? "rgba(37,99,235,0.08)"
                : "rgba(16,185,129,0.08)",
              color: !currVal ? "#92400e"
                : currVal === "USD" ? "#1d4ed8"
                : "#065f46",
              fontWeight: 600, cursor: currSaving ? "default" : "pointer",
              opacity: currSaving ? 0.7 : 1,
            }}
          >
            <option value="">—</option>
            <option value="ILS">ILS</option>
            <option value="USD">USD</option>
          </select>
          {currSaving && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>...</span>}
          {currSaved && !currSaving && <span style={{ fontSize: 12, color: "#059669", fontWeight: 700 }}>✓</span>}
        </div>
      </td>

      {/* Month dropdown */}
      <td style={{ padding: "8px 10px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{
              fontSize: 12, padding: "5px 8px", borderRadius: 7,
              border: "1px solid var(--border)",
              backgroundColor: "var(--bg-input)", color: "var(--text-primary)",
              cursor: "pointer", width: 136,
            }}
            dir="ltr"
          >
            {MONTH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {monthHasData && (
            <button
              onClick={handleDelete}
              disabled={saving}
              title={`מחק ${selectedMonth}`}
              style={{
                width: 18, height: 18, borderRadius: "50%", border: "none",
                backgroundColor: "rgba(239,68,68,0.12)", color: "#ef4444",
                fontSize: 10, fontWeight: 700, cursor: saving ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, opacity: saving ? 0.5 : 1,
              }}
            >✕</button>
          )}
        </div>
      </td>

      {/* MTD input */}
      <td style={{ padding: "8px 10px", textAlign: "center" }}>
        <input
          type="text"
          value={mtdInput}
          onChange={(e) => setMtdInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          placeholder="0.00"
          style={{
            width: 76, textAlign: "center",
            border: `1px solid ${isPreview ? "rgba(16, 185, 129, 0.45)" : "var(--border)"}`,
            borderRadius: 7, padding: "5px 8px", fontSize: 13,
            backgroundColor: "var(--bg-input)",
            color: previewValue !== null ? returnColorInline(previewValue) : "var(--text-primary)",
            fontVariantNumeric: "tabular-nums", outline: "none",
            transition: "border-color 0.15s",
          }}
          dir="ltr"
        />
      </td>

      {/* Live computed metrics chips */}
      <td style={{ padding: "8px 14px" }}>
        <div style={{ display: "flex", gap: 7, justifyContent: "center", alignItems: "center", flexWrap: "nowrap" }}>
          {chips.map((m) => (
            <div key={m.label} style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              padding: "4px 8px", borderRadius: 8,
              backgroundColor: isPreview ? "rgba(16, 185, 129, 0.06)" : "var(--bg-surface-alt)",
              border: `1px solid ${isPreview ? "rgba(16, 185, 129, 0.28)" : "var(--border-table)"}`,
              minWidth: 50, transition: "background-color 0.2s, border-color 0.2s",
            }}>
              <span style={{ fontSize: 9, color: "var(--text-muted)", fontWeight: 500, whiteSpace: "nowrap", marginBottom: 1 }}>{m.label}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: m.isPct ? returnColorInline(m.value) : "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                {m.value != null ? (m.isPct ? pct(m.value) : (m.value as number).toFixed(2)) : "—"}
              </span>
            </div>
          ))}
        </div>
      </td>

      {/* Save */}
      <td style={{ padding: "8px 12px", textAlign: "center", verticalAlign: "middle" }}>
        {saved ? (
          <span style={{ fontSize: 15, color: "#059669", fontWeight: 700 }}>✓</span>
        ) : (
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              fontSize: 11, padding: "5px 13px", borderRadius: 7, border: "none",
              backgroundColor: canSave ? "#1B3A2F" : "var(--bg-surface-alt)",
              color: canSave ? "#fff" : "var(--text-muted)",
              cursor: canSave ? "pointer" : "default",
              fontWeight: 600, display: "block", margin: "0 auto",
              transition: "background-color 0.15s, color 0.15s",
            }}
          >
            {saving ? "..." : "שמור"}
          </button>
        )}
        <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginTop: 4, whiteSpace: "nowrap", textAlign: "center" }}>
          {latestUpdated ? formatReportDate(latestUpdated) : "—"}
        </div>
      </td>
    </tr>
  );
}

/* ================================================================== */
/*  Monthly History Tab (Super Admin only)                             */
/* ================================================================== */
/** Returns the last N months of monthly data for a fund, sorted chronologically. */
function getAnalysisWindow(
  monthlyReturns: Record<string, number> | undefined,
  periodMonths: number,
): { month: string; value: number }[] {
  if (!monthlyReturns) return [];
  const entries = Object.entries(monthlyReturns)
    .filter(([, v]) => typeof v === "number")
    .sort((a, b) => b[0].localeCompare(a[0])); // newest first
  return entries.slice(0, periodMonths)
    .reverse() // chronological
    .map(([month, value]) => ({ month, value }));
}

function MonthlyHistoryTab({ data, onUpdateMonthlyReturn }: {
  data: FundsData;
  onUpdateMonthlyReturn: (catId: string, fundId: string, month: string, value: string) => void;
}) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [analysisPeriod, setAnalysisPeriod] = useState<12 | 24 | 36 | 60>(24);

  // Generate month options (last 24 months)
  const monthOptions: { value: string; label: string }[] = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("he-IL", { year: "numeric", month: "long" });
    monthOptions.push({ value: val, label });
  }

  // Count filled / total
  let totalFunds = 0;
  let filledFunds = 0;
  data.categories.forEach((cat) => {
    cat.funds.forEach((fund) => {
      const isActive = fund.active !== undefined ? fund.active : true;
      if (!isActive) return;
      totalFunds++;
      if (fund.monthlyReturns?.[selectedMonth] !== undefined) filledFunds++;
    });
  });

  return (
    <>
      <div style={{ marginBottom: 20, backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
          חודש:
        </label>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          style={{
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 13,
            backgroundColor: "var(--bg-input)",
            color: "var(--text-primary)",
            cursor: "pointer",
            minWidth: 180,
          }}
        >
          {monthOptions.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            color: filledFunds === totalFunds ? "#059669" : "#f59e0b",
            backgroundColor: filledFunds === totalFunds ? "rgba(5,150,105,0.1)" : "rgba(245,158,11,0.1)",
            padding: "4px 12px",
            borderRadius: 20,
          }}>
            {filledFunds}/{totalFunds} קרנות דווחו
          </span>
          {filledFunds === totalFunds && totalFunds > 0 && (
            <span style={{ fontSize: 11, color: "#059669" }}>✓ הכל מעודכן</span>
          )}
        </div>
      </div>

      {data.categories.map((cat) => {
        const visibleFunds = cat.funds.filter((f) => {
          const active = f.active !== undefined ? f.active : true;
          return active;
        });
        if (visibleFunds.length === 0) return null;

        const catFilled = visibleFunds.filter((f) => f.monthlyReturns?.[selectedMonth] !== undefined).length;

        return (
          <div key={cat.id} style={{ marginBottom: 20 }}>
            <div style={{ backgroundColor: "var(--bg-section)", color: "#fff", padding: "6px 16px", borderRadius: "8px 8px 0 0", fontWeight: 600, fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{cat.name} <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.7 }}>({visibleFunds.length})</span></span>
              <span style={{ fontSize: 10, opacity: 0.8 }}>{catFilled}/{visibleFunds.length} דווחו</span>
            </div>
            <div style={{ backgroundColor: "var(--bg-surface)", borderRadius: "0 0 8px 8px", overflow: "hidden", border: "1px solid var(--border)", borderTop: "none" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: "var(--bg-surface-alt)" }}>
                    <th style={thStyle(200)}>שם קרן</th>
                    <th style={thStyle(140)}>תשואה חודשית (%)</th>
                    <th style={thStyle(80)}>סטטוס</th>
                    <th style={thStyle(undefined)}>מנהל</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleFunds.map((fund, idx) => {
                    const val = fund.monthlyReturns?.[selectedMonth];
                    const displayVal = val !== undefined ? (val * 100).toFixed(2) : "";
                    const filled = val !== undefined;
                    const bg = idx % 2 === 1 ? "var(--bg-surface-alt)" : "var(--bg-surface)";

                    return (
                      <tr key={fund.id} style={{ backgroundColor: bg, borderBottom: "1px solid var(--border-table)" }}>
                        <td style={{ padding: "6px 12px", fontWeight: 600, textAlign: "right", fontSize: 12.5 }}>
                          {fund.name}
                        </td>
                        <td style={{ padding: "5px 10px", textAlign: "center" }}>
                          <input
                            type="text"
                            defaultValue={displayVal}
                            key={`${fund.id}-${selectedMonth}`}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v && isNaN(parseFloat(v))) { e.target.value = displayVal; return; }
                              onUpdateMonthlyReturn(cat.id, fund.id, selectedMonth, v);
                            }}
                            style={{
                              width: 80,
                              textAlign: "center",
                              border: "1px solid var(--border)",
                              borderRadius: 6,
                              padding: "4px 8px",
                              fontSize: 13,
                              backgroundColor: "var(--bg-input)",
                              color: filled ? returnColorInline(val ?? null) : "var(--text-primary)",
                            }}
                            dir="ltr"
                            placeholder="—"
                          />
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "center", fontSize: 12 }}>
                          {filled
                            ? <span style={{ color: "#059669" }}>✓ דווח</span>
                            : <span style={{ color: "#f59e0b" }}>⏳ חסר</span>
                          }
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "center", color: "var(--text-muted)", fontSize: 11 }}>{fund.manager}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* ── Value Layer: Period Selector + Insight Placeholder ── */}
      <div style={{
        marginTop: 24,
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "14px 20px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
            חלון ניתוח:
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            {([12, 24, 36, 60] as const).map((p) => (
              <button
                key={p}
                onClick={() => setAnalysisPeriod(p)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 5,
                  border: "1px solid var(--border)",
                  backgroundColor: analysisPeriod === p ? "var(--bg-section)" : "var(--bg-surface-alt)",
                  color: analysisPeriod === p ? "#fff" : "var(--text-secondary)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}>
                {p} חודשים
              </button>
            ))}
          </div>
          {(() => {
            const allFunds = data.categories.flatMap((c) => c.funds).filter((f) => f.active !== false);
            const eligible = allFunds.filter((f) => getAnalysisWindow(f.monthlyReturns, analysisPeriod).length >= analysisPeriod);
            return (
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {eligible.length}/{allFunds.length} קרנות עם נתונים מלאים
              </span>
            );
          })()}
        </div>

        {/* Insight placeholder — future Value Layer content */}
        <div style={{
          backgroundColor: "var(--bg-surface-alt)",
          border: "1px dashed var(--border)",
          borderRadius: 8,
          padding: "20px 16px",
          textAlign: "center",
        }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
            📊 תובנות ביצועים — בקרוב
          </p>
        </div>
      </div>
    </>
  );
}


/* ================================================================== */
/*  Fund Management Tab                                                */
/* ================================================================== */
function FundManagementTab({ data, onToggleActive, onDelete, onShowAdd, onEdit, onMoveFund, addFundCategory, setAddFundCategory }: {
  data: FundsData;
  onToggleActive: (catId: string, fundId: string) => void;
  onDelete: (catId: string, fundId: string, fundName: string) => void;
  onShowAdd: () => void;
  onEdit: (catId: string, fund: Fund) => void;
  onMoveFund: (catId: string, fundId: string, direction: "up" | "down") => void;
  addFundCategory: string;
  setAddFundCategory: (v: string) => void;
}) {
  const [search, setSearch] = useState("");
  const searchLower = search.trim().toLowerCase();

  // Count total matching funds
  const totalFunds = data.categories.reduce((sum, cat) => sum + cat.funds.length, 0);
  const matchingFunds = searchLower
    ? data.categories.reduce((sum, cat) => sum + cat.funds.filter((f) =>
        f.name.toLowerCase().includes(searchLower) ||
        (f.classification || "").toLowerCase().includes(searchLower) ||
        (f.manager || "").toLowerCase().includes(searchLower)
      ).length, 0)
    : totalFunds;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>ניהול קרנות</h3>
        <button
          onClick={onShowAdd}
          style={{
            backgroundColor: "var(--accent)",
            color: "var(--text-primary)",
            fontWeight: 700,
            padding: "7px 20px",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          + הוספת קרן
        </button>
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: 16, position: "relative" }}>
        <input
          type="text"
          placeholder="חפש קרן לפי שם, סיווג או מנהל..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "9px 14px 9px 36px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            backgroundColor: "var(--bg-input)",
            color: "var(--text-primary)",
            fontSize: 13,
            outline: "none",
            direction: "rtl",
          }}
        />
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--text-muted)", pointerEvents: "none" }}>
          🔍
        </span>
        {search && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {matchingFunds} מתוך {totalFunds} קרנות
            </span>
            <button onClick={() => setSearch("")}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text-secondary)", textDecoration: "underline" }}>
              נקה חיפוש
            </button>
          </div>
        )}
      </div>

      {data.categories.map((cat) => {
        const filteredFunds = searchLower
          ? cat.funds.filter((f) =>
              f.name.toLowerCase().includes(searchLower) ||
              (f.classification || "").toLowerCase().includes(searchLower) ||
              (f.manager || "").toLowerCase().includes(searchLower)
            )
          : cat.funds;

        if (searchLower && filteredFunds.length === 0) return null;

        return (
        <div key={cat.id} style={{ marginBottom: 20 }}>
          <div style={{ backgroundColor: "var(--bg-section)", color: "#fff", padding: "6px 16px", borderRadius: "8px 8px 0 0", fontWeight: 600, fontSize: 12 }}>
            {cat.name} <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.7 }}>({filteredFunds.length}{searchLower ? `/${cat.funds.length}` : ""})</span>
          </div>
          <div style={{ backgroundColor: "var(--bg-surface)", borderRadius: "0 0 8px 8px", overflow: "hidden", border: "1px solid var(--border)", borderTop: "none" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ backgroundColor: "var(--bg-surface-alt)" }}>
                  <th style={thStyle(undefined)}>שם קרן</th>
                  <th style={thStyle(130)}>סיווג</th>
                  <th style={thStyle(100)}>מנהל</th>
                  <th style={thStyle(80)}>פעיל</th>
                  <th style={thStyle(50)}>סדר</th>
                  <th style={thStyle(120)}>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filteredFunds.map((fund, idx) => {
                  const isActive = fund.active !== undefined ? fund.active : true;
                  return (
                    <tr key={fund.id} style={{ backgroundColor: idx % 2 === 0 ? "var(--bg-surface)" : "var(--bg-surface-alt)", borderBottom: "1px solid var(--border-table)", opacity: isActive ? 1 : 0.5 }}>
                      <td style={{ padding: "6px 12px", fontWeight: 600, textAlign: "right" }}>
                        {fund.name}
                        {(() => {
                          const lu = getLastUpdated(fund);
                          if (!lu || !isActive) return null;
                          const lastDate = new Date(lu + "-01");
                          const now = new Date();
                          const monthsDiff = (now.getFullYear() - lastDate.getFullYear()) * 12 + (now.getMonth() - lastDate.getMonth());
                          if (monthsDiff >= 3) {
                            return <span style={{ fontSize: 9, color: "#f59e0b", marginRight: 6, fontWeight: 400 }} title={`עדכון אחרון: ${lu}`}>⚠️ לא עודכנה {monthsDiff} חודשים</span>;
                          }
                          return null;
                        })()}
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 11, color: "var(--text-secondary)" }}>{fund.classification}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 11, color: "var(--text-muted)" }}>{fund.manager}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center" }}>
                        <button onClick={() => onToggleActive(cat.id, fund.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}
                          title={isActive ? "לחץ להשבתה" : "לחץ להפעלה"}>
                          {isActive ? "✅" : "❌"}
                        </button>
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                        <button onClick={() => onMoveFund(cat.id, fund.id, "up")}
                          disabled={idx === 0}
                          title="הזז למעלה"
                          style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer", fontSize: 13, opacity: idx === 0 ? 0.2 : 0.7, padding: "0 2px" }}>
                          ▲
                        </button>
                        <button onClick={() => onMoveFund(cat.id, fund.id, "down")}
                          disabled={idx === filteredFunds.length - 1}
                          title="הזז למטה"
                          style={{ background: "none", border: "none", cursor: idx === filteredFunds.length - 1 ? "default" : "pointer", fontSize: 13, opacity: idx === filteredFunds.length - 1 ? 0.2 : 0.7, padding: "0 2px" }}>
                          ▼
                        </button>
                      </td>
                      <td style={{ padding: "6px 8px", textAlign: "center" }}>
                        <button onClick={() => onEdit(cat.id, fund)}
                          style={{ background: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontSize: 11, color: "var(--text-secondary)", marginLeft: 6 }}>
                          ערוך
                        </button>
                        <button onClick={() => onDelete(cat.id, fund.id, fund.name)}
                          style={{ background: "none", border: "1px solid var(--negative)", borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontSize: 11, color: "var(--negative)" }}>
                          מחק
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        );
      })}
    </>
  );
}

/* ================================================================== */
/*  Settings Tab                                                       */
/* ================================================================== */
function SettingsTab({ password, clientKey, onStatus, onExport, onImport }: {
  password: string;
  clientKey: string;
  onStatus: (msg: string) => void;
  onExport: () => void;
  onImport: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleChangePassword = async () => {
    if (newPassword.length < 4) {
      onStatus("❌ הסיסמה חייבת להכיל לפחות 4 תווים");
      return;
    }
    if (newPassword !== confirmPassword) {
      onStatus("❌ הסיסמאות אינן תואמות");
      return;
    }
    const res = await fetch(`/api/funds?action=change-password&client=${encodeURIComponent(clientKey)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": password,
      },
      body: JSON.stringify({ newPassword }),
    });
    if (res.ok) {
      onStatus("✓ הסיסמה עודכנה בהצלחה");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      onStatus("❌ שגיאה בעדכון סיסמה");
    }
  };

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Password Change */}
      <SectionCard title="שינוי סיסמת כניסה">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="password"
            placeholder="סיסמה חדשה"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={settingsInputStyle}
          />
          <input
            type="password"
            placeholder="אימות סיסמה חדשה"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={settingsInputStyle}
          />
          <button onClick={handleChangePassword}
            style={{ alignSelf: "flex-start", backgroundColor: "var(--bg-section)", color: "#fff", border: "none", borderRadius: 6, padding: "7px 20px", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>
            עדכן סיסמה
          </button>
        </div>
      </SectionCard>

      {/* Backup / Restore */}
      <SectionCard title="גיבוי ושחזור">
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 12px" }}>
          ייצוא ישמור עותק של כל הנתונים. ייבוא יחליף את כל הנתונים (גיבוי אוטומטי נשמר לפני).
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onExport}
            style={{ backgroundColor: "var(--bg-section)", color: "#fff", border: "none", borderRadius: 6, padding: "7px 20px", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>
            📥 ייצוא JSON
          </button>
          <button onClick={onImport}
            style={{ backgroundColor: "var(--bg-surface-alt)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 20px", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>
            📤 ייבוא JSON
          </button>
        </div>
      </SectionCard>

      {/* Version info */}
      <SectionCard title="מידע">
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 2 }}>
          <div>גרסה: ניתנת לשינוי בלשונית מיתוג</div>
          <div>מערכת: ניתנת לשינוי בלשונית מיתוג</div>
        </div>
      </SectionCard>
    </div>
  );
}

/* ================================================================== */
/*  Branding Tab (Super Admin only)                                    */
/* ================================================================== */
function LogoUploadField({ label, field, currentPath, password, clientKey, onUploaded }: {
  label: string; field: "logoLight" | "logoDark"; currentPath: string;
  password: string; clientKey: string; onUploaded: (field: string, path: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("field", field);
    try {
      const res = await fetch(`/api/brand/upload?client=${encodeURIComponent(clientKey)}`, {
        method: "POST",
        headers: { "x-admin-password": password },
        body: fd,
      });
      if (res.ok) {
        const { path } = await res.json();
        onUploaded(field, path);
      }
    } catch { /* ignore */ }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div>
      <label style={brandLabelStyle}>{label}</label>
      {currentPath && (
        <div style={{ marginBottom: 6, padding: 6, border: "1px solid var(--border)", borderRadius: 6, backgroundColor: "var(--bg-input)", display: "inline-block" }}>
          <img src={currentPath} alt={field} style={{ maxHeight: 28, maxWidth: 120, objectFit: "contain", display: "block" }} />
        </div>
      )}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input ref={fileRef} type="file" accept=".png,.svg,image/png,image/svg+xml" onChange={handleUpload}
          style={{ fontSize: 11, color: "var(--text-secondary)", flex: 1 }} />
        {uploading && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>מעלה...</span>}
      </div>
    </div>
  );
}

function BrandingTab({ password, clientKey, onStatus }: { password: string; clientKey: string; onStatus: (msg: string) => void }) {
  const [form, setForm] = useState<BrandConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/brand?client=${encodeURIComponent(clientKey)}`).then((r) => r.json()).then(setForm);
  }, []);

  if (!form) return <div style={{ color: "var(--text-muted)", padding: 20 }}>טוען...</div>;

  const update = (field: keyof BrandConfig, value: string | boolean | AppFeatures) => {
    setForm((prev) => prev ? { ...prev, [field]: value } : prev);
  };

  const handleSave = async () => {
    if (!form || saving) return;
    setSaving(true);
    const res = await fetch(`/api/brand?client=${encodeURIComponent(clientKey)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      invalidateBrandCache(clientKey);
      onStatus("✓ הגדרות המיתוג נשמרו — רענן את הדף לראות שינויים");
    } else {
      onStatus("❌ שגיאה בשמירת מיתוג");
    }
  };

  const inp = brandInputStyle;

  return (
    <div style={{ maxWidth: 600 }}>
      <SectionCard title="זהות מותגית">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <BrandField label="שם מותג" value={form.name} onChange={(v) => update("name", v)} />
          <BrandField label="שם מלא" value={form.fullName} onChange={(v) => update("fullName", v)} />
          <LogoUploadField label="לוגו לרקע בהיר" field="logoLight" currentPath={form.logoLight} password={password} clientKey={clientKey}
            onUploaded={(f, p) => { update(f as keyof BrandConfig, p); }} />
          <LogoUploadField label="לוגו לרקע כהה" field="logoDark" currentPath={form.logoDark} password={password} clientKey={clientKey}
            onUploaded={(f, p) => { update(f as keyof BrandConfig, p); }} />
          <BrandField label="גרסה" value={form.version} onChange={(v) => update("version", v)} />
          <div>
            <label style={brandLabelStyle}>מראה ברירת מחדל</label>
            <select value={form.defaultAppearance} onChange={(e) => update("defaultAppearance", e.target.value)}
              style={{ ...inp, cursor: "pointer" }}>
              <option value="light">בהיר (Light)</option>
              <option value="dark">כהה (Dark)</option>
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="צבעים">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label style={brandLabelStyle}>צבע ראשי</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="color" value={form.primaryColor} onChange={(e) => update("primaryColor", e.target.value)}
                style={{ width: 32, height: 32, border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", padding: 0 }} />
              <input value={form.primaryColor} onChange={(e) => update("primaryColor", e.target.value)} style={{ ...inp, flex: 1 }} dir="ltr" />
            </div>
          </div>
          <div>
            <label style={brandLabelStyle}>צבע משני</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="color" value={form.secondaryColor} onChange={(e) => update("secondaryColor", e.target.value)}
                style={{ width: 32, height: 32, border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", padding: 0 }} />
              <input value={form.secondaryColor} onChange={(e) => update("secondaryColor", e.target.value)} style={{ ...inp, flex: 1 }} dir="ltr" />
            </div>
          </div>
          <div>
            <label style={brandLabelStyle}>צבע הדגשה</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="color" value={form.accentColor} onChange={(e) => update("accentColor", e.target.value)}
                style={{ width: 32, height: 32, border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", padding: 0 }} />
              <input value={form.accentColor} onChange={(e) => update("accentColor", e.target.value)} style={{ ...inp, flex: 1 }} dir="ltr" />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="כותרות ותוכן">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <BrandField label="כותרת ראשית" value={form.mainTitle} onChange={(v) => update("mainTitle", v)} />
          <div>
            <label style={brandLabelStyle}>כותרת משנה</label>
            <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                <input type="radio" checked={form.subtitleMode === "auto"} onChange={() => update("subtitleMode", "auto")} />
                אוטומטי (תאריך עדכון)
              </label>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                <input type="radio" checked={form.subtitleMode === "custom"} onChange={() => update("subtitleMode", "custom")} />
                מותאם אישית
              </label>
            </div>
            {form.subtitleMode === "custom" && (
              <input value={form.customSubtitle} onChange={(e) => update("customSubtitle", e.target.value)}
                placeholder="כותרת משנה מותאמת..." style={inp} />
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="פוטר הדפסה">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" id="showCredit" checked={form.showCredit}
              onChange={(e) => update("showCredit", e.target.checked)} style={{ cursor: "pointer" }} />
            <label htmlFor="showCredit" style={{ fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}>
              הצג קרדיט מפתח
            </label>
          </div>
          {form.showCredit && (
            <BrandField label="טקסט קרדיט" value={form.creditText} onChange={(v) => update("creditText", v)} />
          )}
          <div>
            <label style={brandLabelStyle}>הצהרה משפטית (דיסקליימר)</label>
            <textarea value={form.footerDisclaimer} onChange={(e) => update("footerDisclaimer", e.target.value)}
              rows={5} style={{ ...inp, resize: "vertical", fontSize: 11, lineHeight: 1.5 }} placeholder="הצהרה משפטית שתופיע בתחתית הדוח ובהדפסה..." />
          </div>
        </div>
      </SectionCard>

      {/* ---- Feature Panel ---- */}
      <SectionCard title="תכונות מערכת">
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 12px", lineHeight: 1.6 }}>
          הפעלה או כיבוי של תכונות ספציפיות במערכת. שינויים ייכנסו לתוקף לאחר שמירה ורענון הדף.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <FeatureToggle
            label="השוואת קרנות"
            description="אפשר השוואה מפורטת בין קרנות בדף הדוח"
            checked={form.features?.comparison ?? true}
            onChange={(v) => {
              const feat = { ...(form.features || { comparison: true, chartPage: true }), comparison: v };
              setForm((prev) => prev ? { ...prev, features: feat } : prev);
            }}
          />
          {(form.features?.comparison ?? true) && (
            <div style={{
              padding: "10px 14px", backgroundColor: "var(--bg-surface-alt)", borderRadius: 8,
              border: "1px solid var(--border)", marginRight: 16,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}>מצב השוואה</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>מצומצם = טבלה בלבד. מתקדם = כולל גרפים</div>
                </div>
                <select
                  value={form.features?.comparisonMode ?? "basic"}
                  onChange={(e) => {
                    const mode = e.target.value as "basic" | "advanced";
                    const feat = { ...(form.features || { comparison: true, chartPage: true }), comparisonMode: mode };
                    setForm((prev) => prev ? { ...prev, features: feat } : prev);
                  }}
                  style={{
                    border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px",
                    fontSize: 12, backgroundColor: "var(--bg-input)", color: "var(--text-primary)",
                    cursor: "pointer", minWidth: 140, marginRight: 8,
                  }}
                >
                  <option value="basic">מצומצם (Basic)</option>
                  <option value="advanced">מתקדם (Advanced)</option>
                </select>
              </div>
            </div>
          )}
          <FeatureToggle
            label="דף גרפים"
            description="הצג קישור לדף הגרפים (סיכון מול תשואה) בניווט"
            checked={form.features?.chartPage ?? true}
            onChange={(v) => {
              const feat = { ...(form.features || { comparison: true, chartPage: true }), chartPage: v };
              setForm((prev) => prev ? { ...prev, features: feat } : prev);
            }}
          />
          <FeatureToggle
            label="🤖 AI קליטת נתונים"
            description="אפשר קליטת נתונים חכמה מטקסט באמצעות AI (דורש ANTHROPIC_API_KEY)"
            checked={form.features?.aiParser ?? false}
            onChange={(v) => {
              const feat = { ...(form.features || { comparison: true, chartPage: true }), aiParser: v };
              setForm((prev) => prev ? { ...prev, features: feat } : prev);
            }}
          />
          <FeatureToggle
            label="✨ AI One Pager לקרן"
            description="הצג כפתור AI ליד כל קרן בטבלה הראשית — לחיצה פותחת סיכום מלא מבוסס AI (דורש ANTHROPIC_API_KEY)"
            checked={form.features?.aiReport ?? false}
            onChange={(v) => {
              const feat = { ...(form.features || { comparison: true, chartPage: true }), aiReport: v };
              setForm((prev) => prev ? { ...prev, features: feat } : prev);
            }}
          />
          <FeatureToggle
            label="📱 העלאה מנייד"
            description="אפשר העלאת קבצים מנייד (PDF, תמונות)"
            checked={form.features?.mobileUpload ?? false}
            onChange={(v) => {
              const feat = { ...(form.features || { comparison: true, chartPage: true }), mobileUpload: v };
              setForm((prev) => prev ? { ...prev, features: feat } : prev);
            }}
          />
          <FeatureToggle
            label="🖥️ העלאה מדסקטופ"
            description="אפשר העלאת קבצים מהמחשב בתוך עמוד הניהול"
            checked={form.features?.desktopUpload ?? false}
            onChange={(v) => {
              const feat = { ...(form.features || { comparison: true, chartPage: true }), desktopUpload: v };
              setForm((prev) => prev ? { ...prev, features: feat } : prev);
            }}
          />
          <FeatureToggle
            label="📊 העלאת אקסל"
            description="אפשר העלאת קבצי Excel (בקרוב)"
            checked={form.features?.excelUpload ?? false}
            onChange={(v) => {
              const feat = { ...(form.features || { comparison: true, chartPage: true }), excelUpload: v };
              setForm((prev) => prev ? { ...prev, features: feat } : prev);
            }}
          />
          <FeatureToggle
            label="✏️ הזנה ידנית"
            description="אפשר הזנת נתונים ידנית (בקרוב)"
            checked={form.features?.manualUpload ?? false}
            onChange={(v) => {
              const feat = { ...(form.features || { comparison: true, chartPage: true }), manualUpload: v };
              setForm((prev) => prev ? { ...prev, features: feat } : prev);
            }}
          />
          <FeatureToggle
            label="📧 קליטה ממייל"
            description="אפשר קליטת נתונים אוטומטית ממייל (בקרוב)"
            checked={form.features?.emailUpload ?? false}
            onChange={(v) => {
              const feat = { ...(form.features || { comparison: true, chartPage: true }), emailUpload: v };
              setForm((prev) => prev ? { ...prev, features: feat } : prev);
            }}
          />
          <FeatureToggle
            label="🧮 השלמת נתונים"
            description="הצג עמוד השלמת נתונים מחושבים (ממוצע שנתי, סטיית תקן, שארפ)"
            checked={form.features?.dataCompletion ?? false}
            onChange={(v) => {
              const feat = { ...(form.features || { comparison: true, chartPage: true }), dataCompletion: v };
              setForm((prev) => prev ? { ...prev, features: feat } : prev);
            }}
          />
          <FeatureToggle
            label="📋 סטטוס קרנות"
            description="הצג מסך סטטוס — אילו קרנות עודכנו לחודש הנוכחי ואילו ממתינות"
            checked={form.features?.fundStatus ?? false}
            onChange={(v) => {
              const feat = { ...(form.features || { comparison: true, chartPage: true }), fundStatus: v };
              setForm((prev) => prev ? { ...prev, features: feat } : prev);
            }}
          />
          <FeatureToggle
            label="📈 ניתוח עקביות"
            description="הצג מסך עקביות — כמה חודשים כל קרן עקפה את הבנצ'מרק שלה"
            checked={form.features?.consistencyAnalysis ?? false}
            onChange={(v) => {
              const feat = { ...(form.features || { comparison: true, chartPage: true }), consistencyAnalysis: v };
              setForm((prev) => prev ? { ...prev, features: feat } : prev);
            }}
          />
        </div>
      </SectionCard>

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button onClick={handleSave} disabled={saving}
          style={{ backgroundColor: "var(--accent)", color: "#fff", fontWeight: 700, padding: "8px 28px", borderRadius: 6, border: "none", cursor: saving ? "default" : "pointer", fontSize: 13, opacity: saving ? 0.5 : 1 }}>
          {saving ? "שומר..." : "שמור הגדרות מיתוג"}
        </button>
      </div>

      <div style={{ marginTop: 16, padding: "10px 14px", backgroundColor: "var(--bg-surface-alt)", borderRadius: 8, border: "1px solid var(--border)" }}>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
          שינויים במיתוג ישפיעו על כל הדפים: דוח ראשי, גרפים, ניהול והדפסה.
          לאחר שמירה, רענן את הדף (F5) כדי לראות את השינויים.
        </p>
      </div>
    </div>
  );
}

function FeatureToggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px", backgroundColor: "var(--bg-surface-alt)", borderRadius: 8,
      border: "1px solid var(--border)",
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{description}</div>
      </div>
      <label style={{ position: "relative", display: "inline-block", width: 44, height: 24, cursor: "pointer", flexShrink: 0, marginRight: 8 }}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
          style={{ opacity: 0, width: 0, height: 0, position: "absolute" }} />
        <span style={{
          position: "absolute", inset: 0, borderRadius: 12,
          backgroundColor: checked ? "#059669" : "var(--border)",
          transition: "background-color 0.2s",
        }} />
        <span style={{
          position: "absolute", top: 2, left: checked ? 22 : 2,
          width: 20, height: 20, borderRadius: 10,
          backgroundColor: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: "left 0.2s",
        }} />
      </label>
    </div>
  );
}

function BrandField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={brandLabelStyle}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={brandInputStyle} />
    </div>
  );
}

const brandLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: "var(--text-muted)",
  marginBottom: 3,
  display: "block",
};

const brandInputStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 13,
  backgroundColor: "var(--bg-input)",
  color: "var(--text-primary)",
  width: "100%",
  boxSizing: "border-box",
};

const settingsInputStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 13,
  backgroundColor: "var(--bg-input)",
  color: "var(--text-primary)",
  width: "100%",
  boxSizing: "border-box",
};

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px", marginBottom: 16 }}>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 12px" }}>{title}</h4>
      {children}
    </div>
  );
}

/* ================================================================== */
/*  Fund Modal (Add / Edit)                                            */
/* ================================================================== */
function FundModal({ title, categories, selectedCategory, existingFund, onCategoryChange, onSave, onClose }: {
  title: string;
  categories: Category[];
  selectedCategory: string;
  existingFund?: Fund;
  onCategoryChange?: (v: string) => void;
  onSave: (fund: Fund, categoryId: string) => void;
  onClose: () => void;
}) {
  const isEdit = !!existingFund;
  const [catId, setCatId] = useState(selectedCategory);

  // 3-layer classification state
  const existingCat = categories.find((c) => c.id === selectedCategory);
  const [selectedParentSection, setSelectedParentSection] = useState(existingCat?.parentSection || "");
  const [newParentSection, setNewParentSection] = useState("");
  const [isNewParentSection, setIsNewParentSection] = useState(false);
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isNewClassification, setIsNewClassification] = useState(false);

  // Derived values for layer filtering
  const parentSections = Array.from(new Set(categories.map((c) => c.parentSection).filter(Boolean))).sort();
  const activeParentSection = isNewParentSection ? newParentSection : selectedParentSection;
  const filteredCategories = categories.filter((c) => c.parentSection === activeParentSection);

  const [form, setForm] = useState<Record<string, string>>(() => {
    if (existingFund) {
      return {
        name: existingFund.name,
        classification: existingFund.classification,
        manager: existingFund.manager,
        startDate: existingFund.startDate || "",
        lastUpdated: existingFund.lastUpdated || "",
        monthlyReturn: existingFund.monthlyReturn !== null ? (existingFund.monthlyReturn * 100).toFixed(2) : "",
        ytd2026: existingFund.returns.ytd2026 !== null ? (existingFund.returns.ytd2026 * 100).toFixed(2) : "",
        y2025: existingFund.returns.y2025 !== null ? (existingFund.returns.y2025 * 100).toFixed(2) : "",
        y2024: existingFund.returns.y2024 !== null ? (existingFund.returns.y2024 * 100).toFixed(2) : "",
        y2023: existingFund.returns.y2023 !== null ? (existingFund.returns.y2023 * 100).toFixed(2) : "",
        y2022: existingFund.returns.y2022 !== null ? (existingFund.returns.y2022 * 100).toFixed(2) : "",
        y2021: existingFund.returns.y2021 !== null ? (existingFund.returns.y2021 * 100).toFixed(2) : "",
        y2020: existingFund.returns.y2020 !== null ? (existingFund.returns.y2020 * 100).toFixed(2) : "",
        y2019: existingFund.returns.y2019 !== null ? (existingFund.returns.y2019 * 100).toFixed(2) : "",
        avgAnnualReturn: existingFund.avgAnnualReturn !== null ? (existingFund.avgAnnualReturn * 100).toFixed(2) : "",
        sharpe: existingFund.sharpe !== null ? existingFund.sharpe.toFixed(2) : "",
        stdDev: existingFund.stdDev !== null ? (existingFund.stdDev * 100).toFixed(2) : "",
        aumMillions: existingFund.aumMillions !== null ? String(existingFund.aumMillions) : "",
      };
    }
    return {
      name: "", classification: "", manager: "", startDate: "", lastUpdated: "",
      monthlyReturn: "", ytd2026: "", y2025: "", y2024: "", y2023: "", y2022: "",
      y2021: "", y2020: "", y2019: "", avgAnnualReturn: "", sharpe: "", stdDev: "", aumMillions: "",
    };
  });

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const parseNum = (v: string): number | null => {
    if (!v || v === "—") return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };
  const parsePct = (v: string): number | null => {
    const n = parseNum(v);
    return n !== null ? n / 100 : null;
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;

    const fund: Fund = {
      ...(existingFund ?? {}),
      id: existingFund?.id || `fund-${Date.now()}`,
      name: form.name.trim(),
      classification: form.classification.trim(),
      manager: form.manager.trim(),
      startDate: form.startDate || null,
      lastUpdated: form.lastUpdated || null,
      monthlyReturn: parsePct(form.monthlyReturn),
      returns: {
        ytd2026: parsePct(form.ytd2026),
        y2025: parsePct(form.y2025),
        y2024: parsePct(form.y2024),
        y2023: parsePct(form.y2023),
        y2022: parsePct(form.y2022),
        y2021: parsePct(form.y2021),
        y2020: parsePct(form.y2020),
        y2019: parsePct(form.y2019),
      },
      avgAnnualReturn: parsePct(form.avgAnnualReturn),
      sharpe: parseNum(form.sharpe),
      stdDev: parsePct(form.stdDev),
      aumMillions: parseNum(form.aumMillions),
      active: existingFund?.active !== undefined ? existingFund.active : true,
    };

    // If creating a new category, pass special ID that addFund will handle
    if (!isEdit && isNewCategory && newCategoryName.trim()) {
      const newCatId = `cat-${Date.now()}`;
      const ps = isNewParentSection ? newParentSection.trim() : selectedParentSection;
      onSave(fund, `__new__:${newCatId}:${newCategoryName.trim()}:${ps}`);
    } else {
      onSave(fund, catId);
    }
  };

  const fieldStyle: React.CSSProperties = {
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "7px 10px",
    fontSize: 13,
    backgroundColor: "var(--bg-input)",
    color: "var(--text-primary)",
    width: "100%",
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--text-muted)",
    marginBottom: 3,
    display: "block",
  };

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "var(--overlay)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ backgroundColor: "var(--bg-modal)", borderRadius: 14, padding: "24px 28px", width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)", padding: "4px 8px" }}>✕</button>
        </div>

        {/* 3-layer classification selector for new funds */}
        {!isEdit && (
          <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Layer 1: parentSection */}
            <div>
              <label style={labelStyle}>שכבה ראשונה (קבוצה ראשית)</label>
              {!isNewParentSection ? (
                <select value={selectedParentSection} onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setIsNewParentSection(true);
                    setSelectedParentSection("");
                    setIsNewCategory(true);
                    setNewCategoryName("");
                    setCatId("");
                  } else {
                    setSelectedParentSection(e.target.value);
                    setIsNewCategory(false);
                    // Auto-select first category in this section
                    const firstCat = categories.find((c) => c.parentSection === e.target.value);
                    if (firstCat) { setCatId(firstCat.id); onCategoryChange?.(firstCat.id); }
                  }
                }} style={{ ...fieldStyle, cursor: "pointer" }}>
                  <option value="">— בחר קבוצה —</option>
                  {parentSections.map((ps) => <option key={ps} value={ps}>{ps}</option>)}
                  <option value="__new__">➕ קבוצה חדשה...</option>
                </select>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <input value={newParentSection} onChange={(e) => setNewParentSection(e.target.value)}
                    placeholder="שם קבוצה חדשה" style={{ ...fieldStyle, flex: 1 }} autoFocus />
                  <button type="button" onClick={() => { setIsNewParentSection(false); setSelectedParentSection(parentSections[0] || ""); }}
                    style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: "var(--text-muted)", fontSize: 11 }}>✕</button>
                </div>
              )}
            </div>

            {/* Layer 2: category */}
            {activeParentSection && (
              <div>
                <label style={labelStyle}>שכבה שנייה (קטגוריה)</label>
                {!isNewCategory ? (
                  <select value={catId} onChange={(e) => {
                    if (e.target.value === "__new__") {
                      setIsNewCategory(true);
                      setNewCategoryName("");
                      setCatId("");
                    } else {
                      setCatId(e.target.value);
                      onCategoryChange?.(e.target.value);
                    }
                  }} style={{ ...fieldStyle, cursor: "pointer" }}>
                    <option value="">— בחר קטגוריה —</option>
                    {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    <option value="__new__">➕ קטגוריה חדשה...</option>
                  </select>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="שם קטגוריה חדשה" style={{ ...fieldStyle, flex: 1 }} autoFocus />
                    {!isNewParentSection && (
                      <button type="button" onClick={() => { setIsNewCategory(false); const fc = filteredCategories[0]; if (fc) setCatId(fc.id); }}
                        style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: "var(--text-muted)", fontSize: 11 }}>✕</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Basic info */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>שם קרן *</label>
            <input value={form.name} onChange={(e) => update("name", e.target.value)} style={fieldStyle} />
          </div>
          {/* Layer 3: classification — filtered by selected category/parentSection */}
          <div>
            <label style={labelStyle}>סיווג (שכבה שלישית)</label>
            {(() => {
              // Filter classifications by context: selected category → parentSection → all
              const contextClassifications = (() => {
                if (!isNewCategory && catId) {
                  // Existing category selected → show its funds' classifications
                  const cat = categories.find((c) => c.id === catId);
                  if (cat && cat.funds.length > 0) {
                    return cat.funds.map((f) => f.classification).filter(Boolean);
                  }
                }
                if (activeParentSection) {
                  // New category or empty category → show parentSection's classifications
                  return categories
                    .filter((c) => c.parentSection === activeParentSection)
                    .flatMap((c) => c.funds.map((f) => f.classification))
                    .filter(Boolean);
                }
                // Fallback: all classifications
                return categories.flatMap((c) => c.funds.map((f) => f.classification)).filter(Boolean);
              })();
              const uniqueClassifications = Array.from(new Set(contextClassifications)).sort();
              return !isNewClassification ? (
              <select value={form.classification} onChange={(e) => {
                if (e.target.value === "__new__") {
                  setIsNewClassification(true);
                  update("classification", "");
                } else {
                  update("classification", e.target.value);
                }
              }} style={{ ...fieldStyle, cursor: "pointer" }}>
                <option value="">— בחר סיווג —</option>
                {uniqueClassifications.map((cls) => (
                  <option key={cls} value={cls}>{cls}</option>
                ))}
                <option value="__new__">➕ סיווג חדש...</option>
              </select>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <input value={form.classification} onChange={(e) => update("classification", e.target.value)}
                  placeholder="סיווג חדש" style={{ ...fieldStyle, flex: 1 }} autoFocus />
                <button type="button" onClick={() => { setIsNewClassification(false); update("classification", ""); }}
                  style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: "var(--text-muted)", fontSize: 11 }}>✕</button>
              </div>
            );
            })()}
          </div>
          <div>
            <label style={labelStyle}>מנהל</label>
            <input value={form.manager} onChange={(e) => update("manager", e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>תאריך התחלה</label>
            <input type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} style={fieldStyle} dir="ltr" />
          </div>
          <div>
            <label style={labelStyle}>חודש עדכון אחרון</label>
            <input type="month" value={form.lastUpdated ?? ""} onChange={(e) => update("lastUpdated", e.target.value)} style={fieldStyle} dir="ltr" />
          </div>
        </div>

        {/* Returns */}
        <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: "0 0 10px" }}>תשואות (%)</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { key: "monthlyReturn", label: "חודשי" },
            { key: "ytd2026", label: "מצטבר 2026" },
            { key: "y2025", label: "2025" },
            { key: "y2024", label: "2024" },
            { key: "y2023", label: "2023" },
            { key: "y2022", label: "2022" },
            { key: "y2021", label: "2021" },
            { key: "y2020", label: "2020" },
            { key: "y2019", label: "2019" },
            { key: "avgAnnualReturn", label: "ממוצע שנתי" },
          ].map(({ key, label }) => (
            <div key={key}>
              <label style={labelStyle}>{label}</label>
              <input value={form[key]} onChange={(e) => update(key, e.target.value)}
                style={{ ...fieldStyle, textAlign: "center" }} dir="ltr" placeholder="—" />
            </div>
          ))}
        </div>

        {/* Stats */}
        <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: "0 0 10px" }}>מדדים</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>שארפ</label>
            <input value={form.sharpe} onChange={(e) => update("sharpe", e.target.value)}
              style={{ ...fieldStyle, textAlign: "center" }} dir="ltr" placeholder="—" />
          </div>
          <div>
            <label style={labelStyle}>סטיית תקן (%)</label>
            <input value={form.stdDev} onChange={(e) => update("stdDev", e.target.value)}
              style={{ ...fieldStyle, textAlign: "center" }} dir="ltr" placeholder="—" />
          </div>
          <div>
            <label style={labelStyle}>AUM (מיליונים)</label>
            <input value={form.aumMillions} onChange={(e) => update("aumMillions", e.target.value)}
              style={{ ...fieldStyle, textAlign: "center" }} dir="ltr" placeholder="—" />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-start", gap: 10 }}>
          <button onClick={handleSubmit}
            disabled={!form.name.trim()}
            style={{
              backgroundColor: form.name.trim() ? "var(--accent)" : "var(--text-muted)",
              color: "#fff",
              fontWeight: 700,
              padding: "8px 28px",
              borderRadius: 6,
              border: "none",
              cursor: form.name.trim() ? "pointer" : "default",
              fontSize: 13,
              opacity: form.name.trim() ? 1 : 0.4,
            }}>
            {isEdit ? "עדכון" : "הוספה"}
          </button>
          <button onClick={onClose}
            style={{ backgroundColor: "var(--bg-surface-alt)", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 20px", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Consistency Admin Tab                                               */
/* ================================================================== */

const CONSISTENCY_CATS = [
  { id: "equity-hedged",  label: "חשיפה גבוהה למניות" },
  { id: "bond-hedged",    label: 'אג"ח - חשיפה נמוכה' },
  { id: "multi-strategy", label: "Multi Strategy" },
];

type CatKey = "equity-hedged" | "bond-hedged" | "multi-strategy";
interface WeightRow { ta125: number; telbond: number }

const DEFAULT_WEIGHTS: Record<CatKey, WeightRow> = {
  "equity-hedged":  { ta125: 100, telbond: 0  },
  "bond-hedged":    { ta125: 15,  telbond: 85 },
  "multi-strategy": { ta125: 30,  telbond: 70 },
};

function ConsistencyAdminTab({ clientKey, password }: { clientKey: string; password: string }) {
  const [weights,     setWeights]     = useState<Record<CatKey, WeightRow>>(DEFAULT_WEIGHTS);
  const [thresholds,  setThresholds]  = useState({ redScore: 40, starIR: 0.5 });
  const [saving,      setSaving]      = useState(false);
  const [status,      setStatus]      = useState("");
  const [loaded,      setLoaded]      = useState(false);

  useEffect(() => {
    fetch(`/api/consistency-config?client=${encodeURIComponent(clientKey)}`)
      .then((r) => r.json())
      .then((cfg) => {
        const bw = cfg.benchmarkWeights ?? {};
        setWeights({
          "equity-hedged":  {
            ta125:   Math.round(((bw["equity-hedged"]  ?? {})["bm-ta125"]           ?? 1.00) * 100),
            telbond: Math.round(((bw["equity-hedged"]  ?? {})["bm-telbond-maagar"] ?? 0.00) * 100),
          },
          "bond-hedged":    {
            ta125:   Math.round(((bw["bond-hedged"]    ?? {})["bm-ta125"]           ?? 0.15) * 100),
            telbond: Math.round(((bw["bond-hedged"]    ?? {})["bm-telbond-maagar"] ?? 0.85) * 100),
          },
          "multi-strategy": {
            ta125:   Math.round(((bw["multi-strategy"] ?? {})["bm-ta125"]           ?? 0.30) * 100),
            telbond: Math.round(((bw["multi-strategy"] ?? {})["bm-telbond-maagar"] ?? 0.70) * 100),
          },
        });
        setThresholds({
          redScore: cfg.thresholds?.redScore ?? 40,
          starIR:   cfg.thresholds?.starIR   ?? 0.5,
        });
        setLoaded(true);
      });
  }, [clientKey]);

  const save = async () => {
    setSaving(true);
    setStatus("");
    const body = {
      benchmarkWeights: {
        "equity-hedged":  { "bm-ta125": weights["equity-hedged"].ta125  / 100, "bm-telbond-maagar": weights["equity-hedged"].telbond  / 100 },
        "bond-hedged":    { "bm-ta125": weights["bond-hedged"].ta125    / 100, "bm-telbond-maagar": weights["bond-hedged"].telbond    / 100 },
        "multi-strategy": { "bm-ta125": weights["multi-strategy"].ta125 / 100, "bm-telbond-maagar": weights["multi-strategy"].telbond / 100 },
      },
      thresholds,
    };
    try {
      const r = await fetch(`/api/consistency-config?client=${encodeURIComponent(clientKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify(body),
      });
      setStatus(r.ok ? "✓ נשמר" : "שגיאה בשמירה");
    } catch {
      setStatus("שגיאה בשמירה");
    }
    setSaving(false);
  };

  const setWeight = (cat: CatKey, field: keyof WeightRow, val: number) => {
    setWeights((prev) => ({ ...prev, [cat]: { ...prev[cat], [field]: val } }));
    setStatus("");
  };

  if (!loaded) return <div style={{ padding: 20, color: "var(--text-muted)", fontSize: 13 }}>טוען...</div>;

  const sectionHead: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 12px" };
  const labelStyle: React.CSSProperties  = { fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 };
  const inputStyle: React.CSSProperties  = {
    width: 64, padding: "5px 8px", borderRadius: 5, border: "1px solid var(--border)",
    backgroundColor: "var(--bg-input)", color: "var(--text-primary)", fontSize: 12, textAlign: "center",
  };

  return (
    <div style={{ maxWidth: 580 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 24, marginTop: 0 }}>
        הגדרות עקביות
      </h3>

      {/* ── Benchmark weights ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <p style={sectionHead}>משקולות בנצ'מרק</p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ backgroundColor: "var(--bg-input)", borderBottom: "1px solid var(--border)" }}>
                {['קטגוריה', 'ת"א 125 (%)', 'תל בונד מאגר (%)', 'סה"כ'].map((h, i) => (
                  <th key={h} style={{ padding: "8px 14px", textAlign: i === 0 ? "right" : "center", fontWeight: 600, color: "var(--text-muted)", fontSize: 10, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CONSISTENCY_CATS.map((cat, i) => {
                const w     = weights[cat.id as CatKey];
                const total = w.ta125 + w.telbond;
                const valid = total === 100;
                return (
                  <tr key={cat.id} style={{ borderBottom: i < 2 ? "1px solid var(--border)" : "none" }}>
                    <td style={{ padding: "10px 14px", color: "var(--text-primary)", fontWeight: 500 }}>{cat.label}</td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <input
                        type="number" min={0} max={100} step={5}
                        value={w.ta125}
                        onChange={(e) => setWeight(cat.id as CatKey, "ta125", Number(e.target.value))}
                        style={inputStyle}
                      />
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center" }}>
                      <input
                        type="number" min={0} max={100} step={5}
                        value={w.telbond}
                        onChange={(e) => setWeight(cat.id as CatKey, "telbond", Number(e.target.value))}
                        style={inputStyle}
                      />
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: valid ? "#059669" : "#dc2626", fontSize: 12 }}>
                      {total}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>* סך כל המשקולות בכל קטגוריה חייב להיות 100%</p>
      </div>

      {/* ── Tag thresholds ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <p style={sectionHead}>סף תגיות</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>🔴</span>
            <span style={labelStyle}>עקביות מתחת ל-</span>
            <input
              type="number" min={0} max={100} step={5}
              value={thresholds.redScore}
              onChange={(e) => { setThresholds((p) => ({ ...p, redScore: Number(e.target.value) })); setStatus(""); }}
              style={{ ...inputStyle, width: 56 }}
            />
            <span style={labelStyle}>%</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>⭐</span>
            <span style={labelStyle}>IR מעל</span>
            <input
              type="number" min={0} max={5} step={0.1}
              value={thresholds.starIR}
              onChange={(e) => { setThresholds((p) => ({ ...p, starIR: Number(e.target.value) })); setStatus(""); }}
              style={{ ...inputStyle, width: 72 }}
            />
          </div>
        </div>
      </div>

      {/* ── Save ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={save}
          disabled={saving || CONSISTENCY_CATS.some((c) => weights[c.id as CatKey].ta125 + weights[c.id as CatKey].telbond !== 100)}
          style={{
            padding: "8px 22px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer",
            backgroundColor: "var(--accent)", color: "#fff", border: "none",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "שומר..." : "שמור הגדרות"}
        </button>
        {status && (
          <span style={{ fontSize: 12, color: status.startsWith("✓") ? "#059669" : "#dc2626", fontWeight: 600 }}>
            {status}
          </span>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Benchmark Tab (Super Admin, feature-flagged)                        */
/* ================================================================== */
function BenchmarkTab({ password, clientKey, onStatus }: {
  password: string;
  clientKey: string;
  onStatus: (msg: string) => void;
}) {
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCurrency, setNewCurrency] = useState<"ILS" | "USD">("ILS");
  const headers = { "x-admin-password": password };

  const loadBenchmarks = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/benchmarks?admin=true&client=${encodeURIComponent(clientKey)}`, { headers });
    if (res.ok) setBenchmarks(await res.json());
    setLoading(false);
  }, [clientKey]);

  useEffect(() => { loadBenchmarks(); }, [loadBenchmarks]);

  const handleCreate = async () => {
    if (!newName.trim()) { onStatus("❌ חובה להזין שם מדד"); return; }
    const res = await fetch(`/api/benchmarks?action=create&client=${encodeURIComponent(clientKey)}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), currency: newCurrency }),
    });
    if (res.ok) {
      setNewName("");
      onStatus("✓ מדד ייחוס נוצר");
      loadBenchmarks();
    }
  };

  const handleUpdate = async (id: string, updates: Record<string, unknown>) => {
    const res = await fetch(`/api/benchmarks?action=update&client=${encodeURIComponent(clientKey)}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    if (res.ok) loadBenchmarks();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`למחוק את המדד "${name}"?`)) return;
    const res = await fetch(`/api/benchmarks?action=delete&client=${encodeURIComponent(clientKey)}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      onStatus("✓ מדד נמחק");
      loadBenchmarks();
    }
  };

  const YEAR_KEYS = [
    { key: "ytd2026", label: "מצטבר 2026", editable: false },
    { key: "y2025", label: "2025", editable: true },
    { key: "y2024", label: "2024", editable: true },
    { key: "y2023", label: "2023", editable: true },
    { key: "y2022", label: "2022", editable: true },
    { key: "y2021", label: "2021", editable: true },
    { key: "y2020", label: "2020", editable: true },
    { key: "y2019", label: "2019", editable: true },
  ] as const;

  const MONTHS_2026 = [
    { key: "2026-01", label: "ינואר" }, { key: "2026-02", label: "פברואר" },
    { key: "2026-03", label: "מרץ" }, { key: "2026-04", label: "אפריל" },
    { key: "2026-05", label: "מאי" }, { key: "2026-06", label: "יוני" },
    { key: "2026-07", label: "יולי" }, { key: "2026-08", label: "אוגוסט" },
    { key: "2026-09", label: "ספטמבר" }, { key: "2026-10", label: "אוקטובר" },
    { key: "2026-11", label: "נובמבר" }, { key: "2026-12", label: "דצמבר" },
  ];

  if (loading) return <div style={{ padding: 20, color: "var(--text-muted)" }}>טוען...</div>;

  return (
    <div style={{ maxWidth: 800 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
        📊 ניהול מדדי ייחוס
      </h3>

      {/* Add new benchmark */}
      <div style={{
        backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
        borderRadius: 10, padding: "14px 18px", marginBottom: 20,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>הוספת מדד חדש</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="שם המדד..."
            style={{
              flex: 1, minWidth: 160, padding: "7px 12px", borderRadius: 6,
              border: "1px solid var(--border)", backgroundColor: "var(--bg-input)",
              color: "var(--text-primary)", fontSize: 12, direction: "rtl",
            }}
          />
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setNewCurrency("ILS")}
              style={{
                padding: "5px 12px", borderRadius: 5, fontSize: 11, cursor: "pointer",
                border: `1px solid ${newCurrency === "ILS" ? "#059669" : "var(--border)"}`,
                backgroundColor: newCurrency === "ILS" ? "#05966915" : "var(--bg-surface)",
                color: newCurrency === "ILS" ? "#059669" : "var(--text-secondary)",
                fontWeight: newCurrency === "ILS" ? 700 : 400,
              }}>₪</button>
            <button onClick={() => setNewCurrency("USD")}
              style={{
                padding: "5px 12px", borderRadius: 5, fontSize: 11, cursor: "pointer",
                border: `1px solid ${newCurrency === "USD" ? "#3b82f6" : "var(--border)"}`,
                backgroundColor: newCurrency === "USD" ? "#3b82f615" : "var(--bg-surface)",
                color: newCurrency === "USD" ? "#3b82f6" : "var(--text-secondary)",
                fontWeight: newCurrency === "USD" ? 700 : 400,
              }}>$</button>
          </div>
          <button onClick={handleCreate}
            style={{
              backgroundColor: "#059669", color: "#fff", fontWeight: 600,
              padding: "7px 18px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12,
            }}>+ הוסף</button>
        </div>
      </div>

      {/* Benchmark list */}
      {benchmarks.length === 0 && (
        <div style={{ textAlign: "center", padding: 30, color: "var(--text-muted)", fontSize: 13 }}>
          אין מדדי ייחוס — הוסף מדד חדש למעלה
        </div>
      )}

      {benchmarks.map((bm) => {
        const isEditing = editingId === bm.id;
        const currencySymbol = bm.currency === "USD" ? "$" : "₪";

        return (
          <div key={bm.id} style={{
            backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "14px 18px", marginBottom: 12,
            opacity: bm.active ? 1 : 0.5,
          }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isEditing ? 14 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 600,
                  backgroundColor: bm.currency === "USD" ? "#3b82f615" : "#05966915",
                  color: bm.currency === "USD" ? "#3b82f6" : "#059669",
                }}>{currencySymbol}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{bm.name}</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setEditingId(isEditing ? null : bm.id)}
                  style={{ background: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 12px", cursor: "pointer", fontSize: 11, color: isEditing ? "#059669" : "var(--text-secondary)" }}>
                  {isEditing ? "סגור" : "ערוך"}
                </button>
                <button onClick={() => handleUpdate(bm.id, { active: !bm.active })}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14 }}
                  title={bm.active ? "השבת" : "הפעל"}>
                  {bm.active ? "✅" : "❌"}
                </button>
                <button onClick={() => handleDelete(bm.id, bm.name)}
                  style={{ background: "none", border: "1px solid var(--negative)", borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontSize: 11, color: "var(--negative)" }}>
                  מחק
                </button>
              </div>
            </div>

            {/* Editing panel */}
            {isEditing && (
              <div>
                {/* Annual returns */}
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>תשואות שנתיות (%)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 14 }}>
                  {YEAR_KEYS.map((y) => {
                    const val = bm.returns[y.key as keyof typeof bm.returns];
                    return (
                      <div key={y.key}>
                        <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginBottom: 2 }}>
                          {y.label} {!y.editable && <span style={{ fontSize: 9, color: "#f59e0b" }}>(אוטומטי)</span>}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          disabled={!y.editable}
                          key={`${bm.id}-${y.key}-${val}`}
                          defaultValue={val != null ? (val * 100).toFixed(2) : ""}
                          placeholder="—"
                          onBlur={(e) => {
                            const v = e.target.value === "" ? null : parseFloat(e.target.value) / 100;
                            if (v !== val) handleUpdate(bm.id, { returns: { [y.key]: v } });
                          }}
                          style={{
                            width: "100%", padding: "5px 8px", borderRadius: 5,
                            border: "1px solid var(--border)", backgroundColor: y.editable ? "var(--bg-input)" : "var(--bg-surface-alt)",
                            color: "var(--text-primary)", fontSize: 12, textAlign: "center",
                          }}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Monthly returns 2026 */}
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>תשואות חודשיות 2026 (%)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
                  {MONTHS_2026.map((m) => {
                    const val = bm.monthlyReturns?.[m.key];
                    return (
                      <div key={m.key}>
                        <label style={{ fontSize: 9, color: "var(--text-muted)", display: "block", marginBottom: 2, textAlign: "center" }}>{m.label}</label>
                        <input
                          type="number"
                          step="0.01"
                          key={`${bm.id}-${m.key}-${val}`}
                          defaultValue={val != null ? (val * 100).toFixed(2) : ""}
                          placeholder="—"
                          onBlur={(e) => {
                            const v = e.target.value === "" ? null : parseFloat(e.target.value) / 100;
                            if (v === val) return;
                            if (v === null) {
                              const mr = { ...(bm.monthlyReturns || {}) };
                              delete mr[m.key];
                              handleUpdate(bm.id, { monthlyReturns: mr });
                            } else {
                              handleUpdate(bm.id, { monthlyReturns: { [m.key]: v } });
                            }
                          }}
                          style={{
                            width: "100%", padding: "4px 6px", borderRadius: 5,
                            border: "1px solid var(--border)", backgroundColor: "var(--bg-input)",
                            color: "var(--text-primary)", fontSize: 11, textAlign: "center",
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                {bm.returns.ytd2026 != null && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "#059669", fontWeight: 600 }}>
                    מצטבר 2026 (מחושב): {(bm.returns.ytd2026 * 100).toFixed(2)}%
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/*  AI Parser Tab (Super Admin only, feature-flagged)                   */
/* ================================================================== */
function AiParserTab({ password, clientKey, data, brand, onStatus, onReload }: {
  password: string;
  clientKey: string;
  data: FundsData;
  brand: BrandConfig;
  onStatus: (msg: string) => void;
  onReload: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inputText, setInputText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [creditBanner, setCreditBanner] = useState(false);
  const [parseResult, setParseResult] = useState<{
    fundName: string;
    fundNameConfidence: number;
    reportMonth: string | null;
    reportMonthConfidence: "high" | "low";
    returnBasis: "ILS" | "USD" | null;
    returnBasisOptions: ("ILS" | "USD")[];
    fields: { key: string; value: string | number | null; confidence: number }[];
    match: { fundId: string | null; fundName: string | null; similarity: number; categoryId: string | null } | null;
    dualCurrencyData?: { returnBasis: "ILS" | "USD"; fields: { key: string; value: string | number | null; confidence: number }[] }[];
    validation?: { overallStatus: 'valid' | 'warning' | 'error'; rows: { year: string; reportedAnnual: number | null; computedAnnual: number | null; gap: number | null; months: (number | null)[]; status: 'valid' | 'warning' | 'error' | 'no-annual' }[]; suspiciousMonths?: string[] }[];
    validationStatus?: 'valid' | 'warning' | 'error';
  } | null>(null);
  // Track which dual currency drafts have been saved
  const [dualSaved, setDualSaved] = useState<Set<string>>(new Set());
  const [expandedYear, setExpandedYear] = useState<string | null>(null);
  const [approvedFields, setApprovedFields] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<{
    id: string; createdAt: string; status: string;
    extracted: { fundName: string; fields: { key: string; value: string | number | null; confidence: number }[] };
    match: { fundId: string | null; fundName: string | null; similarity: number; categoryId: string | null } | null;
    source: { preview: string };
    reportMonth: string | null;
    reportMonthConfidence: "high" | "low";
    returnBasis: "ILS" | "USD" | null;
    corrections?: string[];
  }[]>([]);
  const [view, setView] = useState<"input" | "review" | "drafts">("input");
  const [showArchive, setShowArchive] = useState(false);
  const [archiveFilter, setArchiveFilter] = useState<"all" | "applied" | "rejected">("all");
  const [archiveMonthFilter, setArchiveMonthFilter] = useState("");
  const [selectedMatchFundId, setSelectedMatchFundId] = useState<string>("");
  const [selectedMatchCatId, setSelectedMatchCatId] = useState<string>("");
  const [reportMonth, setReportMonth] = useState<string>("");
  const reportMonthInputRef = useRef<HTMLInputElement>(null);
  const [returnBasis, setReturnBasis] = useState<"ILS" | "USD" | null>(null);
  const [diffResult, setDiffResult] = useState<{ diff: { field: string; existingValue: string | number | null; newValue: string | number | null; status: "new" | "changed" | "same" | "missing_in_pdf"; monthlyProtected?: boolean; historyMismatch?: boolean; historyDiff?: number }[]; diffComputedAt: string; fundLastUpdated: string | null; draftId: string; hasMonthlyUncertain?: boolean; draftCorrections?: string[]; monthlyValidation?: { year: number; compounded: number; yearly: number; diff: number; status: "pass" | "fail" }[]; fundMonthlyDirection?: "LTR" | "RTL" | null } | null>(null);
  const [fieldDecisions, setFieldDecisions] = useState<Record<string, "replace" | "keep" | "clear">>({});
  const [draftReportMonths, setDraftReportMonths] = useState<Record<string, string>>({});
  const [tokenUsage, setTokenUsage] = useState<{
    inputTokens: number; outputTokens: number; callCount: number;
    limit: number; callLimit: number; percent: number; warning: boolean; blocked: boolean;
  } | null>(null);
  const [lastApplyInfo, setLastApplyInfo] = useState<{ fundName: string; timestamp: number } | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResult, setBatchResult] = useState<{ applied: number; skipped: number; failed: number } | null>(null);
  const [draftMatchOverrides, setDraftMatchOverrides] = useState<Record<string, { fundId: string; categoryId: string; fundName: string }>>({});
  const [editedFields, setEditedFields] = useState<Record<string, Record<string, number>>>({});
  const [matchEditDraftId, setMatchEditDraftId] = useState<string | null>(null);
  const [matchEditSearch, setMatchEditSearch] = useState("");
  const matchEditRef = useRef<HTMLDivElement>(null);

  const headers = { "x-admin-password": password };

  // Load drafts
  const loadDrafts = useCallback(async () => {
    try {
      const res = await fetch(`/api/parse?action=drafts&client=${encodeURIComponent(clientKey)}`, { headers });
      if (res.ok) setDrafts(await res.json());
    } catch { /* ignore */ }
  }, [clientKey]);

  // Load token usage
  const loadTokenUsage = useCallback(async () => {
    try {
      const res = await fetch(`/api/parse?action=token-usage&client=${encodeURIComponent(clientKey)}`, { headers });
      if (res.ok) setTokenUsage(await res.json());
    } catch { /* ignore */ }
  }, [clientKey]);

  useEffect(() => { loadDrafts(); loadTokenUsage(); }, [loadDrafts, loadTokenUsage]);

  // Native event listener for reportMonth input — bypasses React synthetic events (type="month" quirk in Chrome)
  // Depends on `view` because the input only renders when view === "review"
  useEffect(() => {
    if (view !== "review") return;
    const el = reportMonthInputRef.current;
    if (!el) return;
    const handler = () => {
      const val = el.value;
      if (val) setReportMonth(val);
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
    return () => {
      el.removeEventListener('input', handler);
      el.removeEventListener('change', handler);
    };
  }, [view]);

  // All funds flat list for matching dropdown — sorted alphabetically (active only)
  const allFunds: { id: string; name: string; catId: string; catName: string }[] = [];
  data.categories.forEach((cat) => {
    cat.funds.forEach((fund) => {
      if (fund.active === false) return; // skip deleted/inactive funds
      allFunds.push({ id: fund.id, name: fund.name, catId: cat.id, catName: cat.name });
    });
  });
  allFunds.sort((a, b) => a.name.localeCompare(b.name, "he"));

  // Fund search state
  const [fundSearch, setFundSearch] = useState("");
  const [fundDropdownOpen, setFundDropdownOpen] = useState(false);
  const fundSearchRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (fundSearchRef.current && !fundSearchRef.current.contains(e.target as Node)) {
        setFundDropdownOpen(false);
      }
      if (matchEditRef.current && !matchEditRef.current.contains(e.target as Node)) {
        setMatchEditDraftId(null);
        setMatchEditSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtered funds based on search
  const filteredFunds = fundSearch.trim()
    ? allFunds.filter((f) =>
        f.name.toLowerCase().includes(fundSearch.toLowerCase()) ||
        f.catName.toLowerCase().includes(fundSearch.toLowerCase())
      )
    : allFunds;

  const handleParse = async () => {
    if (!inputText.trim() || inputText.trim().length < 10) {
      onStatus("❌ הטקסט קצר מדי (מינימום 10 תווים)");
      return;
    }
    setParsing(true);
    try {
      const res = await fetch(`/api/parse?action=parse&client=${encodeURIComponent(clientKey)}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText }),
      });
      if (!res.ok) {
        const err = await res.json();
        onStatus(`❌ ${err.error || "שגיאה בפענוח"}`);
        setParsing(false);
        return;
      }
      const result = await res.json();
      setParseResult(result);
      // Auto-approve high confidence fields
      const approved = new Set<string>();
      for (const f of result.fields || []) {
        if (f.confidence >= 0.7) approved.add(f.key);
      }
      setApprovedFields(approved);
      // Auto-set reportMonth from AI
      setReportMonth(result.reportMonth || "");
      setReturnBasis(result.returnBasis || null);
      setDiffResult(null);
      setFieldDecisions({});
      // Auto-set match
      if (result.match?.fundId) {
        setSelectedMatchFundId(result.match.fundId);
        setSelectedMatchCatId(result.match.categoryId || "");
      }
      setView("review");
      loadTokenUsage();
      setDualSaved(new Set());
      // Show dual currency notification if both found
      if (result.dualCurrencyData?.length === 2) {
        // Auto-set to first currency's fields
        const firstEntry = result.dualCurrencyData[0];
        setReturnBasis(firstEntry.returnBasis);
        setParseResult({ ...result, fields: firstEntry.fields, returnBasis: firstEntry.returnBasis });
        // Rebuild approved set from the ACTUAL displayed fields (firstEntry), not top-level
        const dualApproved = new Set<string>();
        for (const f of firstEntry.fields) {
          if (f.confidence >= 0.7) dualApproved.add(f.key);
        }
        // Also include any approved keys from the second entry
        const secondEntry = result.dualCurrencyData[1];
        for (const f of secondEntry.fields) {
          if (f.confidence >= 0.7) dualApproved.add(f.key);
        }
        setApprovedFields(dualApproved);
        onStatus("⚠️ נמצא דיווח כפול (שקלי + דולרי) — יש לשמור שני טיוטות נפרדות");
      } else if (result.returnBasisOptions?.length === 2) {
        onStatus("⚠️ הדיווח כולל תשואות שקליות ודולריות — בחר את המטבע הרלוונטי");
      } else if (result.tokenUsage?.warning) {
        onStatus(`⚠️ שימוש ב-${result.tokenUsage.percent}% מהמכסה החודשית`);
      }
    } catch {
      onStatus("❌ שגיאה בחיבור לשרת");
    }
    setParsing(false);
  };

  const handleFileUpload = async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    const file = selectedFiles[0];

    const validTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!validTypes.includes(file.type)) {
      onStatus(`❌ סוג קובץ לא נתמך: ${file.type}`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      onStatus(`❌ קובץ גדול מדי (${(file.size / 1024 / 1024).toFixed(1)}MB). מקסימום 10MB`);
      return;
    }

    console.log(`[upload] ▶ handleFileUpload file=${file.name} size=${file.size} type=${file.type} client=${clientKey}`);
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      console.log(`[upload] fetch POST /api/parse?action=parse-file`);
      const res = await fetch(`/api/parse?action=parse-file&client=${encodeURIComponent(clientKey)}`, {
        method: "POST",
        headers: { "x-admin-password": password },
        body: formData,
      });
      console.log(`[upload] response status=${res.status} ok=${res.ok}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "שגיאה בפענוח" }));
        console.error(`[upload] ✗ server error: ${JSON.stringify(err)}`);
        if (res.status === 402 && err.error === "anthropic_credit_exhausted") {
          setCreditBanner(true);
          setParsing(false);
          return;
        }
        onStatus(`❌ ${err.error || "שגיאה בפענוח"}`);
        setParsing(false);
        return;
      }
      const result = await res.json();
      console.log(`[upload] result keys=${Object.keys(result).join(',')} fundName=${result.fundName} reportMonth=${result.reportMonth} fields=${result.fields?.length ?? 0} dualCurrency=${!!(result.dualCurrencyData?.length)}`);
      setParseResult(result);
      setInputText(`[קובץ: ${file.name}]`);
      const approved = new Set<string>();
      for (const f of result.fields || []) {
        if (f.confidence >= 0.7) approved.add(f.key);
      }
      setApprovedFields(approved);
      setReportMonth(result.reportMonth || "");
      setReturnBasis(result.returnBasis || null);
      setDiffResult(null);
      setFieldDecisions({});
      if (result.match?.fundId) {
        setSelectedMatchFundId(result.match.fundId);
        setSelectedMatchCatId(result.match.categoryId || "");
      }
      console.log(`[upload] calling setView("review")`);
      setView("review");
      loadTokenUsage();
      setDualSaved(new Set());
      if (result.dualCurrencyData?.length === 2) {
        const firstEntry = result.dualCurrencyData[0];
        setReturnBasis(firstEntry.returnBasis);
        setParseResult({ ...result, fields: firstEntry.fields, returnBasis: firstEntry.returnBasis });
        // Rebuild approved set from actual entry fields
        const dualApproved = new Set<string>();
        for (const f of firstEntry.fields) {
          if (f.confidence >= 0.7) dualApproved.add(f.key);
        }
        const secondEntry = result.dualCurrencyData[1];
        for (const f of secondEntry.fields) {
          if (f.confidence >= 0.7) dualApproved.add(f.key);
        }
        setApprovedFields(dualApproved);
        onStatus("⚠️ נמצא דיווח כפול (שקלי + דולרי) — יש לשמור שני טיוטות נפרדות");
      } else if (result.returnBasisOptions?.length === 2) {
        onStatus("⚠️ הדיווח כולל תשואות שקליות ודולריות — בחר את המטבע הרלוונטי");
      } else if (result.tokenUsage?.warning) {
        onStatus(`⚠️ שימוש ב-${result.tokenUsage.percent}% מהמכסה החודשית`);
      } else if (result.fromCache) {
        onStatus("✓ תוצאה מהמטמון — 0 טוקנים");
      }
    } catch (err) {
      console.error(`[upload] ✗ exception:`, err instanceof Error ? err.stack : String(err));
      onStatus("❌ שגיאה בחיבור לשרת");
    }
    setParsing(false);
  };

  const handleSaveDraft = async (currencyOverride?: "ILS" | "USD") => {
    if (!parseResult) return;
    const saveBasis = currencyOverride || returnBasis;
    // For dual currency saves, use the specific currency's fields
    let fieldsForSave = parseResult.fields;
    if (currencyOverride && parseResult.dualCurrencyData?.length === 2) {
      const entry = parseResult.dualCurrencyData.find((e) => e.returnBasis === currencyOverride);
      if (entry) fieldsForSave = entry.fields;
    }
    const approvedFieldsList = fieldsForSave.filter((f) => approvedFields.has(f.key));
    if (approvedFieldsList.length === 0) {
      onStatus("❌ יש לסמן לפחות שדה אחד לאישור");
      return;
    }

    // Require reportMonth if monthlyReturn is approved
    const hasMonthlyReturn = approvedFieldsList.some((f) => f.key === "monthlyReturn");
    if (hasMonthlyReturn && !reportMonth) {
      onStatus("❌ חובה לבחור חודש דיווח לפני שמירה");
      return;
    }

    // Strip suspicious months (later than reportMonth) before saving
    const allSuspiciousMonths = new Set<string>(
      (parseResult.validation || []).flatMap((v) => v.suspiciousMonths || [])
    );
    let fieldsToSave = approvedFieldsList;
    if (allSuspiciousMonths.size > 0) {
      // Remove suspicious monthlyReturns fields
      fieldsToSave = approvedFieldsList.filter((f) => {
        const mm = f.key.match(/^monthlyReturns\.(\d{4})-(0[1-9]|1[0-2])$/);
        return mm ? !allSuspiciousMonths.has(`${mm[1]}-${mm[2]}`) : true;
      });
      // Update monthlyReturn to value of the last valid month
      if (fieldsToSave.some((f) => f.key === "monthlyReturn")) {
        const validMonthFields = fieldsToSave
          .filter((f) => /^monthlyReturns\.\d{4}-(0[1-9]|1[0-2])$/.test(f.key))
          .sort((a, b) => b.key.localeCompare(a.key));
        if (validMonthFields.length > 0) {
          const lastValidValue = validMonthFields[0].value;
          fieldsToSave = fieldsToSave.map((f) =>
            f.key === "monthlyReturn" ? { ...f, value: lastValidValue } : f
          );
        }
      }
    }

    const match = selectedMatchFundId ? {
      fundId: selectedMatchFundId,
      fundName: allFunds.find((f) => f.id === selectedMatchFundId)?.name || null,
      similarity: parseResult.match?.similarity || 0,
      categoryId: selectedMatchCatId,
    } : null;

    try {
      const res = await fetch(`/api/parse?action=save-draft&client=${encodeURIComponent(clientKey)}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceText: inputText,
          fundName: parseResult.dualCurrencyData?.length === 2 && saveBasis
            ? `${parseResult.fundName} - ${saveBasis === "ILS" ? "שקלי" : "דולרי"}`
            : parseResult.fundName,
          fundNameConfidence: parseResult.fundNameConfidence,
          fields: fieldsToSave,
          match,
          reportMonth: reportMonth || null,
          reportMonthConfidence: parseResult.reportMonthConfidence,
          returnBasis: saveBasis,
        }),
      });
      if (res.ok) {
        // Dual currency: track saved currency
        if (parseResult.dualCurrencyData?.length === 2 && saveBasis) {
          const newSaved = new Set(dualSaved);
          newSaved.add(saveBasis);
          setDualSaved(newSaved);

          if (newSaved.size < 2) {
            onStatus(`✓ טיוטה ${saveBasis === "ILS" ? "שקלית" : "דולרית"} נשמרה — שמור כעת את המטבע השני`);
            loadDrafts();
            return;
          }
          // Both saved
          onStatus("✓ שתי הטיוטות נשמרו (שקלי + דולרי)");
        } else {
          onStatus("✓ טיוטה נשמרה");
        }
        setView("input");
        setParseResult(null);
        setInputText("");
        loadDrafts();
      } else {
        const err = await res.json();
        onStatus(`❌ ${err.error || "שגיאה בשמירה"}`);
      }
    } catch {
      onStatus("❌ שגיאה בחיבור לשרת");
    }
  };

  // Phase 2: build initial field decisions — auto-default protected monthly fields to "keep"
  const buildInitialDecisions = (diff: { field: string; status: string; monthlyProtected?: boolean }[]): Record<string, "replace" | "keep" | "clear"> => {
    const decisions: Record<string, "replace" | "keep" | "clear"> = {};
    for (const d of diff) {
      if (d.monthlyProtected) decisions[d.field] = "keep";
    }
    return decisions;
  };

  const handleApplyDraft = async (draft: typeof drafts[0], overrideDecisions?: Record<string, "replace" | "keep" | "clear">) => {
    // Use match override if available
    const matchOverride = draftMatchOverrides[draft.id];
    const effectiveFundId = matchOverride?.fundId || draft.match?.fundId;
    const effectiveCategoryId = matchOverride?.categoryId || draft.match?.categoryId;
    const effectiveFundName = matchOverride?.fundName || draft.match?.fundName;

    if (!effectiveFundId || !effectiveCategoryId) {
      // Match validation: if draft has returnBasis, try auto-match by returnBasis
      if (draft.returnBasis) {
        const matchesByBasis = allFunds.filter((f) => {
          const fund = data.categories.flatMap((c) => c.funds).find((ff) => ff.id === f.id);
          return fund && (fund as unknown as Record<string, unknown>).returnBasis === draft.returnBasis;
        });
        if (matchesByBasis.length === 1) {
          onStatus(`🔍 נמצאה קרן תואמת לפי מטבע (${draft.returnBasis}): "${matchesByBasis[0].name}" — יש לבחור אותה בדרופדאון ולנסות שוב`);
          return;
        }
        onStatus("❌ לא נמצאה התאמה יחידה לפי מטבע — יש לבחור קרן ידנית מהרשימה");
        return;
      }
      onStatus("❌ לא נבחרה קרן להתאמה — יש לבחור קרן מהרשימה או ליצור חדשה");
      return;
    }

    // Apply edited field values
    const fieldEdits = editedFields[draft.id] || {};
    const effectiveFields = draft.extracted.fields.map((f) => {
      if (fieldEdits[f.key] !== undefined) {
        return { ...f, value: fieldEdits[f.key] };
      }
      return f;
    });

    const draftReportMonth = draftReportMonths[draft.id] || draft.reportMonth;
    const hasMonthlyReturn = draft.extracted.fields.some((f) => f.key === "monthlyReturn");

    if (hasMonthlyReturn && !draftReportMonth) {
      onStatus("❌ לטיוטה זו חסר חודש דיווח — לא ניתן להחיל תשואה חודשית");
      return;
    }

    // Validation warnings before apply
    if (hasMonthlyReturn && draftReportMonth && effectiveFundId) {
      const matchedFund = data.categories
        .flatMap((cat) => cat.funds)
        .find((f) => f.id === effectiveFundId);

      if (matchedFund) {
        const monthlyReturns = matchedFund.monthlyReturns || {};
        const existingMonths = Object.keys(monthlyReturns).sort();

        // Warning: Updating older month when newer exists
        if (existingMonths.length > 0) {
          const latestMonth = existingMonths[existingMonths.length - 1];
          if (draftReportMonth < latestMonth) {
            if (!window.confirm(`⚠️ שים לב — אתה מעדכן חודש ${draftReportMonth}, אבל במערכת כבר קיים חודש ${latestMonth}. להמשיך?`)) return;
          }

          // Warning: Gap in months
          if (draftReportMonth > latestMonth) {
            const [ly, lm] = latestMonth.split("-").map(Number);
            const [dy, dm] = draftReportMonth.split("-").map(Number);
            const monthDiff = (dy - ly) * 12 + (dm - lm);
            if (monthDiff > 1) {
              if (!window.confirm(`⚠️ שים לב — חודש אחרון במערכת: ${latestMonth}, אתה מעדכן ${draftReportMonth}. חסרים ${monthDiff - 1} חודשים. להמשיך?`)) return;
            }
          }
        }

        // Warning: Abnormal monthly return
        const monthlyReturnField = effectiveFields.find((f) => f.key === "monthlyReturn");
        if (monthlyReturnField && typeof monthlyReturnField.value === "number") {
          const absReturn = Math.abs(monthlyReturnField.value);
          if (absReturn > 0.2) {
            if (!window.confirm(`⚠️ שים לב — תשואה חודשית של ${(monthlyReturnField.value * 100).toFixed(2)}% נראית חריגה. להמשיך?`)) return;
          }
        }
      }
    }

    // Monthly uncertain confirmation gate
    if (draft.corrections?.some((c: string) => c.includes("monthly_uncertain"))) {
      if (!window.confirm("⚠️ הנתונים החודשיים בטיוטה זו סומנו כלא אמינים (monthly_uncertain).\nהאם לבצע עדכון בכל זאת?")) {
        return;
      }
    }

    // Step 1: Compute diff (unless we already have decisions from the diff UI)
    if (!overrideDecisions) {
      try {
        const checkRes = await fetch(`/api/parse?action=check-collision&client=${encodeURIComponent(clientKey)}`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            fundId: effectiveFundId,
            categoryId: effectiveCategoryId,
            reportMonth: draftReportMonth || null,
            approvedFields: effectiveFields,
            draftId: draft.id,
          }),
        });
        if (!checkRes.ok) {
          onStatus("❌ שגיאה בחישוב ההשוואה — נא לנסות שוב");
          return;
        }
        const result = await checkRes.json();
        const changedFields = (result.diff || []).filter((d: { status: string }) => d.status === "changed");
        const missingFields = (result.diff || []).filter((d: { status: string }) => d.status === "missing_in_pdf");
        const needsDecision = changedFields.length > 0 || missingFields.length > 0;
        if (needsDecision) {
          setDiffResult({ ...result, draftId: draft.id });
          setFieldDecisions(buildInitialDecisions(result.diff || []));
          const parts = [];
          if (changedFields.length > 0) parts.push(`${changedFields.length} שונים`);
          if (missingFields.length > 0) parts.push(`${missingFields.length} חסרים בדוח`);
          onStatus(`⚠️ נמצאו ${parts.join(", ")} — נדרשת החלטה`);
          return;
        }
        const newFields = (result.diff || []).filter((d: { status: string }) => d.status === "new");
        if (newFields.length === 0) {
          onStatus("ℹ️ כל הערכים זהים למה שכבר במערכת — אין צורך בעדכון");
          return;
        }
        if (result.autoApplyEligible) {
          setDiffResult({ ...result, draftId: draft.id });
          try {
            const applyRes = await fetch(`/api/parse?action=apply&client=${encodeURIComponent(clientKey)}`, {
              method: "POST",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({
                draftId: draft.id,
                fundId: effectiveFundId,
                categoryId: effectiveCategoryId,
                approvedFields: effectiveFields,
                reportMonth: draftReportMonth || null,
                returnBasis: draft.returnBasis || null,
                fieldDecisions: {},
                diffComputedAt: result.diffComputedAt,
                clearFields: [],
                autoApply: true,
              }),
            });
            if (applyRes.ok) {
              const applyResult = await applyRes.json();
              onStatus(`✓ עודכנו ${applyResult.appliedFields} שדות חדשים בקרן (אוטומטי)`);
              setDiffResult(null);
              setFieldDecisions({});
              setLastApplyInfo({ fundName: effectiveFundName || draft.extracted.fundName, timestamp: Date.now() });
              loadDrafts();
              onReload();
              return;
            }
            if (applyRes.status === 409) {
              const errData = await applyRes.json();
              if (errData.requiresDiff) {
                onStatus("⚠️ נמצאו שינויים — נדרשת סקירה ידנית");
                const recheck = await fetch(`/api/parse?action=check-collision&client=${encodeURIComponent(clientKey)}`, {
                  method: "POST",
                  headers: { ...headers, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    fundId: effectiveFundId,
                    categoryId: effectiveCategoryId,
                    reportMonth: draftReportMonth || null,
                    approvedFields: effectiveFields,
                    draftId: draft.id,
                  }),
                });
                if (recheck.ok) {
                  const recheckResult = await recheck.json();
                  setDiffResult({ ...recheckResult, draftId: draft.id });
                  setFieldDecisions(buildInitialDecisions(recheckResult.diff || []));
                }
                return;
              }
              onStatus(`❌ ${errData.error || "שגיאה בעדכון"}`);
              return;
            }
            const errData = await applyRes.json();
            onStatus(`❌ ${errData.error || "שגיאה בעדכון"}`);
            return;
          } catch {
            onStatus("❌ שגיאה בחיבור לשרת");
            return;
          }
        }
        setDiffResult({ ...result, draftId: draft.id });
        if (!window.confirm(`לעדכן את הקרן "${effectiveFundName}" עם ${newFields.length} שדות חדשים?`)) return;
        overrideDecisions = {};
      } catch {
        onStatus("❌ שגיאה בחיבור לשרת — לא ניתן לחשב השוואה");
        return;
      }
    }

    try {
      const res = await fetch(`/api/parse?action=apply&client=${encodeURIComponent(clientKey)}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: draft.id,
          fundId: effectiveFundId,
          categoryId: effectiveCategoryId,
          approvedFields: effectiveFields,
          reportMonth: draftReportMonth || null,
          returnBasis: draft.returnBasis || null,
          fieldDecisions: overrideDecisions || {},
          diffComputedAt: diffResult?.diffComputedAt || null,
          clearFields: Object.entries(overrideDecisions || {}).filter(([, v]) => v === "clear").map(([k]) => k),
        }),
      });
      if (res.ok) {
        const result = await res.json();
        const skippedMsg = result.skippedFields > 0 ? ` (${result.skippedFields} שדות נשמרו ללא שינוי)` : "";
        onStatus(`✓ הנתונים עודכנו בקרן${skippedMsg}`);
        setDiffResult(null);
        setFieldDecisions({});
        setLastApplyInfo({ fundName: effectiveFundName || draft.extracted.fundName, timestamp: Date.now() });
        loadDrafts();
        onReload();
      } else {
        const err = await res.json();
        onStatus(`❌ ${err.error || "שגיאה בעדכון"}`);
      }
    } catch {
      onStatus("❌ שגיאה בחיבור לשרת");
    }
  };

  const handleRejectDraft = async (draftId: string) => {
    if (!window.confirm("לדחות טיוטה זו?")) return;
    const res = await fetch(`/api/parse?action=reject&client=${encodeURIComponent(clientKey)}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ draftId }),
    });
    if (res.ok) {
      onStatus("✓ טיוטה נדחתה");
      loadDrafts();
    }
  };

  const handleUndo = async () => {
    if (!window.confirm("לבטל את העדכון האחרון ולשחזר את המצב הקודם?")) return;
    try {
      const res = await fetch(`/api/parse?action=undo&client=${encodeURIComponent(clientKey)}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const result = await res.json();
        onStatus(`✓ העדכון בוטל — הקרן "${result.fundName}" שוחזרה`);
        setLastApplyInfo(null);
        loadDrafts();
        onReload();
      } else {
        const err = await res.json();
        onStatus(`❌ ${err.error || "שגיאה בביטול"}`);
        setLastApplyInfo(null);
      }
    } catch {
      onStatus("❌ שגיאה בחיבור לשרת");
    }
  };

  // New fund onboarding state
  const [newFundDraftId, setNewFundDraftId] = useState<string | null>(null);
  const [newFundCategoryId, setNewFundCategoryId] = useState<string>("");
  const [newFundName, setNewFundName] = useState<string>("");
  const [newFundReturnBasis, setNewFundReturnBasis] = useState<"ILS" | "USD">("ILS");
  const [newFundClassification, setNewFundClassification] = useState<string>("");
  // 3-layer classification state for new fund onboarding
  const [nfParentSection, setNfParentSection] = useState<string>("");
  const [nfIsNewParent, setNfIsNewParent] = useState(false);
  const [nfNewParentName, setNfNewParentName] = useState("");
  const [nfIsNewCategory, setNfIsNewCategory] = useState(false);
  const [nfNewCategoryName, setNfNewCategoryName] = useState("");
  const [nfIsNewClassification, setNfIsNewClassification] = useState(false);

  const handleCreateFund = async (draft: typeof drafts[0]) => {
    const fundName = newFundName || draft.extracted.fundName;
    if (!fundName) {
      onStatus("❌ חובה להזין שם קרן");
      return;
    }

    // Resolve categoryId: existing or __new__
    let effectiveCategoryId = newFundCategoryId;
    if (nfIsNewCategory && nfNewCategoryName.trim()) {
      const ps = nfIsNewParent ? nfNewParentName.trim() : nfParentSection;
      if (!ps) {
        onStatus("❌ חובה לבחור או ליצור קבוצה ראשית");
        return;
      }
      effectiveCategoryId = `__new__:cat-${Date.now()}:${nfNewCategoryName.trim()}:${ps}`;
    }

    if (!effectiveCategoryId) {
      onStatus("❌ חובה לבחור קטגוריה");
      return;
    }

    const effectiveMonth = draftReportMonths[draft.id] ?? (draft.reportMonth || null);

    // Warning 6: Similar fund name exists
    const allExistingFunds = data.categories.flatMap((cat) => cat.funds);
    const exactMatch = allExistingFunds.find((f) => f.name === fundName && f.active !== false);
    if (exactMatch) {
      onStatus(`❌ קרן בשם "${fundName}" כבר קיימת במערכת`);
      return;
    }
    const similarFund = allExistingFunds.find((f) =>
      f.active !== false && f.name !== fundName &&
      (f.name.includes(fundName) || fundName.includes(f.name) ||
       f.name.toLowerCase().replace(/[\s\-]/g, "") === fundName.toLowerCase().replace(/[\s\-]/g, ""))
    );
    if (similarFund) {
      if (!window.confirm(`⚠️ קיימת קרן בשם דומה: "${similarFund.name}". ליצור בכל זאת?`)) return;
    }

    if (!window.confirm(`ליצור קרן חדשה "${fundName}"?`)) return;

    try {
      const res = await fetch(`/api/parse?action=create-fund&client=${encodeURIComponent(clientKey)}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: draft.id,
          categoryId: effectiveCategoryId,
          fundName,
          fields: draft.extracted.fields,
          reportMonth: effectiveMonth,
          returnBasis: newFundReturnBasis,
          classification: newFundClassification || undefined,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        onStatus(`✓ קרן חדשה נוצרה: "${result.fundName}"`);
        setNewFundDraftId(null);
        setNewFundName("");
        setNewFundCategoryId("");
        setNewFundClassification("");
        setNfParentSection(""); setNfIsNewParent(false); setNfNewParentName("");
        setNfIsNewCategory(false); setNfNewCategoryName("");
        setNfIsNewClassification(false);
        loadDrafts();
        onReload();
      } else {
        const err = await res.json();
        onStatus(`❌ ${err.error || "שגיאה ביצירת קרן"}`);
      }
    } catch {
      onStatus("❌ שגיאה בחיבור לשרת");
    }
  };

  const fieldLabel = (key: string): string => {
    const labels: Record<string, string> = {
      monthlyReturn: "תשואה חודשית",
      manager: "מנהל",
      classification: "סיווג",
      sharpe: "שארפ",
      stdDev: "סטיית תקן",
      "returns.ytd2026": "מצטבר 2026",
      "returns.y2025": "תשואה 2025",
      "returns.y2024": "תשואה 2024",
      "returns.y2023": "תשואה 2023",
      "returns.y2022": "תשואה 2022",
      "returns.y2021": "תשואה 2021",
      "returns.y2020": "תשואה 2020",
      "returns.y2019": "תשואה 2019",
    };
    return labels[key] || key;
  };

  const formatValue = (key: string, val: string | number | null): string => {
    if (val === null) return "—";
    if (typeof val === "number" && (key.startsWith("returns") || key === "monthlyReturn")) {
      return `${(val * 100).toFixed(2)}%`;
    }
    return String(val);
  };

  const confidenceBadge = (c: number) => {
    const color = c >= 0.9 ? "#059669" : c >= 0.7 ? "#f59e0b" : "#ef4444";
    const label = c >= 0.9 ? "גבוה" : c >= 0.7 ? "בינוני" : "נמוך";
    return (
      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, backgroundColor: `${color}15`, color, fontWeight: 600 }}>
        {label} ({Math.round(c * 100)}%)
      </span>
    );
  };

  // Batch apply safe drafts
  const handleBatchApply = async () => {
    setBatchRunning(true);
    setBatchResult(null);
    const batchId = `batch-${new Date().toISOString()}`;
    let applied = 0, skipped = 0, failed = 0;

    // Pre-filter eligible drafts (use match overrides when available)
    const eligible = drafts.filter((d) => {
      if (d.status !== "pending") return false;
      const hasFundId = draftMatchOverrides[d.id]?.fundId || d.match?.fundId;
      if (!hasFundId) return false;
      if (d.extracted.fields.length === 0) return false;
      // Skip drafts with monthly_uncertain — require manual review
      if (d.corrections?.some((c: string) => c.includes("monthly_uncertain"))) return false;
      const hasMonthly = d.extracted.fields.some((f) => f.key === "monthlyReturn");
      const effectiveMonth = draftReportMonths[d.id] ?? (d.reportMonth || "");
      if (hasMonthly && !effectiveMonth) return false;
      return true;
    });

    if (eligible.length === 0) {
      setBatchResult({ applied: 0, skipped: 0, failed: 0 });
      setBatchRunning(false);
      return;
    }

    for (const draft of eligible) {
      const draftReportMonth = draftReportMonths[draft.id] ?? (draft.reportMonth || "");
      const mo = draftMatchOverrides[draft.id];
      const bFundId = mo?.fundId || draft.match!.fundId;
      const bCatId = mo?.categoryId || draft.match!.categoryId;
      const bFieldEdits = editedFields[draft.id] || {};
      const bFields = draft.extracted.fields.map((f) => bFieldEdits[f.key] !== undefined ? { ...f, value: bFieldEdits[f.key] } : f);
      try {
        const checkRes = await fetch(`/api/parse?action=check-collision&client=${encodeURIComponent(clientKey)}`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            fundId: bFundId,
            categoryId: bCatId,
            reportMonth: draftReportMonth || null,
            approvedFields: bFields,
            draftId: draft.id,
          }),
        });
        if (!checkRes.ok) { failed++; continue; }
        const result = await checkRes.json();

        if (!result.autoApplyEligible) { skipped++; continue; }

        const applyRes = await fetch(`/api/parse?action=apply&client=${encodeURIComponent(clientKey)}`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            draftId: draft.id,
            fundId: bFundId,
            categoryId: bCatId,
            approvedFields: bFields,
            reportMonth: draftReportMonth || null,
            returnBasis: draft.returnBasis || null,
            fieldDecisions: {},
            diffComputedAt: result.diffComputedAt,
            clearFields: [],
            autoApply: true,
            batchId,
          }),
        });

        if (applyRes.ok) {
          applied++;
        } else if (applyRes.status === 409) {
          skipped++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    setBatchResult({ applied, skipped, failed });
    setBatchRunning(false);
    if (applied > 0) {
      setLastApplyInfo({ fundName: `${applied} טיוטות (אצווה)`, timestamp: Date.now() });
    }
    loadDrafts();
    onReload();
  };

  const pendingDrafts = drafts.filter((d) => d.status === "pending");

  // Watch reportMonth — re-run validation whenever it changes
  useEffect(() => {
    if (!reportMonth || !reportMonth.match(/^\d{4}-(0[1-9]|1[0-2])$/)) return;
    setParseResult(prev => {
      if (!prev || !prev.validation) return prev;
      const entries = (prev.dualCurrencyData && prev.dualCurrencyData.length > 0)
        ? prev.dualCurrencyData
        : [{ fields: prev.fields }];
      const newValidation = recomputeValidation(entries, reportMonth);
      const newStatus = newValidation.some(v => v.overallStatus === 'error') ? 'error'
        : newValidation.some(v => v.overallStatus === 'warning') ? 'warning' : 'valid';
      return { ...prev, validation: newValidation, validationStatus: newStatus };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportMonth]);

  // Re-run validation client-side when reportMonth changes (mirrors server validateParsedEntry logic)
  const recomputeValidation = (
    entries: { returnBasis?: string; fields: { key: string; value: string | number | null; confidence: number }[] }[],
    rm: string
  ) => {
    return entries.map(entry => {
      const suspiciousMonths: string[] = [];
      const byYear: Record<string, (number | null)[]> = {};
      const annualByYear: Record<string, number> = {};
      for (const field of entry.fields) {
        const mm = field.key.match(/^monthlyReturns\.(\d{4})-(0[1-9]|1[0-2])$/);
        if (mm) {
          const monthKey = `${mm[1]}-${mm[2]}`;
          if (monthKey > rm) { suspiciousMonths.push(monthKey); continue; }
          const yr = mm[1]; const mo = parseInt(mm[2]) - 1;
          if (!byYear[yr]) byYear[yr] = Array(12).fill(null);
          byYear[yr][mo] = field.value as number;
        }
        const am = field.key.match(/^returns\.(ytd|y)(\d{4})$/);
        if (am) annualByYear[am[2]] = field.value as number;
      }
      const rows = Object.keys(byYear).sort().map(yr => {
        const months = byYear[yr];
        const reportedAnnual = annualByYear[yr] ?? null;
        const nonNull = months.filter((m): m is number => m !== null);
        let computedAnnual: number | null = null;
        if (nonNull.length > 0) computedAnnual = Math.round((nonNull.reduce((a, m) => a * (1 + m), 1) - 1) * 1e6) / 1e6;
        let gap: number | null = null;
        let status: 'valid' | 'warning' | 'error' | 'no-annual' = 'no-annual';
        if (reportedAnnual !== null && computedAnnual !== null) {
          gap = Math.abs(computedAnnual - reportedAnnual);
          status = gap < 0.005 ? 'valid' : gap < 0.02 ? 'warning' : 'error';
        }
        return { year: yr, reportedAnnual, computedAnnual, gap, months, status };
      });
      const overallStatus: 'valid' | 'warning' | 'error' = rows.some(r => r.status === 'error') ? 'error'
        : rows.some(r => r.status === 'warning') ? 'warning' : 'valid';
      return { overallStatus, rows, ...(suspiciousMonths.length > 0 ? { suspiciousMonths } : {}) };
    });
  };

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Sub-navigation */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button onClick={() => setView("input")}
          style={{ padding: "6px 16px", fontSize: 12, fontWeight: view === "input" ? 600 : 400, backgroundColor: view === "input" ? "var(--accent)" : "var(--bg-surface)", color: view === "input" ? "#fff" : "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}>
          קליטה חדשה
        </button>
        <button onClick={() => { setView("drafts"); loadDrafts(); }}
          style={{ padding: "6px 16px", fontSize: 12, fontWeight: view === "drafts" ? 600 : 400, backgroundColor: view === "drafts" ? "var(--accent)" : "var(--bg-surface)", color: view === "drafts" ? "#fff" : "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}>
          טיוטות ({pendingDrafts.length})
        </button>
      </div>

      {/* Batch apply button */}
      {view === "drafts" && pendingDrafts.length > 0 && !diffResult && !newFundDraftId && (
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => { setBatchResult(null); handleBatchApply(); }}
            disabled={batchRunning}
            style={{
              backgroundColor: batchRunning ? "var(--text-muted)" : "var(--bg-surface)",
              color: batchRunning ? "#fff" : "#059669",
              border: "1px solid #05966940",
              borderRadius: 6,
              padding: "6px 16px",
              fontSize: 11,
              fontWeight: 600,
              cursor: batchRunning ? "not-allowed" : "pointer",
              opacity: batchRunning ? 0.6 : 1,
            }}>
            {batchRunning ? "מעבד..." : "החל טיוטות בטוחות"}
          </button>
        </div>
      )}

      {/* Credit exhausted banner */}
      {creditBanner && (
        <div style={{
          backgroundColor: "#ef444415",
          border: "1px solid #ef444450",
          borderRadius: 8,
          padding: "10px 14px",
          marginBottom: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ fontSize: 13, color: "#ef4444", fontWeight: 600, lineHeight: 1.5 }}>
            ⚠️ חשבון Anthropic מחייב טעינת קרדיט. פנה למנהל המערכת או טען ב-console.anthropic.com
          </span>
          <button
            onClick={() => setCreditBanner(false)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#ef4444", marginRight: 8, lineHeight: 1 }}
            aria-label="סגור"
          >
            ×
          </button>
        </div>
      )}

      {/* Batch result banner */}
      {batchResult && (
        <div style={{
          backgroundColor: batchResult.applied > 0 ? "#05966910" : "#f59e0b10",
          border: `1px solid ${batchResult.applied > 0 ? "#05966930" : "#f59e0b30"}`,
          borderRadius: 8,
          padding: "8px 14px",
          marginBottom: 12,
          fontSize: 12,
        }}>
          {batchResult.applied > 0 ? (
            <span style={{ color: "#059669", fontWeight: 600 }}>
              {"✓ עודכנו " + batchResult.applied + " טיוטות אוטומטית"}
            </span>
          ) : batchResult.skipped > 0 ? (
            <span style={{ color: "#f59e0b", fontWeight: 600 }}>
              {"ℹ️ כל הטיוטות דורשות סקירה ידנית"}
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>
              {"ℹ️ אין טיוטות בטוחות להחלה"}
            </span>
          )}
          {batchResult.applied > 0 && batchResult.skipped > 0 && (
            <span style={{ color: "#f59e0b", marginRight: 8 }}>
              {" · " + batchResult.skipped + " דורשות סקירה ידנית"}
            </span>
          )}
          {batchResult.failed > 0 && (
            <span style={{ color: "#ef4444", marginRight: 8 }}>
              {" · " + batchResult.failed + " נכשלו"}
            </span>
          )}
          {batchResult.applied > 1 && (
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
              ביטול אפשרי רק לטיוטה האחרונה שעודכנה
            </div>
          )}
          <button onClick={() => setBatchResult(null)}
            style={{ float: "left", background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "var(--text-muted)", textDecoration: "underline" }}>
            סגור
          </button>
        </div>
      )}

      {/* Undo banner */}
      {lastApplyInfo && (Date.now() - lastApplyInfo.timestamp) < 30 * 60 * 1000 && (
        <div style={{
          backgroundColor: "#3b82f610",
          border: "1px solid #3b82f640",
          borderRadius: 8,
          padding: "8px 14px",
          marginBottom: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ fontSize: 12, color: "#3b82f6" }}>
            עדכון אחרון: &quot;{lastApplyInfo.fundName}&quot;
          </span>
          <button onClick={handleUndo}
            style={{ backgroundColor: "#3b82f6", color: "#fff", border: "none", borderRadius: 5, padding: "4px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
            ↩ ביטול עדכון
          </button>
        </div>
      )}

      {/* Token Usage Widget */}
      {tokenUsage && (
        <div style={{
          backgroundColor: "var(--bg-surface)",
          border: `1px solid ${tokenUsage.blocked ? "#ef444440" : tokenUsage.warning ? "#f59e0b40" : "var(--border)"}`,
          borderRadius: 10,
          padding: "12px 16px",
          marginBottom: 16,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>
              📊 שימוש חודשי בטוקנים
            </span>
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: tokenUsage.blocked ? "#ef4444" : tokenUsage.warning ? "#f59e0b" : "#059669",
            }}>
              {tokenUsage.blocked ? "🚫 חריגת מכסה" : tokenUsage.warning ? "⚠️ מתקרב למכסה" : "✓ תקין"}
            </span>
          </div>
          {/* Progress bar */}
          <div style={{
            width: "100%",
            height: 6,
            backgroundColor: "var(--border)",
            borderRadius: 3,
            overflow: "hidden",
            marginBottom: 6,
          }}>
            <div style={{
              width: `${Math.min(tokenUsage.percent, 100)}%`,
              height: "100%",
              backgroundColor: tokenUsage.blocked ? "#ef4444" : tokenUsage.warning ? "#f59e0b" : "#059669",
              borderRadius: 3,
              transition: "width 0.3s",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)" }}>
            <span>{(tokenUsage.inputTokens / 1000).toFixed(1)}K / {(tokenUsage.limit / 1000).toFixed(0)}K טוקנים ({tokenUsage.percent}%)</span>
            <span>{tokenUsage.callCount} / {tokenUsage.callLimit} קריאות</span>
          </div>
          {tokenUsage.blocked && (
            <p style={{ fontSize: 10, color: "#ef4444", margin: "6px 0 0", fontWeight: 500 }}>
              הגעת למכסת הטוקנים החודשית. פנה למנהל להגדלת המכסה.
            </p>
          )}
        </div>
      )}

      {/* INPUT VIEW */}
      {view === "input" && (
        <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}>
            הדבק טקסט מדיווח קרן
          </h3>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 14px" }}>
            העתק טקסט ממייל, פאקט שיט, או כל מקור אחר. ה-AI יחלץ את הנתונים אוטומטית.
          </p>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={"לדוגמה:\nקרן אלפא גלובל\nתשואה חודשית: 1.2%\nתשואה 2024: 11.5%\nתשואה 2023: 8.7%\nמנהל: ישראל ישראלי"}
            style={{
              width: "100%",
              minHeight: 200,
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 14,
              fontSize: 13,
              fontFamily: "inherit",
              backgroundColor: "var(--bg-input)",
              color: "var(--text-primary)",
              resize: "vertical",
              direction: "rtl",
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {inputText.length} / 10,000 תווים
            </span>
            <button
              onClick={handleParse}
              disabled={parsing || inputText.trim().length < 10}
              style={{
                backgroundColor: parsing || inputText.trim().length < 10 ? "var(--text-muted)" : "var(--accent)",
                color: "#fff",
                fontWeight: 700,
                padding: "8px 24px",
                borderRadius: 6,
                border: "none",
                cursor: parsing ? "wait" : "pointer",
                fontSize: 13,
                opacity: parsing || inputText.trim().length < 10 ? 0.4 : 1,
              }}
            >
              {parsing ? "מפענח..." : "🤖 פענח טקסט"}
            </button>
          </div>

          {/* Desktop File Upload */}
          {brand.features?.desktopUpload && (
            <div style={{
              marginTop: 16,
              padding: 16,
              border: "2px dashed var(--border)",
              borderRadius: 8,
              textAlign: "center",
              backgroundColor: "var(--bg-surface-alt)",
            }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>
                📎 או העלה קובץ
              </p>
              <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 10px" }}>
                PDF · PNG · JPG — עד 10MB
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={parsing}
                style={{
                  backgroundColor: parsing ? "var(--text-muted)" : "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "8px 20px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: parsing ? "wait" : "pointer",
                  opacity: parsing ? 0.4 : 1,
                }}
              >
                {parsing ? "מפענח..." : "🖥️ בחר קובץ מהמחשב"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                style={{ display: "none" }}
                onChange={(e) => {
                  handleFileUpload(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* REVIEW VIEW */}
      {view === "review" && parseResult && (
        <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>
            תוצאות פענוח
          </h3>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 16px" }}>
            בדוק את הנתונים, סמן את השדות לאישור, ובחר קרן מתאימה.
          </p>

          {/* Extracted fund name */}
          <div style={{ padding: "10px 14px", backgroundColor: "var(--bg-input)", borderRadius: 8, marginBottom: 14, border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>שם קרן: {parseResult.fundName || "לא זוהה"}</span>
              {confidenceBadge(parseResult.fundNameConfidence)}
            </div>
          </div>

          {/* Match selection — searchable */}
          <div style={{ padding: "10px 14px", backgroundColor: "var(--bg-input)", borderRadius: 8, marginBottom: 14, border: "1px solid var(--border)" }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
              התאמה לקרן קיימת:
            </label>
            {parseResult.match?.fundName && (
              <p style={{ fontSize: 11, color: "#059669", margin: "0 0 6px" }}>
                💡 הצעת AI: &quot;{parseResult.match.fundName}&quot; (דמיון: {Math.round((parseResult.match.similarity || 0) * 100)}%)
              </p>
            )}

            {/* Selected fund display */}
            {selectedMatchFundId && (() => {
              const sel = allFunds.find((f) => f.id === selectedMatchFundId);
              return sel ? (
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 10px", backgroundColor: "#05966910", border: "1px solid #05966930",
                  borderRadius: 6, marginBottom: 8, fontSize: 12,
                }}>
                  <span style={{ fontWeight: 600, color: "#059669" }}>✓ {sel.name} ({sel.catName})</span>
                  <button onClick={() => { setSelectedMatchFundId(""); setSelectedMatchCatId(""); setFundSearch(""); }}
                    style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14, padding: 0 }}>✕</button>
                </div>
              ) : null;
            })()}

            {/* Search input */}
            <div ref={fundSearchRef} style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="🔍 חפש קרן לפי שם..."
                value={fundSearch}
                onChange={(e) => { setFundSearch(e.target.value); setFundDropdownOpen(true); }}
                onFocus={() => setFundDropdownOpen(true)}
                style={{
                  width: "100%",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "6px 10px",
                  fontSize: 12,
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-primary)",
                  direction: "rtl",
                }}
              />

              {/* Dropdown results */}
              {fundDropdownOpen && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  left: 0, right: 0,
                  maxHeight: 200,
                  overflowY: "auto",
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "0 0 6px 6px",
                  zIndex: 10,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}>
                  {filteredFunds.length === 0 ? (
                    <div style={{ padding: 12, textAlign: "center" }}>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 8px" }}>
                        הקרן לא ברשימה. האם ברצונך להקים קרן חדשה?
                      </p>
                      <button
                        onClick={() => {
                          setFundDropdownOpen(false);
                          setView("input");
                          onStatus("💡 השתמש בלחצן \"קרן חדשה\" בטיוטות ליצירת קרן");
                        }}
                        style={{
                          backgroundColor: "#3b82f6",
                          color: "#fff",
                          border: "none",
                          borderRadius: 5,
                          padding: "5px 14px",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}>
                        🆕 כן, הקם קרן חדשה
                      </button>
                    </div>
                  ) : (
                    filteredFunds.map((f) => (
                      <div
                        key={f.id}
                        onClick={() => {
                          setSelectedMatchFundId(f.id);
                          setSelectedMatchCatId(f.catId);
                          setFundSearch("");
                          setFundDropdownOpen(false);
                        }}
                        style={{
                          padding: "7px 12px",
                          fontSize: 12,
                          cursor: "pointer",
                          borderBottom: "1px solid var(--border)",
                          backgroundColor: selectedMatchFundId === f.id ? "#05966910" : "transparent",
                          direction: "rtl",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-surface-alt)")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = selectedMatchFundId === f.id ? "#05966910" : "transparent")}
                      >
                        <span style={{ fontWeight: 500 }}>{f.name}</span>
                        <span style={{ fontSize: 10, color: "var(--text-muted)", marginRight: 6 }}>({f.catName})</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Report Month selector */}
          <div style={{
            padding: "10px 14px",
            backgroundColor: !reportMonth ? "#fef3c715" : "var(--bg-input)",
            borderRadius: 8,
            marginBottom: 14,
            border: `1px solid ${!reportMonth ? "#f59e0b60" : "var(--border)"}`,
          }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
              חודש דיווח:
              {parseResult?.reportMonthConfidence === "low" && (
                <span style={{ fontSize: 10, color: "#f59e0b", marginRight: 8, fontWeight: 400 }}>
                  ⚠️ לא זוהה אוטומטית — יש לבחור ידנית
                </span>
              )}
            </label>
            <input
              ref={reportMonthInputRef}
              type="month"
              value={reportMonth}
              onChange={(e) => setReportMonth(e.target.value)}
              style={{
                border: `1px solid ${!reportMonth ? "#f59e0b" : "var(--border)"}`,
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 12,
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-primary)",
                width: "100%",
                maxWidth: 200,
              }}
            />
            {!reportMonth && (
              <p style={{ fontSize: 10, color: "#ef4444", margin: "4px 0 0", fontWeight: 500 }}>
                * חובה — לא ניתן לשמור תשואה חודשית ללא חודש דיווח
              </p>
            )}
          </div>

          {/* Currency selector (single currency) */}
          {(!parseResult.dualCurrencyData || parseResult.dualCurrencyData.length < 2) && (
            <div style={{ padding: "10px 14px", backgroundColor: "var(--bg-input)", borderRadius: 8, marginBottom: 14, border: "1px solid var(--border)" }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>מטבע קרן:</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setReturnBasis("ILS")}
                  style={{ padding: "6px 16px", borderRadius: 6, border: `1px solid ${returnBasis === "ILS" ? "#059669" : "var(--border)"}`, backgroundColor: returnBasis === "ILS" ? "#05966915" : "var(--bg-surface)", color: returnBasis === "ILS" ? "#059669" : "var(--text-secondary)", fontWeight: returnBasis === "ILS" ? 700 : 400, fontSize: 12, cursor: "pointer" }}>
                  ₪ שקלי (ILS)
                </button>
                <button onClick={() => setReturnBasis("USD")}
                  style={{ padding: "6px 16px", borderRadius: 6, border: `1px solid ${returnBasis === "USD" ? "#3b82f6" : "var(--border)"}`, backgroundColor: returnBasis === "USD" ? "#3b82f615" : "var(--bg-surface)", color: returnBasis === "USD" ? "#3b82f6" : "var(--text-secondary)", fontWeight: returnBasis === "USD" ? 700 : 400, fontSize: 12, cursor: "pointer" }}>
                  $ דולרי (USD)
                </button>
              </div>
            </div>
          )}

          {/* Dual currency banner */}
          {parseResult.dualCurrencyData?.length === 2 && (
            <div style={{ padding: "12px 16px", backgroundColor: "#fef3c715", borderRadius: 8, marginBottom: 14, border: "1px solid #f59e0b40" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>⚠️ דיווח כפול — שקלי + דולרי</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {dualSaved.size === 2 && <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>✓ שתי הטיוטות נשמרו</span>}
                  <button
                    onClick={() => {
                      if (!parseResult.dualCurrencyData || parseResult.dualCurrencyData.length < 2) return;
                      // Swap the returnBasis labels between the two entries
                      const swapped = parseResult.dualCurrencyData.map((entry) => ({
                        ...entry,
                        returnBasis: entry.returnBasis === "USD" ? "ILS" as const : "USD" as const,
                      }));
                      setParseResult({ ...parseResult, dualCurrencyData: swapped });
                    }}
                    style={{
                      padding: "3px 10px", fontSize: 10, borderRadius: 5, cursor: "pointer",
                      border: "1px solid #f59e0b60", backgroundColor: "#f59e0b15",
                      color: "#f59e0b", fontWeight: 600,
                    }}
                  >
                    🔄 החלף מטבעות
                  </button>
                </div>
              </div>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>
                יש לשמור טיוטה נפרדת לכל מטבע. בחר שדות ושמור — המערכת תעבור אוטומטית למטבע השני.
                {" "}אם העמודות הפוכות, לחץ ״החלף מטבעות״.
              </p>
            </div>
          )}

          {/* Validation table — Pass-3 */}
          {parseResult.validation && parseResult.validation.length > 0 && (() => {
            // Keep currency info per-row: validation[i] maps to dualCurrencyData[i]
            const allRows = parseResult.validation!.flatMap((v, vi) => {
              const currency = parseResult.dualCurrencyData?.[vi]?.returnBasis ?? null;
              return v.rows.map(row => ({ row, currency }));
            });
            // Collect all suspicious months across all validations (deduplicated)
            const allSuspicious = [...new Set(
              parseResult.validation!.flatMap(v => v.suspiciousMonths ?? [])
            )].sort();
            const statusIcon = (s: string) => s === 'valid' ? '✅' : s === 'warning' ? '⚠️' : s === 'error' ? '❌' : '—';
            const fmtPct = (v: number | null) => v === null ? '—' : `${(v * 100).toFixed(2)}%`;
            const monthNames = ['ינו׳','פבר׳','מרץ','אפר׳','מאי','יונ׳','יול׳','אוג׳','ספט׳','אוק׳','נוב׳','דצמ׳'];
            const overallStatus = parseResult.validationStatus;

            return (
              <div style={{ marginBottom: 16 }}>
                {/* Status header */}
                <div style={{ padding: "8px 12px", borderRadius: 8, marginBottom: allSuspicious.length > 0 ? 6 : 10, backgroundColor: overallStatus === 'error' ? '#FEE2E215' : overallStatus === 'warning' ? '#FEF3C715' : '#DCFCE715', border: `1px solid ${overallStatus === 'error' ? '#ef444440' : overallStatus === 'warning' ? '#f59e0b40' : '#16a34a40'}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{statusIcon(overallStatus || 'valid')}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: overallStatus === 'error' ? '#ef4444' : overallStatus === 'warning' ? '#f59e0b' : '#16a34a' }}>
                    {overallStatus === 'error' ? 'שגיאת ולידציה — הנתונים אינם עקביים' : overallStatus === 'warning' ? 'אזהרת ולידציה — בדוק לפני שמירה' : 'ולידציה עברה — הנתונים עקביים'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 'auto' }}>פאס-3: מחושב vs מדווח</span>
                </div>
                {/* Suspicious months warning */}
                {allSuspicious.length > 0 && (
                  <div style={{ padding: "6px 12px", borderRadius: 6, marginBottom: 10, backgroundColor: '#f59e0b10', border: '1px solid #f59e0b40', fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>⚠️</span>
                    <span>נמצאו {allSuspicious.length} חודשים מאוחרים מחודש הדיווח — לא נספרו: {allSuspicious.map(m => { const [y,mo] = m.split('-'); return `${mo}/${y}`; }).join(', ')}</span>
                  </div>
                )}

                {/* Year-by-year table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 8 }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-surface-alt)' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'right' }}>שנה</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center' }}>חודשים</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center' }}>שנתי מדווח</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center' }}>שנתי מחושב</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center' }}>פער</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center' }}>סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allRows.map(({ row, currency }, idx) => {
                      const nonNull = row.months.filter(m => m !== null).length;
                      const isExpanded = expandedYear === row.year;
                      // Currency tint: USD = subtle blue, ILS = subtle green
                      const currencyBg = currency === 'USD' ? '#3b82f610' : currency === 'ILS' ? '#22c55e10' : null;
                      const rowBg = row.status === 'error' ? '#FEE2E210' : currencyBg ?? (idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-surface-alt)');
                      return (
                        <>
                          <tr key={`${row.year}-${currency ?? idx}`} style={{ borderBottom: '1px solid var(--border-table)', backgroundColor: rowBg, cursor: 'pointer' }}
                            onClick={() => setExpandedYear(isExpanded ? null : row.year)}>
                            <td style={{ padding: '6px 10px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {row.year} {isExpanded ? '▲' : '▼'}
                              {currency && (
                                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700, backgroundColor: currency === 'USD' ? '#3b82f620' : '#22c55e20', color: currency === 'USD' ? '#3b82f6' : '#16a34a', border: `1px solid ${currency === 'USD' ? '#3b82f640' : '#22c55e40'}` }}>
                                  {currency}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'center', color: nonNull < 12 ? '#f59e0b' : 'inherit' }}>{nonNull}/12</td>
                            <td style={{ padding: '6px 10px', textAlign: 'center', direction: 'ltr' }}>{fmtPct(row.reportedAnnual)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'center', direction: 'ltr' }}>{fmtPct(row.computedAnnual)}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'center', direction: 'ltr', color: row.status === 'error' ? '#ef4444' : row.status === 'warning' ? '#f59e0b' : 'inherit', fontWeight: row.status !== 'valid' && row.status !== 'no-annual' ? 700 : 400 }}>
                              {row.gap !== null ? fmtPct(row.gap) : '—'}
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'center' }}>{statusIcon(row.status)}</td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${row.year}-detail`} style={{ backgroundColor: 'var(--bg-input)' }}>
                              <td colSpan={6} style={{ padding: '8px 14px' }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, direction: 'ltr' }}>
                                  {row.months.map((val, mIdx) => (
                                    <div key={mIdx} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, backgroundColor: val === null ? 'var(--bg-surface-alt)' : 'var(--bg-surface)', border: '1px solid var(--border)', color: val === null ? 'var(--text-muted)' : val < 0 ? '#ef4444' : '#16a34a', minWidth: 60, textAlign: 'center' }}>
                                      <div style={{ fontWeight: 600, fontSize: 10, color: 'var(--text-muted)' }}>{monthNames[mIdx]}</div>
                                      <div>{val !== null ? `${(val * 100).toFixed(2)}%` : '—'}</div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* Fields table — dual or single (shown only when NO validation OR as detail) */}
          {(!parseResult.validation || parseResult.validation.length === 0) && (() => {
            const isDual = parseResult.dualCurrencyData?.length === 2;
            const usdEntry = isDual ? parseResult.dualCurrencyData!.find((e) => e.returnBasis === "USD") : null;
            const ilsEntry = isDual ? parseResult.dualCurrencyData!.find((e) => e.returnBasis === "ILS") : null;

            // Merge field keys from both currencies for dual view
            const allFieldKeys = isDual
              ? Array.from(new Set([
                  ...(usdEntry?.fields.map((f) => f.key) || []),
                  ...(ilsEntry?.fields.map((f) => f.key) || []),
                ]))
              : parseResult.fields.map((f) => f.key);

            return (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
              <thead>
                <tr style={{ backgroundColor: "var(--bg-surface-alt)" }}>
                  <th style={{ padding: "7px 10px", textAlign: "center", width: 40 }}>✓</th>
                  <th style={{ padding: "7px 10px", textAlign: "right" }}>שדה</th>
                  {isDual ? (
                    <>
                      <th style={{ padding: "7px 10px", textAlign: "center", color: "#3b82f6" }}>$ דולרי</th>
                      <th style={{ padding: "7px 10px", textAlign: "center", color: "#059669" }}>₪ שקלי</th>
                    </>
                  ) : (
                    <th style={{ padding: "7px 10px", textAlign: "center" }}>ערך</th>
                  )}
                  <th style={{ padding: "7px 10px", textAlign: "center" }}>ביטחון</th>
                </tr>
              </thead>
              <tbody>
                {isDual ? (
                  allFieldKeys.map((key, idx) => {
                    const usdField = usdEntry?.fields.find((f) => f.key === key);
                    const ilsField = ilsEntry?.fields.find((f) => f.key === key);
                    const bestConfidence = Math.max(usdField?.confidence || 0, ilsField?.confidence || 0);
                    return (
                      <tr key={idx} style={{ borderBottom: "1px solid var(--border-table)", backgroundColor: idx % 2 === 0 ? "var(--bg-surface)" : "var(--bg-surface-alt)" }}>
                        <td style={{ padding: "6px 10px", textAlign: "center" }}>
                          <input type="checkbox" checked={approvedFields.has(key)}
                            onChange={(e) => { const next = new Set(approvedFields); if (e.target.checked) next.add(key); else next.delete(key); setApprovedFields(next); }} />
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 500 }}>{fieldLabel(key)}</td>
                        <td style={{ padding: "6px 10px", textAlign: "center", direction: "ltr", color: "#3b82f6", fontWeight: 500 }}>
                          {usdField ? formatValue(key, usdField.value) : "—"}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "center", direction: "ltr", color: "#059669", fontWeight: 500 }}>
                          {ilsField ? formatValue(key, ilsField.value) : "—"}
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "center" }}>{confidenceBadge(bestConfidence)}</td>
                      </tr>
                    );
                  })
                ) : (
                  parseResult.fields.map((field, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid var(--border-table)", backgroundColor: idx % 2 === 0 ? "var(--bg-surface)" : "var(--bg-surface-alt)" }}>
                      <td style={{ padding: "6px 10px", textAlign: "center" }}>
                        <input type="checkbox" checked={approvedFields.has(field.key)}
                          onChange={(e) => { const next = new Set(approvedFields); if (e.target.checked) next.add(field.key); else next.delete(field.key); setApprovedFields(next); }} />
                      </td>
                      <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 500 }}>{fieldLabel(field.key)}</td>
                      <td style={{ padding: "6px 10px", textAlign: "center", direction: "ltr" }}>{formatValue(field.key, field.value)}</td>
                      <td style={{ padding: "6px 10px", textAlign: "center" }}>{confidenceBadge(field.confidence)}</td>
                    </tr>
                  ))
                )}
                {allFieldKeys.length === 0 && (
                  <tr><td colSpan={isDual ? 5 : 4} style={{ padding: 20, textAlign: "center", color: "var(--text-muted)" }}>לא נמצאו שדות</td></tr>
                )}
              </tbody>
            </table>
            );
          })()}

          {/* Actions — dual currency: separate save buttons */}
          {parseResult.dualCurrencyData?.length === 2 ? (
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-start", flexWrap: "wrap" }}>
              <button onClick={() => handleSaveDraft("USD")}
                disabled={approvedFields.size === 0 || dualSaved.has("USD")}
                style={{
                  backgroundColor: dualSaved.has("USD") ? "var(--text-muted)" : "#3b82f6",
                  color: "#fff", fontWeight: 700, padding: "8px 20px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12,
                  opacity: approvedFields.size === 0 || dualSaved.has("USD") ? 0.4 : 1,
                }}>
                {dualSaved.has("USD") ? "✓ דולרי נשמר" : "💾 שמור דולרי ($)"}
              </button>
              <button onClick={() => handleSaveDraft("ILS")}
                disabled={approvedFields.size === 0 || dualSaved.has("ILS")}
                style={{
                  backgroundColor: dualSaved.has("ILS") ? "var(--text-muted)" : "#059669",
                  color: "#fff", fontWeight: 700, padding: "8px 20px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12,
                  opacity: approvedFields.size === 0 || dualSaved.has("ILS") ? 0.4 : 1,
                }}>
                {dualSaved.has("ILS") ? "✓ שקלי נשמר" : "💾 שמור שקלי (₪)"}
              </button>
              <button onClick={() => { setView("input"); setParseResult(null); }}
                style={{ backgroundColor: "var(--bg-surface-alt)", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 20px", cursor: "pointer", fontSize: 12 }}>
                ← חזרה
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-start", flexDirection: "column", alignItems: "flex-start" }}>
              {parseResult.validationStatus === 'error' && (
                <div style={{ fontSize: 11, color: "#ef4444", padding: "6px 10px", backgroundColor: "#FEE2E215", borderRadius: 6, border: "1px solid #ef444440" }}>
                  ❌ לא ניתן לשמור — נמצאו שגיאות ולידציה. הנתונים אינם עקביים (מחושב ≠ מדווח).
                </div>
              )}
              {parseResult.validationStatus === 'warning' && (
                <div style={{ fontSize: 11, color: "#f59e0b", padding: "6px 10px", backgroundColor: "#FEF3C715", borderRadius: 6, border: "1px solid #f59e0b40" }}>
                  ⚠️ אזהרה: פערים קטנים זוהו. ניתן לשמור, אך מומלץ לבדוק.
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => handleSaveDraft()}
                  disabled={approvedFields.size === 0 || parseResult.validationStatus === 'error'}
                  style={{
                    backgroundColor: approvedFields.size === 0 || parseResult.validationStatus === 'error' ? "var(--text-muted)" : "#059669",
                    color: "#fff", fontWeight: 700, padding: "8px 20px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12,
                    opacity: approvedFields.size === 0 || parseResult.validationStatus === 'error' ? 0.4 : 1,
                  }}>
                  {parseResult.validationStatus === 'warning' ? '⚠️ אשר ושמור בכל זאת' : '💾 שמור טיוטה'} ({approvedFields.size} שדות)
                </button>
                <button onClick={() => { setView("input"); setParseResult(null); }}
                  style={{ backgroundColor: "var(--bg-surface-alt)", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 20px", cursor: "pointer", fontSize: 12 }}>
                  ← חזרה
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DRAFTS VIEW */}
      {view === "drafts" && (
        <div>
          {/* Filter: pending vs archive */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => setShowArchive(false)}
              style={{ padding: "5px 14px", fontSize: 11, fontWeight: !showArchive ? 700 : 400, borderRadius: 6, border: `1px solid ${!showArchive ? "var(--accent)" : "var(--border)"}`, backgroundColor: !showArchive ? "var(--accent)" : "var(--bg-surface)", color: !showArchive ? "#fff" : "var(--text-secondary)", cursor: "pointer" }}>
              ⏳ ממתינות ({drafts.filter((d) => d.status === "pending").length})
            </button>
            <button onClick={() => setShowArchive(true)}
              style={{ padding: "5px 14px", fontSize: 11, fontWeight: showArchive ? 700 : 400, borderRadius: 6, border: `1px solid ${showArchive ? "var(--accent)" : "var(--border)"}`, backgroundColor: showArchive ? "var(--accent)" : "var(--bg-surface)", color: showArchive ? "#fff" : "var(--text-secondary)", cursor: "pointer" }}>
              ארכיון ({drafts.filter((d) => d.status !== "pending").length})
            </button>
          </div>

          {/* Archive sub-filters */}
          {showArchive && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              {(["all", "applied", "rejected"] as const).map((f) => {
                const labels = { all: "הכל", applied: "✓ הוחל", rejected: "✗ נדחה" };
                const count = f === "all"
                  ? drafts.filter((d) => d.status !== "pending").length
                  : drafts.filter((d) => d.status === f).length;
                return (
                  <button key={f} onClick={() => setArchiveFilter(f)}
                    style={{
                      padding: "4px 12px", fontSize: 10, borderRadius: 5, cursor: "pointer",
                      border: `1px solid ${archiveFilter === f ? "var(--accent)" : "var(--border)"}`,
                      backgroundColor: archiveFilter === f ? "var(--accent)" : "var(--bg-surface)",
                      color: archiveFilter === f ? "#fff" : "var(--text-secondary)",
                      fontWeight: archiveFilter === f ? 700 : 400,
                    }}>
                    {labels[f]} ({count})
                  </button>
                );
              })}
              <span style={{ width: 1, height: 20, backgroundColor: "var(--border)", margin: "0 4px" }} />
              <input type="month" value={archiveMonthFilter} onChange={(e) => setArchiveMonthFilter(e.target.value)}
                style={{ padding: "4px 8px", borderRadius: 5, border: "1px solid var(--border)", fontSize: 10, backgroundColor: "var(--bg-surface)", color: "var(--text-primary)", maxWidth: 140 }}
                placeholder="סנן לפי חודש" />
              {archiveMonthFilter && (
                <button onClick={() => setArchiveMonthFilter("")}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "var(--text-secondary)", textDecoration: "underline" }}>
                  נקה
                </button>
              )}
            </div>
          )}

          {(() => {
            let filtered = drafts.filter((d) => showArchive ? d.status !== "pending" : d.status === "pending");
            if (showArchive && archiveFilter !== "all") {
              filtered = filtered.filter((d) => d.status === archiveFilter);
            }
            if (showArchive && archiveMonthFilter) {
              filtered = filtered.filter((d) => d.reportMonth === archiveMonthFilter);
            }
            return filtered.length === 0 ? (
            <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 40, textAlign: "center" }}>
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{showArchive ? "אין טיוטות בארכיון" : "אין טיוטות ממתינות"}</p>
            </div>
          ) : (
            filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((draft) => (
              <div key={draft.id} style={{
                backgroundColor: "var(--bg-surface)",
                border: `1px solid ${draft.status === "applied" ? "#05966930" : draft.status === "rejected" ? "#ef444430" : "var(--border)"}`,
                borderRadius: 10,
                padding: 16,
                marginBottom: 12,
                opacity: draft.status === "rejected" ? 0.5 : 1,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{draft.extracted.fundName || "קרן לא מזוהה"}</span>
                    {(draftMatchOverrides[draft.id] || draft.match?.fundName) && (
                      <span style={{ fontSize: 11, color: draftMatchOverrides[draft.id] ? "#3b82f6" : "var(--text-muted)" }}>
                        → {draftMatchOverrides[draft.id]?.fundName || draft.match!.fundName}
                        {draft.match?.similarity != null && !draftMatchOverrides[draft.id] && (
                          <span style={{ fontSize: 9, color: "var(--text-muted)", marginRight: 4 }}>
                            ({Math.round(draft.match.similarity * 100)}% התאמה)
                          </span>
                        )}
                      </span>
                    )}
                    {draft.status === "pending" && (
                      <div ref={matchEditDraftId === draft.id ? matchEditRef : undefined} style={{ position: "relative", display: "inline-block" }}>
                        <button
                          onClick={() => {
                            if (matchEditDraftId === draft.id) {
                              setMatchEditDraftId(null);
                              setMatchEditSearch("");
                            } else {
                              setMatchEditDraftId(draft.id);
                              setMatchEditSearch("");
                            }
                          }}
                          style={{
                            fontSize: 9, padding: "1px 8px", borderRadius: 4,
                            backgroundColor: draftMatchOverrides[draft.id] ? "#3b82f615" : "var(--bg-surface-alt)",
                            color: draftMatchOverrides[draft.id] ? "#3b82f6" : "var(--text-muted)",
                            border: `1px solid ${draftMatchOverrides[draft.id] ? "#3b82f630" : "var(--border)"}`,
                            cursor: "pointer", fontWeight: 600,
                          }}>
                          {draftMatchOverrides[draft.id] ? "✎ שונתה" : "שנה קרן"}
                        </button>
                        {matchEditDraftId === draft.id && (
                          <div style={{
                            position: "absolute", top: "100%", right: 0, zIndex: 100,
                            backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)",
                            borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                            width: 280, maxHeight: 300, overflow: "hidden",
                            marginTop: 4,
                          }}>
                            <input
                              type="text"
                              placeholder="חפש קרן..."
                              value={matchEditSearch}
                              onChange={(e) => setMatchEditSearch(e.target.value)}
                              autoFocus
                              style={{
                                width: "100%", border: "none", borderBottom: "1px solid var(--border)",
                                padding: "8px 10px", fontSize: 11, backgroundColor: "var(--bg-surface)",
                                color: "var(--text-primary)", outline: "none", direction: "rtl",
                              }}
                            />
                            <div style={{ maxHeight: 240, overflowY: "auto" }}>
                              {allFunds
                                .filter((f) =>
                                  !matchEditSearch.trim() ||
                                  f.name.toLowerCase().includes(matchEditSearch.toLowerCase()) ||
                                  f.catName.toLowerCase().includes(matchEditSearch.toLowerCase())
                                )
                                .slice(0, 50)
                                .map((f) => (
                                  <div
                                    key={f.id}
                                    onClick={() => {
                                      setDraftMatchOverrides((prev) => ({
                                        ...prev,
                                        [draft.id]: { fundId: f.id, categoryId: f.catId, fundName: f.name },
                                      }));
                                      setMatchEditDraftId(null);
                                      setMatchEditSearch("");
                                    }}
                                    style={{
                                      padding: "6px 10px", fontSize: 11, cursor: "pointer",
                                      borderBottom: "1px solid var(--border)",
                                      backgroundColor: (draftMatchOverrides[draft.id]?.fundId === f.id || (!draftMatchOverrides[draft.id] && draft.match?.fundId === f.id))
                                        ? "#3b82f610" : "transparent",
                                      direction: "rtl",
                                    }}
                                    onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = "#3b82f610"; }}
                                    onMouseLeave={(e) => {
                                      const isSelected = draftMatchOverrides[draft.id]?.fundId === f.id || (!draftMatchOverrides[draft.id] && draft.match?.fundId === f.id);
                                      (e.target as HTMLElement).style.backgroundColor = isSelected ? "#3b82f610" : "transparent";
                                    }}
                                  >
                                    <div style={{ fontWeight: 500 }}>{f.name}</div>
                                    <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{f.catName}</div>
                                  </div>
                                ))}
                            </div>
                            {draftMatchOverrides[draft.id] && (
                              <div
                                onClick={() => {
                                  setDraftMatchOverrides((prev) => {
                                    const next = { ...prev };
                                    delete next[draft.id];
                                    return next;
                                  });
                                  setMatchEditDraftId(null);
                                  setMatchEditSearch("");
                                }}
                                style={{
                                  padding: "6px 10px", fontSize: 10, cursor: "pointer",
                                  borderTop: "1px solid var(--border)", textAlign: "center",
                                  color: "#ef4444", fontWeight: 600,
                                }}>
                                ↩ חזור להתאמה המקורית
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 10, padding: "2px 10px", borderRadius: 10, fontWeight: 600,
                      backgroundColor: draft.status === "applied" ? "#05966915" : draft.status === "rejected" ? "#ef444415" : "#f59e0b15",
                      color: draft.status === "applied" ? "#059669" : draft.status === "rejected" ? "#ef4444" : "#f59e0b",
                    }}>
                      {draft.status === "applied" ? "✓ הוחל" : draft.status === "rejected" ? "✗ נדחה" : "⏳ ממתין"}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                      {new Date(draft.createdAt).toLocaleDateString("he-IL")} {new Date(draft.createdAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>

                {/* Fields summary with inline editing + confidence badges */}
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8, display: "flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "center" }}>
                  {/* Year summary chips — replaces individual monthlyReturns tags */}
                  {(() => {
                    const byYear: Record<string, number> = {};
                    const annualByYear: Record<string, number> = {};
                    draft.extracted.fields.forEach((f: { key: string; value: unknown }) => {
                      const mMonth = f.key.match(/^monthlyReturns\.(\d{4})-\d{2}$/);
                      if (mMonth) byYear[mMonth[1]] = (byYear[mMonth[1]] || 0) + 1;
                      const mAnnual = f.key.match(/^returns\.(ytd|y)(\d{4})$/);
                      if (mAnnual && typeof f.value === "number") annualByYear[mAnnual[2]] = f.value;
                    });
                    return Object.keys(byYear).sort().map(year => {
                      const count = byYear[year];
                      const annual = annualByYear[year];
                      const countColor = count === 12 ? "#22c55e" : count >= 10 ? "#f59e0b" : "#ef4444";
                      return (
                        <span key={`yr-${year}`} style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          backgroundColor: "var(--bg-input)", borderRadius: 5,
                          padding: "2px 8px", fontSize: 10, border: "1px solid var(--border)"
                        }}>
                          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{year}</span>
                          <span style={{ color: countColor }}>{count}/12</span>
                          {annual !== undefined && (
                            <span style={{ color: annual >= 0 ? "#22c55e" : "#ef4444", fontWeight: 500 }}>
                              {annual >= 0 ? "+" : ""}{(annual * 100).toFixed(1)}%
                            </span>
                          )}
                        </span>
                      );
                    });
                  })()}
                  {/* Non-monthly fields: existing editable tags */}
                  {draft.extracted.fields.filter((f: { key: string }) => !f.key.startsWith("monthlyReturns.")).map((f) => {
                    const isEditable = draft.status === "pending" && typeof f.value === "number" && (["monthlyReturn", "sharpe", "stdDev"].includes(f.key) || f.key.startsWith("returns."));
                    const editedVal = editedFields[draft.id]?.[f.key];
                    const hasEdit = editedVal !== undefined;
                    const isPercent = f.key.startsWith("returns") || f.key === "monthlyReturn";

                    return (
                      <span key={f.key} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                        <span style={{ fontWeight: 500 }}>{fieldLabel(f.key)}:</span>
                        {isEditable && draft.status === "pending" ? (
                          <input
                            type="number"
                            step={isPercent ? "0.01" : "0.1"}
                            value={hasEdit ? (isPercent ? (editedVal * 100).toFixed(2) : editedVal) : (isPercent && typeof f.value === "number" ? (f.value * 100).toFixed(2) : f.value ?? "")}
                            onChange={(e) => {
                              const raw = parseFloat(e.target.value);
                              if (isNaN(raw)) return;
                              const val = isPercent ? raw / 100 : raw;
                              setEditedFields((prev) => ({
                                ...prev,
                                [draft.id]: { ...(prev[draft.id] || {}), [f.key]: val },
                              }));
                            }}
                            style={{
                              width: 65, fontSize: 10, padding: "1px 4px", borderRadius: 3,
                              border: `1px solid ${hasEdit ? "#3b82f6" : "var(--border)"}`,
                              backgroundColor: hasEdit ? "#3b82f608" : "var(--bg-surface)",
                              color: hasEdit ? "#3b82f6" : "var(--text-primary)",
                              textAlign: "center", direction: "ltr",
                            }}
                            title={hasEdit ? `מקורי: ${formatValue(f.key, f.value)}` : "לחץ לעריכה"}
                          />
                        ) : (
                          <span style={{ direction: "ltr" }}>{formatValue(f.key, f.value)}</span>
                        )}
                        {isPercent && <span style={{ fontSize: 9, color: "var(--text-muted)" }}>%</span>}
                        {f.confidence != null && confidenceBadge(f.confidence)}
                        {hasEdit && (
                          <button
                            onClick={() => setEditedFields((prev) => {
                              const next = { ...prev, [draft.id]: { ...(prev[draft.id] || {}) } };
                              delete next[draft.id][f.key];
                              if (Object.keys(next[draft.id]).length === 0) delete next[draft.id];
                              return next;
                            })}
                            style={{ fontSize: 8, color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                            title="בטל עריכה"
                          >✕</button>
                        )}
                      </span>
                    );
                  })}
                </div>

                {/* Source preview */}
                <div style={{ fontSize: 10, color: "var(--text-muted)", backgroundColor: "var(--bg-input)", padding: "6px 10px", borderRadius: 6, marginBottom: 10, direction: "rtl" }}>
                  {draft.source.preview}...
                </div>

                {/* Monthly uncertain warning */}
                {draft.corrections && draft.corrections.some((c: string) => c.includes("monthly_uncertain")) && (
                  <div style={{
                    backgroundColor: "#ef444415",
                    border: "1px solid #ef444440",
                    borderRadius: 6,
                    padding: "8px 12px",
                    marginBottom: 10,
                    fontSize: 11,
                  }}>
                    <div style={{ color: "#ef4444", fontWeight: 600, marginBottom: 4 }}>
                      ⚠ נתונים חודשיים אינם אמינים ודורשים בדיקה
                    </div>
                    <div style={{ color: "var(--text-secondary)", fontSize: 10, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {draft.corrections.map((c: string, ci: number) => (
                        <span key={ci} style={{
                          backgroundColor: c.includes("monthly_uncertain") ? "#ef444420" : "var(--bg-surface-alt)",
                          color: c.includes("monthly_uncertain") ? "#ef4444" : "var(--text-muted)",
                          padding: "1px 6px",
                          borderRadius: 4,
                          fontSize: 9,
                        }}>{c}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Report month — editable for pending drafts */}
                {draft.status === "pending" && (() => {
                  const currentMonth = draftReportMonths[draft.id] ?? (draft.reportMonth || "");
                  const hasMonthlyReturn = draft.extracted.fields.some((f) => f.key === "monthlyReturn");
                  const missing = hasMonthlyReturn && !currentMonth;
                  return (
                    <div style={{
                      padding: "8px 12px",
                      backgroundColor: missing ? "#fef3c715" : "var(--bg-input)",
                      border: `1px solid ${missing ? "#f59e0b60" : "var(--border)"}`,
                      borderRadius: 6,
                      marginBottom: 10,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}>
                      <label style={{ fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>📅 חודש דיווח:</label>
                      <input
                        type="month"
                        value={currentMonth}
                        onChange={(e) => setDraftReportMonths((prev) => ({ ...prev, [draft.id]: e.target.value }))}
                        style={{
                          border: `1px solid ${missing ? "#f59e0b" : "var(--border)"}`,
                          borderRadius: 5,
                          padding: "4px 8px",
                          fontSize: 11,
                          backgroundColor: "var(--bg-surface)",
                          color: "var(--text-primary)",
                          maxWidth: 160,
                        }}
                      />
                      {missing && (
                        <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 500 }}>
                          יש לבחור חודש דיווח
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Currency badge */}
                {draft.status === "pending" && (
                  <div style={{
                    padding: "6px 12px",
                    backgroundColor: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    marginBottom: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11,
                  }}>
                    <span style={{ fontWeight: 600 }}>💱 מטבע:</span>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      backgroundColor: draft.returnBasis === "USD" ? "#3b82f615" : "#05966915",
                      color: draft.returnBasis === "USD" ? "#3b82f6" : "#059669",
                      fontWeight: 600,
                      fontSize: 10,
                    }}>
                      {draft.returnBasis === "USD" ? "$ דולרי" : "₪ שקלי"}
                    </span>
                  </div>
                )}

                {/* Diff Review UI */}
                {draft.status === "pending" && diffResult && diffResult.draftId === draft.id && (() => {
                  const changedFields = diffResult.diff.filter((d) => d.status === "changed");
                  const newFields = diffResult.diff.filter((d) => d.status === "new");
                  const missingFields = diffResult.diff.filter((d) => d.status === "missing_in_pdf");
                  const sameCount = diffResult.diff.filter((d) => d.status === "same").length;
                  const allDecided = changedFields.every((d) => fieldDecisions[d.field]) && missingFields.every((d) => fieldDecisions[d.field]);

                  return (
                    <div style={{
                      backgroundColor: "#fef3c720",
                      border: "1px solid #f59e0b40",
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 10,
                    }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "#f59e0b", margin: "0 0 8px" }}>
                        ⚠️ סקירת שינויים — {changedFields.length} שונים, {newFields.length} חדשים{missingFields.length > 0 ? `, ${missingFields.length} חסרים בדוח` : ""}
                      </p>

                      {/* Monthly vs Yearly compound validation */}
                      {diffResult.monthlyValidation && diffResult.monthlyValidation.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          {diffResult.monthlyValidation.map((v: { year: number; compounded: number; yearly: number; diff: number; status: string }, vi: number) => (
                            <div key={`mv-${vi}`} style={{
                              display: "flex", alignItems: "center", gap: 8, fontSize: 10, padding: "3px 8px",
                              backgroundColor: v.status === "fail" ? "#ef444410" : "#05966910",
                              borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                color: v.status === "fail" ? "#ef4444" : "#059669",
                                fontWeight: 700, fontSize: 9,
                              }}>{v.status === "fail" ? "✕" : "✓"}</span>
                              <span style={{ color: "var(--text-secondary)" }}>
                                {v.year}: חודשי מצרפי {(v.compounded * 100).toFixed(2)}% מול שנתי {(v.yearly * 100).toFixed(2)}%
                                {v.status === "fail" && <span style={{ color: "#ef4444", fontWeight: 600 }}> (פער {(v.diff * 100).toFixed(2)}%)</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Monthly uncertain warning in diff */}
                      {diffResult.hasMonthlyUncertain && (
                        <div style={{
                          backgroundColor: "#ef444415", border: "1px solid #ef444440", borderRadius: 6,
                          padding: "6px 10px", marginBottom: 8, fontSize: 10, color: "#ef4444", fontWeight: 600,
                        }}>
                          ⚠ נתונים חודשיים סומנו כלא אמינים — בדקו לפני אישור
                        </div>
                      )}

                      {/* Monthly direction selector / badge */}
                      {(() => {
                        const dir = diffResult.fundMonthlyDirection;
                        const dirEffectiveFundId = draftMatchOverrides[draft.id]?.fundId || draft.match?.fundId;
                        const dirEffectiveCatId = draftMatchOverrides[draft.id]?.categoryId || draft.match?.categoryId;
                        const hasMonthlyFields = diffResult.diff.some((d) => d.field.startsWith("monthlyReturns."));
                        if (!hasMonthlyFields) return null;

                        if (dir === "LTR" || dir === "RTL") {
                          return (
                            <div style={{
                              display: "inline-block", padding: "2px 8px", borderRadius: 4, marginBottom: 8,
                              backgroundColor: dir === "LTR" ? "#05966915" : "#3b82f615",
                              color: dir === "LTR" ? "#059669" : "#3b82f6",
                              fontSize: 10, fontWeight: 600,
                            }}>
                              {dir === "LTR" ? "→ ינואר→דצמבר (LTR)" : "← דצמבר→ינואר (RTL — מנורמל)"}
                            </div>
                          );
                        }

                        // Direction is null — show selector
                        const saveDirection = async (newDir: "LTR" | "RTL") => {
                          if (!dirEffectiveFundId || !dirEffectiveCatId) return;
                          try {
                            const res = await fetch(`/api/parse?action=set-direction&client=${encodeURIComponent(clientKey)}`, {
                              method: "POST",
                              headers: { ...headers, "Content-Type": "application/json" },
                              body: JSON.stringify({ fundId: dirEffectiveFundId, categoryId: dirEffectiveCatId, direction: newDir }),
                            });
                            if (!res.ok) return;
                            // Re-run check-collision with new direction
                            const draftReportMonth = draftReportMonths[draft.id] || draft.reportMonth;
                            const effectiveFields = draft.extracted.fields.map((f: { key: string; value: unknown }) => {
                              const edits = editedFields[draft.id] || {};
                              return edits[f.key] !== undefined ? { ...f, value: edits[f.key] } : f;
                            });
                            const checkRes = await fetch(`/api/parse?action=check-collision&client=${encodeURIComponent(clientKey)}`, {
                              method: "POST",
                              headers: { ...headers, "Content-Type": "application/json" },
                              body: JSON.stringify({
                                fundId: dirEffectiveFundId,
                                categoryId: dirEffectiveCatId,
                                reportMonth: draftReportMonth || null,
                                approvedFields: effectiveFields,
                                draftId: draft.id,
                              }),
                            });
                            if (checkRes.ok) {
                              const result = await checkRes.json();
                              setDiffResult({ ...result, draftId: draft.id });
                              setFieldDecisions(buildInitialDecisions(result.diff || []));
                            }
                            // Reload fund data so direction persists in UI
                            onReload();
                          } catch { /* ignore */ }
                        };

                        return (
                          <div style={{
                            backgroundColor: "#3b82f610", border: "1px solid #3b82f630", borderRadius: 6,
                            padding: "8px 10px", marginBottom: 8,
                          }}>
                            <p style={{ fontSize: 10, fontWeight: 600, color: "#3b82f6", margin: "0 0 6px" }}>
                              בחר כיוון חודשים לקרן זו:
                            </p>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                onClick={() => saveDirection("LTR")}
                                style={{
                                  backgroundColor: "#05966915", color: "#059669", border: "1px solid #05966930",
                                  borderRadius: 5, padding: "4px 12px", cursor: "pointer", fontSize: 10, fontWeight: 600,
                                }}>
                                ינואר → דצמבר
                              </button>
                              <button
                                onClick={() => saveDirection("RTL")}
                                style={{
                                  backgroundColor: "#3b82f615", color: "#3b82f6", border: "1px solid #3b82f630",
                                  borderRadius: 5, padding: "4px 12px", cursor: "pointer", fontSize: 10, fontWeight: 600,
                                }}>
                                ינואר ← דצמבר
                              </button>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Changed fields — require decision */}
                      {changedFields.map((d, di) => (
                        <div key={`changed-${di}`} style={{
                          backgroundColor: d.monthlyProtected ? "#ef444408" : "var(--bg-surface)",
                          border: `1px solid ${d.monthlyProtected ? "#ef444440" : "#f59e0b40"}`,
                          borderRadius: 6,
                          padding: 10,
                          marginBottom: 8,
                        }}>
                          <div style={{ fontSize: 11, marginBottom: 6 }}>
                            <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 3, backgroundColor: "#f59e0b20", color: "#f59e0b", fontSize: 9, fontWeight: 700, marginLeft: 6 }}>שונה</span>
                            {d.monthlyProtected && (
                              <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 3, backgroundColor: "#ef444420", color: "#ef4444", fontSize: 9, fontWeight: 700, marginLeft: 6 }}>🛡 מוגן — נתון חודשי לא אמין</span>
                            )}
                            {d.historyMismatch && !d.monthlyProtected && (
                              <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 3, backgroundColor: "#f59e0b20", color: "#f59e0b", fontSize: 9, fontWeight: 700, marginLeft: 6 }}>⚠ ערך שונה מהיסטוריה קיימת{d.historyDiff != null ? ` (${(d.historyDiff * 100).toFixed(1)}%)` : ""}</span>
                            )}
                            <strong>{fieldLabel(d.field)}</strong>
                          </div>
                          <div style={{ display: "flex", gap: 16, fontSize: 11, marginBottom: 8 }}>
                            <span style={{ color: "var(--text-muted)" }}>קיים: <strong>{formatValue(d.field, d.existingValue)}</strong></span>
                            <span style={{ color: "#3b82f6" }}>חדש: <strong>{formatValue(d.field, d.newValue)}</strong></span>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={() => setFieldDecisions((prev) => ({ ...prev, [d.field]: "replace" }))}
                              style={{
                                backgroundColor: fieldDecisions[d.field] === "replace" ? "#059669" : "var(--bg-surface-alt)",
                                color: fieldDecisions[d.field] === "replace" ? "#fff" : "var(--text-secondary)",
                                border: "1px solid var(--border)", borderRadius: 5, padding: "4px 12px", cursor: "pointer", fontSize: 10, fontWeight: 600,
                              }}>
                              החלף בחדש
                            </button>
                            <button
                              onClick={() => setFieldDecisions((prev) => ({ ...prev, [d.field]: "keep" }))}
                              style={{
                                backgroundColor: fieldDecisions[d.field] === "keep" ? "#f59e0b" : "var(--bg-surface-alt)",
                                color: fieldDecisions[d.field] === "keep" ? "#fff" : "var(--text-secondary)",
                                border: "1px solid var(--border)", borderRadius: 5, padding: "4px 12px", cursor: "pointer", fontSize: 10, fontWeight: 600,
                              }}>
                              שמור קיים
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* New fields — auto-apply, display only */}
                      {newFields.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          {newFields.map((d, di) => (
                            <div key={`new-${di}`} style={{
                              backgroundColor: "var(--bg-surface)",
                              border: "1px solid #05966930",
                              borderRadius: 6,
                              padding: "8px 10px",
                              marginBottom: 4,
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}>
                              <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 3, backgroundColor: "#05966920", color: "#059669", fontSize: 9, fontWeight: 700 }}>חדש</span>
                              <span style={{ fontSize: 11, fontWeight: 500 }}>{fieldLabel(d.field)}</span>
                              <span style={{ fontSize: 11, color: "#059669", direction: "ltr" }}>{formatValue(d.field, d.newValue)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Missing in PDF fields — require decision */}
                      {missingFields.map((d, di) => (
                        <div key={`missing-${di}`} style={{
                          backgroundColor: "var(--bg-surface)",
                          border: "1px solid #ef444440",
                          borderRadius: 6,
                          padding: 10,
                          marginBottom: 8,
                        }}>
                          <div style={{ fontSize: 11, marginBottom: 6 }}>
                            <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 3, backgroundColor: "#ef444420", color: "#ef4444", fontSize: 9, fontWeight: 700, marginLeft: 6 }}>חסר בדוח</span>
                            <strong>{fieldLabel(d.field)}</strong>
                          </div>
                          <div style={{ fontSize: 11, marginBottom: 8, color: "var(--text-muted)" }}>
                            ערך קיים: <strong>{formatValue(d.field, d.existingValue)}</strong> — לא נמצא בדוח המנותח
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={() => setFieldDecisions((prev) => ({ ...prev, [d.field]: "keep" }))}
                              style={{
                                backgroundColor: fieldDecisions[d.field] === "keep" ? "#f59e0b" : "var(--bg-surface-alt)",
                                color: fieldDecisions[d.field] === "keep" ? "#fff" : "var(--text-secondary)",
                                border: "1px solid var(--border)", borderRadius: 5, padding: "4px 12px", cursor: "pointer", fontSize: 10, fontWeight: 600,
                              }}>
                              שמור קיים
                            </button>
                            <button
                              onClick={() => setFieldDecisions((prev) => ({ ...prev, [d.field]: "clear" }))}
                              style={{
                                backgroundColor: fieldDecisions[d.field] === "clear" ? "#ef4444" : "var(--bg-surface-alt)",
                                color: fieldDecisions[d.field] === "clear" ? "#fff" : "var(--text-secondary)",
                                border: "1px solid var(--border)", borderRadius: 5, padding: "4px 12px", cursor: "pointer", fontSize: 10, fontWeight: 600,
                              }}>
                              נקה ערך
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Same fields counter */}
                      {sameCount > 0 && (
                        <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "4px 0 8px" }}>
                          {sameCount} שדות ללא שינוי
                        </p>
                      )}

                      {/* Apply with decisions */}
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        {allDecided && (
                          <button
                            onClick={() => {
                              handleApplyDraft(draft, { ...fieldDecisions });
                            }}
                            style={{
                              backgroundColor: "#059669", color: "#fff", fontWeight: 600, padding: "6px 16px",
                              borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11,
                            }}>
                            ✓ החל עם ההחלטות שנבחרו
                          </button>
                        )}
                        <button
                          onClick={() => { setDiffResult(null); setFieldDecisions({}); }}
                          style={{
                            backgroundColor: "var(--bg-surface-alt)", color: "var(--text-secondary)",
                            border: "1px solid var(--border)", borderRadius: 5, padding: "6px 16px",
                            cursor: "pointer", fontSize: 11,
                          }}>
                          ביטול
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* New Fund Onboarding UI */}
                {draft.status === "pending" && newFundDraftId === draft.id && (
                  <div style={{
                    backgroundColor: "#3b82f610",
                    border: "1px solid #3b82f630",
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 10,
                  }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#3b82f6", margin: "0 0 8px" }}>
                      🆕 יצירת קרן חדשה
                    </p>
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>שם הקרן:</label>
                      <input
                        type="text"
                        value={newFundName || draft.extracted.fundName}
                        onChange={(e) => setNewFundName(e.target.value)}
                        style={{
                          width: "100%",
                          border: "1px solid var(--border)",
                          borderRadius: 5,
                          padding: "6px 10px",
                          fontSize: 12,
                          backgroundColor: "var(--bg-surface)",
                          color: "var(--text-primary)",
                          direction: "rtl",
                        }}
                      />
                    </div>
                    {/* === LAYER 1: parentSection === */}
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>שכבה 1 — קבוצה ראשית:</label>
                      {!nfIsNewParent ? (
                        <select
                          value={nfParentSection}
                          onChange={(e) => {
                            if (e.target.value === "__new__") {
                              setNfIsNewParent(true); setNfParentSection(""); setNfIsNewCategory(true); setNfNewCategoryName(""); setNewFundCategoryId("");
                            } else {
                              setNfParentSection(e.target.value); setNfIsNewCategory(false); setNfNewCategoryName("");
                              const firstCat = data.categories.find((c) => c.parentSection === e.target.value);
                              if (firstCat) setNewFundCategoryId(firstCat.id); else setNewFundCategoryId("");
                            }
                          }}
                          style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 5, padding: "6px 10px", fontSize: 12, backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }}
                        >
                          <option value="">— בחר קבוצה —</option>
                          {Array.from(new Set(data.categories.map((c) => c.parentSection).filter(Boolean))).sort().map((ps) => (
                            <option key={ps} value={ps}>{ps}</option>
                          ))}
                          <option value="__new__">➕ קבוצה חדשה...</option>
                        </select>
                      ) : (
                        <div style={{ display: "flex", gap: 6 }}>
                          <input value={nfNewParentName} onChange={(e) => setNfNewParentName(e.target.value)} placeholder="שם קבוצה חדשה" autoFocus
                            style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 5, padding: "6px 10px", fontSize: 12, backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }} />
                          <button type="button" onClick={() => { setNfIsNewParent(false); setNfParentSection(""); }}
                            style={{ background: "none", border: "1px solid var(--border)", borderRadius: 5, padding: "4px 8px", cursor: "pointer", color: "var(--text-muted)", fontSize: 11 }}>✕</button>
                        </div>
                      )}
                    </div>

                    {/* === LAYER 2: category (filtered by layer 1) === */}
                    {(nfParentSection || (nfIsNewParent && nfNewParentName.trim())) && (
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>שכבה 2 — קטגוריה:</label>
                        {!nfIsNewCategory ? (
                          <select
                            value={newFundCategoryId}
                            onChange={(e) => {
                              if (e.target.value === "__new__") {
                                setNfIsNewCategory(true); setNfNewCategoryName(""); setNewFundCategoryId("");
                              } else {
                                setNewFundCategoryId(e.target.value);
                              }
                            }}
                            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 5, padding: "6px 10px", fontSize: 12, backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }}
                          >
                            <option value="">— בחר קטגוריה —</option>
                            {data.categories.filter((c) => c.parentSection === nfParentSection).map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                            <option value="__new__">➕ קטגוריה חדשה...</option>
                          </select>
                        ) : (
                          <div style={{ display: "flex", gap: 6 }}>
                            <input value={nfNewCategoryName} onChange={(e) => setNfNewCategoryName(e.target.value)} placeholder="שם קטגוריה חדשה" autoFocus
                              style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 5, padding: "6px 10px", fontSize: 12, backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }} />
                            {!nfIsNewParent && (
                              <button type="button" onClick={() => { setNfIsNewCategory(false); const fc = data.categories.find((c) => c.parentSection === nfParentSection); if (fc) setNewFundCategoryId(fc.id); }}
                                style={{ background: "none", border: "1px solid var(--border)", borderRadius: 5, padding: "4px 8px", cursor: "pointer", color: "var(--text-muted)", fontSize: 11 }}>✕</button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* === LAYER 3: classification (filtered by layer 2) === */}
                    {(newFundCategoryId || (nfIsNewCategory && nfNewCategoryName.trim())) && (
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>שכבה 3 — סיווג:</label>
                        {(() => {
                          const activePs = nfIsNewParent ? nfNewParentName.trim() : nfParentSection;
                          const clsList = nfIsNewCategory
                            ? data.categories.filter((c) => c.parentSection === activePs).flatMap((c) => c.funds.map((f) => f.classification)).filter(Boolean)
                            : (data.categories.find((c) => c.id === newFundCategoryId)?.funds.map((f) => f.classification).filter(Boolean) || []);
                          const uniqueCls = Array.from(new Set(clsList)).sort();
                          return !nfIsNewClassification ? (
                            <select
                              value={newFundClassification}
                              onChange={(e) => {
                                if (e.target.value === "__new__") { setNfIsNewClassification(true); setNewFundClassification(""); }
                                else { setNewFundClassification(e.target.value); }
                              }}
                              style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 5, padding: "6px 10px", fontSize: 12, backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }}
                            >
                              <option value="">— בחר סיווג —</option>
                              {uniqueCls.map((cls) => <option key={cls} value={cls}>{cls}</option>)}
                              <option value="__new__">➕ סיווג חדש...</option>
                            </select>
                          ) : (
                            <div style={{ display: "flex", gap: 6 }}>
                              <input value={newFundClassification} onChange={(e) => setNewFundClassification(e.target.value)} placeholder="סיווג חדש" autoFocus
                                style={{ flex: 1, border: "1px solid var(--border)", borderRadius: 5, padding: "6px 10px", fontSize: 12, backgroundColor: "var(--bg-surface)", color: "var(--text-primary)", direction: "rtl" }} />
                              <button type="button" onClick={() => { setNfIsNewClassification(false); setNewFundClassification(""); }}
                                style={{ background: "none", border: "1px solid var(--border)", borderRadius: 5, padding: "4px 8px", cursor: "pointer", color: "var(--text-muted)", fontSize: 11 }}>✕</button>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, display: "block", marginBottom: 4 }}>מטבע קרן:</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => setNewFundReturnBasis("ILS")}
                          style={{
                            padding: "4px 12px", borderRadius: 5, fontSize: 11, cursor: "pointer",
                            border: `1px solid ${newFundReturnBasis === "ILS" ? "#059669" : "var(--border)"}`,
                            backgroundColor: newFundReturnBasis === "ILS" ? "#05966915" : "var(--bg-surface)",
                            color: newFundReturnBasis === "ILS" ? "#059669" : "var(--text-secondary)",
                            fontWeight: newFundReturnBasis === "ILS" ? 700 : 400,
                          }}>
                          ₪ שקלי
                        </button>
                        <button
                          onClick={() => setNewFundReturnBasis("USD")}
                          style={{
                            padding: "4px 12px", borderRadius: 5, fontSize: 11, cursor: "pointer",
                            border: `1px solid ${newFundReturnBasis === "USD" ? "#3b82f6" : "var(--border)"}`,
                            backgroundColor: newFundReturnBasis === "USD" ? "#3b82f615" : "var(--bg-surface)",
                            color: newFundReturnBasis === "USD" ? "#3b82f6" : "var(--text-secondary)",
                            fontWeight: newFundReturnBasis === "USD" ? 700 : 400,
                          }}>
                          $ דולרי
                        </button>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {(() => {
                        const canCreate = !!(newFundCategoryId || (nfIsNewCategory && nfNewCategoryName.trim()));
                        return (
                          <button
                            onClick={() => handleCreateFund(draft)}
                            disabled={!canCreate}
                            style={{
                              backgroundColor: canCreate ? "#3b82f6" : "var(--text-muted)",
                              color: "#fff", fontWeight: 600, padding: "5px 16px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11,
                              opacity: canCreate ? 1 : 0.4,
                            }}>
                            ✓ צור קרן חדשה
                          </button>
                        );
                      })()}
                      <button
                        onClick={() => { setNewFundDraftId(null); setNewFundName(""); setNewFundCategoryId(""); setNewFundReturnBasis("ILS"); setNewFundClassification(""); setNfParentSection(""); setNfIsNewParent(false); setNfNewParentName(""); setNfIsNewCategory(false); setNfNewCategoryName(""); setNfIsNewClassification(false); }}
                        style={{ backgroundColor: "var(--bg-surface-alt)", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 5, padding: "5px 16px", cursor: "pointer", fontSize: 11 }}>
                        ביטול
                      </button>
                    </div>
                  </div>
                )}

                {/* Actions for pending */}
                {draft.status === "pending" && !(diffResult && diffResult.draftId === draft.id) && newFundDraftId !== draft.id && (() => {
                  const effectiveMonth = draftReportMonths[draft.id] ?? (draft.reportMonth || "");
                  const needsMonth = draft.extracted.fields.some((f) => f.key === "monthlyReturn") && !effectiveMonth;
                  const hasFundMatch = !!(draftMatchOverrides[draft.id]?.fundId || draft.match?.fundId);
                  const canApply = hasFundMatch && draft.extracted.fields.length > 0 && !needsMonth;
                  return (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => handleApplyDraft(draft)}
                        disabled={!canApply}
                        style={{
                          backgroundColor: canApply ? "#059669" : "var(--text-muted)",
                          color: "#fff", fontWeight: 600, padding: "5px 16px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11,
                          opacity: canApply ? 1 : 0.4,
                        }}
                        title={!hasFundMatch ? "לא נבחרה קרן" : needsMonth ? "יש לבחור חודש דיווח" : draft.extracted.fields.length === 0 ? "אין שדות" : `עדכן ${draft.extracted.fields.length} שדות`}>
                        ✓ עדכן קרן ({draft.extracted.fields.length})
                      </button>
                      <button
                        onClick={() => { setNewFundDraftId(draft.id); setNewFundName(draft.extracted.fundName); setNewFundCategoryId(""); setNewFundReturnBasis(draft.returnBasis || "ILS"); setNewFundClassification(""); setNfParentSection(""); setNfIsNewParent(false); setNfNewParentName(""); setNfIsNewCategory(false); setNfNewCategoryName(""); setNfIsNewClassification(false); }}
                        style={{
                          backgroundColor: "var(--bg-surface-alt)", color: "#3b82f6", border: "1px solid #3b82f630", borderRadius: 5, padding: "5px 16px", cursor: "pointer", fontSize: 11, fontWeight: 600,
                        }}>
                        🆕 קרן חדשה
                      </button>
                      <button onClick={() => handleRejectDraft(draft.id)}
                        style={{ backgroundColor: "var(--bg-surface-alt)", color: "#ef4444", border: "1px solid #ef444430", borderRadius: 5, padding: "5px 16px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                        ✗ דחה
                      </button>
                    </div>
                  );
                })()}
              </div>
            ))
          );
          })()}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Indications Admin Tab                                              */
/* ================================================================== */
function IndicationsAdminTab({ password, clientKey, onStatus, brand, onBrandRefresh }: {
  password: string;
  clientKey: string;
  onStatus: (msg: string) => void;
  brand: import("@/config/brand").BrandConfig;
  onBrandRefresh: () => void;
}) {
  const [enabled, setEnabled] = useState<boolean>(brand.features?.indications ?? false);
  const [saving, setSaving] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/indications?client=${encodeURIComponent(clientKey)}`)
      .then((r) => r.json())
      .then((arr: unknown[]) => setCount(arr.length))
      .catch(() => setCount(0));
  }, [clientKey]);

  const handleToggle = async (val: boolean) => {
    setSaving(true);
    setEnabled(val);
    try {
      // Save via brand API
      const brandRes = await fetch(`/api/brand?client=${encodeURIComponent(clientKey)}`);
      const currentBrand = await brandRes.json();
      const updated = {
        ...currentBrand,
        features: { ...(currentBrand.features || {}), indications: val },
      };
      const saveRes = await fetch(`/api/brand?client=${encodeURIComponent(clientKey)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify(updated),
      });
      if (saveRes.ok) {
        onBrandRefresh();
        onStatus(`✓ אינדיקציה ${val ? "הופעלה" : "כובתה"}`);
      } else {
        onStatus("❌ שגיאה בשמירה");
        setEnabled(!val);
      }
    } catch {
      onStatus("❌ שגיאה בשמירה");
      setEnabled(!val);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("למחוק את כל האינדיקציות? פעולה זו בלתי הפיכה.")) return;
    const res = await fetch(`/api/indications?all=true&client=${encodeURIComponent(clientKey)}`, {
      method: "DELETE",
      headers: { "x-admin-password": password },
    });
    if (res.ok) {
      setCount(0);
      onStatus("✓ כל האינדיקציות נמחקו");
    } else {
      onStatus("❌ שגיאה במחיקה");
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <SectionCard title="הגדרות אינדיקציה">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)", marginBottom: 4 }}>
              הפעלת מסך אינדיקציה מהירה
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              מאפשר הזנה מהירה של תשואות חודשיות לפני אישור רשמי
            </div>
          </div>
          <button
            onClick={() => !saving && handleToggle(!enabled)}
            disabled={saving}
            style={{
              width: 52, height: 28, borderRadius: 14, border: "none", cursor: saving ? "default" : "pointer",
              backgroundColor: enabled ? brand.primaryColor : "var(--border)",
              position: "relative", transition: "background-color 0.2s", flexShrink: 0,
            }}
          >
            <span style={{
              position: "absolute", top: 3, transition: "left 0.2s",
              left: enabled ? 26 : 3, width: 22, height: 22, borderRadius: "50%",
              backgroundColor: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            }} />
          </button>
        </div>

        {enabled && (
          <div style={{ marginTop: 4, padding: "10px 14px", backgroundColor: "var(--bg-surface-alt)", borderRadius: 8, border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {count === null ? "טוען..." : `${count} אינדיקציות שמורות`}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <a
                href={`/indications?client=${encodeURIComponent(clientKey)}`}
                target="_blank"
                style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--bg-input)" }}
              >
                פתח מסך הזנה ↗
              </a>
              <button
                onClick={handleReset}
                disabled={count === 0}
                style={{
                  fontSize: 12, color: count === 0 ? "var(--text-muted)" : "#ef4444",
                  backgroundColor: "transparent", border: `1px solid ${count === 0 ? "var(--border)" : "#ef444440"}`,
                  borderRadius: 6, padding: "5px 12px", cursor: count === 0 ? "default" : "pointer",
                  opacity: count === 0 ? 0.5 : 1,
                }}
              >
                איפוס אינדיקציות
              </button>
            </div>
          </div>
        )}
      </SectionCard>

      <div style={{ marginTop: 12, padding: "10px 14px", backgroundColor: "var(--bg-surface-alt)", borderRadius: 8, border: "1px solid var(--border)" }}>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
          נתוני אינדיקציה הם <strong>זמניים ואינדיקטיביים בלבד</strong> — לא מחליפים נתוני קרן רשמיים.
          לאחר קליטת דוח חודשי רשמי, יש לאפס.
        </p>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>טוען...</div>}>
      <AdminContent />
    </Suspense>
  );
}
