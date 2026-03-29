"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { FundsData, Fund, Category } from "@/lib/types";
import { pct, returnColorInline } from "@/lib/format";
import { ThemeToggle } from "@/components/ThemeProvider";
import { useBrand, invalidateBrandCache } from "@/lib/useBrand";
import { useClientKey, withClient } from "@/lib/useClientKey";
import { BrandConfig, AppFeatures } from "@/config/brand";
import BrandLogo from "@/components/BrandLogo";
import PasswordInput from "@/components/PasswordInput";

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
  const [activeTab, setActiveTab] = useState<"data" | "funds" | "branding" | "settings" | "monthly-history">("data");
  const brand = useBrand(clientKey);
  const [showAddFund, setShowAddFund] = useState(false);
  const [addFundCategory, setAddFundCategory] = useState("");
  const [editingFund, setEditingFund] = useState<{ catId: string; fund: Fund } | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const passwordRef = useRef(password);
  passwordRef.current = password;

  const loadData = useCallback(() => {
    fetch(`/api/funds?admin=true&client=${encodeURIComponent(clientKey)}`).then((r) => r.json()).then((d: FundsData) => {
      setData(d);
      if (!addFundCategory && d.categories.length > 0) {
        setAddFundCategory(d.categories[0].id);
      }
    });
  }, [addFundCategory]);

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

  const showStatus = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(""), 3000);
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
            if (field === "monthlyReturn") return { ...fund, monthlyReturn: numVal };
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

  const updateLastUpdated = (dateStr: string) => {
    if (!data) return;
    setDirty(true);
    setSaved(false);
    setData({ ...data, lastUpdated: dateStr });
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
    setData({
      ...data,
      categories: data.categories.map((cat) => {
        if (cat.id !== categoryId) return cat;
        return { ...cat, funds: [...cat.funds, fund] };
      }),
    });
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
      {/* Thin brand color bar */}
      <div style={{ height: 4, backgroundColor: brand.primaryColor }} />
      {/* Header */}
      <div style={{ backgroundColor: "var(--bg-surface)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 50, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", padding: "8px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <BrandLogo brand={brand} height={26} variant="light" />
            <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 600 }}>ממשק ניהול</span>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>עדכון: {data.lastUpdated}</span>
            {brand.version && (
              <span style={{ fontSize: 10, color: "var(--text-muted)", backgroundColor: "var(--bg-input)", padding: "2px 8px", borderRadius: 4, fontWeight: 500 }}>
                v{brand.version}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {statusMessage && (
              <span style={{ fontSize: 12, fontWeight: 500, color: statusMessage.startsWith("✓") ? "#34d399" : "#f87171", transition: "opacity 0.3s" }}>
                {statusMessage}
              </span>
            )}
            {dirty && !saved && !statusMessage && (
              <span style={{ color: "#fbbf24", fontSize: 12, fontWeight: 500 }}>● שינויים לא נשמרו</span>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              style={{
                backgroundColor: saving || !dirty ? "var(--text-muted)" : brand.primaryColor,
                color: "#fff",
                fontWeight: 700,
                padding: "6px 20px",
                borderRadius: 6,
                border: "none",
                cursor: saving || !dirty ? "default" : "pointer",
                fontSize: 12,
                opacity: saving || !dirty ? 0.4 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {saving ? "שומר..." : "שמירה ופרסום"}
            </button>
            <a href={withClient("/", clientKey)} style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)" }}>דוח</a>
            <a href={withClient("/charts", clientKey)} style={{ fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)" }}>גרפים</a>
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "16px 24px 0" }}>
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)" }}>
          {[
            { id: "data" as const, label: "עדכון חודשי" },
            { id: "funds" as const, label: "ניהול קרנות" },
            ...(role === "super" ? [
              { id: "monthly-history" as const, label: "היסטוריה חודשית" },
              { id: "branding" as const, label: "מיתוג ודוחות" },
              { id: "settings" as const, label: "הגדרות" },
            ] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? "var(--accent)" : "var(--text-secondary)",
                backgroundColor: "transparent",
                border: "none",
                borderBottom: activeTab === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
                cursor: "pointer",
                transition: "color 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "20px 24px" }}>
        {activeTab === "data" && (
          <MonthlyDataTab data={data} updateFund={updateFund} onUpdateDate={updateLastUpdated} />
        )}
        {activeTab === "funds" && (
          <FundManagementTab
            data={data}
            onToggleActive={toggleActive}
            onDelete={deleteFund}
            onShowAdd={() => setShowAddFund(true)}
            onEdit={(catId, fund) => setEditingFund({ catId, fund })}
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
function MonthlyDataTab({ data, updateFund, onUpdateDate }: {
  data: FundsData;
  updateFund: (catId: string, fundId: string, field: string, value: string) => void;
  onUpdateDate: (dateStr: string) => void;
}) {
  return (
    <>
      {/* Month Updated field */}
      <div style={{ marginBottom: 20, backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 20px", display: "flex", alignItems: "center", gap: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
          מעודכן לתאריך:
        </label>
        <input
          type="date"
          value={data.lastUpdated || ""}
          onChange={(e) => onUpdateDate(e.target.value)}
          style={{
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 13,
            backgroundColor: "var(--bg-input)",
            color: "var(--text-primary)",
            cursor: "pointer",
            minWidth: 160,
          }}
          dir="ltr"
        />
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          תאריך זה יופיע בכותרת הדוח וההדפסה כ&quot;מעודכן ל:...&quot;
        </span>
      </div>

      {data.categories.map((cat) => {
        const visibleFunds = cat.funds.filter((f) => {
          const active = f.active !== undefined ? f.active : true;
          return active;
        });
        if (visibleFunds.length === 0) return null;
        return (
          <div key={cat.id} style={{ marginBottom: 20 }}>
            <div style={{ backgroundColor: "var(--bg-section)", color: "#fff", padding: "6px 16px", borderRadius: "8px 8px 0 0", fontWeight: 600, fontSize: 12 }}>
              {cat.name} <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.7 }}>({visibleFunds.length})</span>
            </div>
            <div style={{ backgroundColor: "var(--bg-surface)", borderRadius: "0 0 8px 8px", overflow: "hidden", border: "1px solid var(--border)", borderTop: "none" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ backgroundColor: "var(--bg-surface-alt)" }}>
                    <th style={thStyle(160)}>שם קרן</th>
                    <th style={thStyle(120)}>תשואה חודשית (%)</th>
                    <th style={thStyle(120)}>מצטבר 2026 (%)</th>
                    <th style={thStyle(80)}>2025</th>
                    <th style={thStyle(80)}>2024</th>
                    <th style={thStyle(undefined)}>מנהל</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleFunds.map((fund, idx) => (
                    <MonthlyRow key={fund.id} fund={fund} categoryId={cat.id} odd={idx % 2 === 1} onUpdate={updateFund} />
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

function MonthlyRow({ fund, categoryId, odd, onUpdate }: {
  fund: Fund; categoryId: string; odd: boolean;
  onUpdate: (catId: string, fundId: string, field: string, value: string) => void;
}) {
  const monthlyDisplay = fund.monthlyReturn !== null ? (fund.monthlyReturn * 100).toFixed(2) : "";
  const ytdDisplay = fund.returns.ytd2026 !== null ? (fund.returns.ytd2026 * 100).toFixed(2) : "";
  const bg = odd ? "var(--bg-surface-alt)" : "var(--bg-surface)";

  const inputStyle: React.CSSProperties = {
    width: 80,
    textAlign: "center",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 13,
    backgroundColor: "var(--bg-input)",
    color: "var(--text-primary)",
  };

  return (
    <tr style={{ backgroundColor: bg, borderBottom: "1px solid var(--border-table)" }}>
      <td style={{ padding: "6px 12px", fontWeight: 600, textAlign: "right", fontSize: 12.5 }}>
        {fund.name}
      </td>
      <td style={{ padding: "5px 10px", textAlign: "center" }}>
        <input
          type="text"
          defaultValue={monthlyDisplay}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && isNaN(parseFloat(v))) { e.target.value = monthlyDisplay; return; }
            onUpdate(categoryId, fund.id, "monthlyReturn", v);
          }}
          style={{ ...inputStyle, color: returnColorInline(fund.monthlyReturn) }}
          dir="ltr"
        />
      </td>
      <td style={{ padding: "5px 10px", textAlign: "center" }}>
        <input
          type="text"
          defaultValue={ytdDisplay}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && isNaN(parseFloat(v))) { e.target.value = ytdDisplay; return; }
            onUpdate(categoryId, fund.id, "ytd2026", v);
          }}
          style={{ ...inputStyle, color: returnColorInline(fund.returns.ytd2026) }}
          dir="ltr"
        />
      </td>
      <td style={{ padding: "6px 10px", textAlign: "center", color: returnColorInline(fund.returns.y2025), fontSize: 12 }}>
        {pct(fund.returns.y2025)}
      </td>
      <td style={{ padding: "6px 10px", textAlign: "center", color: returnColorInline(fund.returns.y2024), fontSize: 12 }}>
        {pct(fund.returns.y2024)}
      </td>
      <td style={{ padding: "6px 10px", textAlign: "center", color: "var(--text-muted)", fontSize: 11 }}>{fund.manager}</td>
    </tr>
  );
}

/* ================================================================== */
/*  Monthly History Tab (Super Admin only)                             */
/* ================================================================== */
function MonthlyHistoryTab({ data, onUpdateMonthlyReturn }: {
  data: FundsData;
  onUpdateMonthlyReturn: (catId: string, fundId: string, month: string, value: string) => void;
}) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);

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
    </>
  );
}

/* ================================================================== */
/*  Fund Management Tab                                                */
/* ================================================================== */
function FundManagementTab({ data, onToggleActive, onDelete, onShowAdd, onEdit, addFundCategory, setAddFundCategory }: {
  data: FundsData;
  onToggleActive: (catId: string, fundId: string) => void;
  onDelete: (catId: string, fundId: string, fundName: string) => void;
  onShowAdd: () => void;
  onEdit: (catId: string, fund: Fund) => void;
  addFundCategory: string;
  setAddFundCategory: (v: string) => void;
}) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
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

      {data.categories.map((cat) => (
        <div key={cat.id} style={{ marginBottom: 20 }}>
          <div style={{ backgroundColor: "var(--bg-section)", color: "#fff", padding: "6px 16px", borderRadius: "8px 8px 0 0", fontWeight: 600, fontSize: 12 }}>
            {cat.name} <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.7 }}>({cat.funds.length})</span>
          </div>
          <div style={{ backgroundColor: "var(--bg-surface)", borderRadius: "0 0 8px 8px", overflow: "hidden", border: "1px solid var(--border)", borderTop: "none" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ backgroundColor: "var(--bg-surface-alt)" }}>
                  <th style={thStyle(undefined)}>שם קרן</th>
                  <th style={thStyle(130)}>סיווג</th>
                  <th style={thStyle(100)}>מנהל</th>
                  <th style={thStyle(80)}>פעיל</th>
                  <th style={thStyle(120)}>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {cat.funds.map((fund, idx) => {
                  const isActive = fund.active !== undefined ? fund.active : true;
                  return (
                    <tr key={fund.id} style={{ backgroundColor: idx % 2 === 0 ? "var(--bg-surface)" : "var(--bg-surface-alt)", borderBottom: "1px solid var(--border-table)", opacity: isActive ? 1 : 0.5 }}>
                      <td style={{ padding: "6px 12px", fontWeight: 600, textAlign: "right" }}>{fund.name}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 11, color: "var(--text-secondary)" }}>{fund.classification}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center", fontSize: 11, color: "var(--text-muted)" }}>{fund.manager}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center" }}>
                        <button onClick={() => onToggleActive(cat.id, fund.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}
                          title={isActive ? "לחץ להשבתה" : "לחץ להפעלה"}>
                          {isActive ? "✅" : "❌"}
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
      ))}
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
  const [form, setForm] = useState<Record<string, string>>(() => {
    if (existingFund) {
      return {
        name: existingFund.name,
        classification: existingFund.classification,
        manager: existingFund.manager,
        startDate: existingFund.startDate || "",
        lastReportDate: existingFund.lastReportDate || "",
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
      name: "", classification: "", manager: "", startDate: "", lastReportDate: "",
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
      id: existingFund?.id || `fund-${Date.now()}`,
      name: form.name.trim(),
      classification: form.classification.trim(),
      manager: form.manager.trim(),
      startDate: form.startDate || null,
      lastReportDate: form.lastReportDate || null,
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

    onSave(fund, catId);
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

        {/* Category selector for new funds */}
        {!isEdit && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>קטגוריה</label>
            <select value={catId} onChange={(e) => { setCatId(e.target.value); onCategoryChange?.(e.target.value); }}
              style={{ ...fieldStyle, cursor: "pointer" }}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        {/* Basic info */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>שם קרן *</label>
            <input value={form.name} onChange={(e) => update("name", e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>סיווג</label>
            <select value={form.classification} onChange={(e) => update("classification", e.target.value)} style={{ ...fieldStyle, cursor: "pointer" }}>
              <option value="">— בחר סיווג —</option>
              {Array.from(new Set(categories.flatMap((c) => c.funds.map((f) => f.classification)).filter(Boolean))).sort().map((cls) => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>
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
            <label style={labelStyle}>תאריך דוח אחרון</label>
            <input type="date" value={form.lastReportDate} onChange={(e) => update("lastReportDate", e.target.value)} style={fieldStyle} dir="ltr" />
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
            <label style={labelStyle}>סט״ד (%)</label>
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

export default function AdminPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>טוען...</div>}>
      <AdminContent />
    </Suspense>
  );
}
