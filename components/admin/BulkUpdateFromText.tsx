/**
 * BulkUpdateFromText — Update monthly returns for multiple funds from pasted text.
 *
 * Flow: input (textarea + month) → parse (Claude) → review (mandatory) → save → done
 * Review screen is a hard gate: no path from input to save that skips it.
 *
 * Writes only: monthlyReturn, monthlyReturns[reportMonth], lastUpdated, lastUpdatedAt.
 * Never writes returns.ytdYYYY (Stage 2 concern).
 */
"use client";

import { useState, useMemo } from "react";
import { pctSigned, formatReportDate } from "@/lib/format";

// ── Types (mirror app/api/parse/bulk/route.ts BulkFundResult) ─────────────────

interface BulkFundResult {
  rawLine: string;
  fundId: string | null;
  fundName: string;
  categoryName: string | null;
  manager: string | null;
  similarity: number;
  monthlyReturn: number | null;
  ytdComputed: number | null;
  ytdStored: number | null;
  monthExists: boolean;
  existingValue: number | null;
  status: "green" | "yellow" | "red";
  warnings: string[];
}

interface BulkParseResponse {
  reportMonth: string;
  funds: BulkFundResult[];
}

interface SaveResult {
  successes: string[];
  failures: { fundId: string; fundName?: string; error: string }[];
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  clientKey: string;
  password: string;
  onStatus: (msg: string) => void;
  onReload: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPreviousMonth(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getLast13Months(): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }
  return result;
}

function statusConfig(status: "green" | "yellow" | "red") {
  if (status === "green") return { icon: "✓", color: "#059669" };
  if (status === "yellow") return { icon: "⚠", color: "#d97706" };
  return { icon: "✗", color: "#dc2626" };
}

function similarityColor(sim: number): string {
  if (sim >= 0.9) return "#059669";
  if (sim >= 0.7) return "#d97706";
  return "#dc2626";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BulkUpdateFromText({
  clientKey,
  password,
  onStatus,
  onReload,
}: Props) {
  const [view, setView] = useState<"input" | "review" | "done">("input");
  const [inputText, setInputText] = useState("");
  const [reportMonth, setReportMonth] = useState(getPreviousMonth);
  const [parseResult, setParseResult] = useState<BulkParseResponse | null>(null);
  const [checkedIndices, setCheckedIndices] = useState<Set<number>>(new Set());
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [showModal, setShowModal] = useState(false);

  const months = useMemo(() => getLast13Months(), []);
  const jsonHeaders = {
    "x-admin-password": password,
    "Content-Type": "application/json",
  };

  // Derived counts
  const checkedCount = checkedIndices.size;
  const greenCount = parseResult?.funds.filter((f) => f.status === "green").length ?? 0;
  const yellowCount = parseResult?.funds.filter((f) => f.status === "yellow").length ?? 0;
  const redCount = parseResult?.funds.filter((f) => f.status === "red").length ?? 0;

  function initChecked(funds: BulkFundResult[]): Set<number> {
    const s = new Set<number>();
    funds.forEach((f, i) => { if (f.status === "green") s.add(i); });
    return s;
  }

  function toggleCheck(i: number) {
    const fund = parseResult?.funds[i];
    if (!fund || fund.status === "red") return;
    const next = new Set(checkedIndices);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setCheckedIndices(next);
  }

  async function handleParse() {
    if (!inputText.trim()) { onStatus("הטקסט ריק"); return; }
    setParsing(true);
    try {
      const res = await fetch(
        `/api/parse/bulk?client=${encodeURIComponent(clientKey)}`,
        { method: "POST", headers: jsonHeaders, body: JSON.stringify({ text: inputText, reportMonth }) }
      );
      const data = await res.json();
      if (!res.ok) { onStatus(`❌ ${data.error || "שגיאה בפענוח"}`); return; }
      setParseResult(data as BulkParseResponse);
      setCheckedIndices(initChecked((data as BulkParseResponse).funds));
      setView("review");
    } catch {
      onStatus("❌ שגיאה בחיבור לשרת");
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!parseResult || checkedCount === 0) return;
    setShowModal(false);
    setSaving(true);

    const fundsToSave = parseResult.funds
      .filter((_, i) => checkedIndices.has(i))
      .filter((f) => f.fundId !== null && f.monthlyReturn !== null)
      .map((f) => ({ fundId: f.fundId!, monthlyReturn: f.monthlyReturn! }));

    try {
      const res = await fetch(
        `/api/parse/bulk-apply?client=${encodeURIComponent(clientKey)}`,
        {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ reportMonth: parseResult.reportMonth, funds: fundsToSave }),
        }
      );
      const data = await res.json();
      if (!res.ok) { onStatus(`❌ ${data.error || "שגיאה בשמירה"}`); return; }
      setSaveResult(data as SaveResult);
      setView("done");
      onReload();
    } catch {
      onStatus("❌ שגיאה בחיבור לשרת");
    } finally {
      setSaving(false);
    }
  }

  function handleSaveClick() {
    if (checkedCount > 10) setShowModal(true);
    else handleSave();
  }

  function handleReset() {
    setView("input");
    setParseResult(null);
    setCheckedIndices(new Set());
    setSaveResult(null);
    setShowModal(false);
  }

  // ── Shared styles ──────────────────────────────────────────────────────────

  const btnPrimary = (disabled: boolean): React.CSSProperties => ({
    padding: "9px 24px",
    backgroundColor: disabled ? "#9ca3af" : "#059669",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    transition: "background-color 0.15s",
  });

  const btnSecondary: React.CSSProperties = {
    padding: "8px 20px",
    backgroundColor: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 13,
    cursor: "pointer",
    color: "var(--text-secondary)",
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  INPUT VIEW
  // ══════════════════════════════════════════════════════════════════════════

  if (view === "input") {
    return (
      <div dir="rtl" style={{ maxWidth: 660 }}>
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, margin: "0 0 4px" }}>
            עדכון תשואות מטקסט
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            הדבק רשימת קרנות ותשואות חודשיות. מסך אישור יוצג לפני כל שמירה.
          </p>
        </div>

        {/* Month selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
            חודש דיווח
          </label>
          <select
            value={reportMonth}
            onChange={(e) => setReportMonth(e.target.value)}
            style={{
              padding: "7px 10px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              backgroundColor: "var(--bg-card)",
              fontSize: 13,
              width: 160,
              cursor: "pointer",
            }}
          >
            {months.map((m) => (
              <option key={m} value={m}>{formatReportDate(m)}</option>
            ))}
          </select>
        </div>

        {/* Textarea */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
            טקסט מדיווח
          </label>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={"תשואות אפריל 2026\nנוקד אקוויטי 7.7%\nרידינג 2.9%\nספרה בונד 1.9%\nחצבים בונד -0.15%"}
            rows={12}
            dir="rtl"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              backgroundColor: "var(--bg-card)",
              fontSize: 13,
              fontFamily: "monospace",
              resize: "vertical",
              boxSizing: "border-box",
              lineHeight: 1.6,
            }}
          />
        </div>

        <button
          onClick={handleParse}
          disabled={parsing || !inputText.trim()}
          style={btnPrimary(parsing || !inputText.trim())}
        >
          {parsing ? "מפענח..." : "פענח"}
        </button>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  REVIEW VIEW
  // ══════════════════════════════════════════════════════════════════════════

  if (view === "review" && parseResult) {
    const thBase: React.CSSProperties = {
      padding: "8px 10px",
      fontSize: 12,
      fontWeight: 600,
      color: "var(--text-secondary)",
      borderBottom: "2px solid var(--border)",
      whiteSpace: "nowrap",
      backgroundColor: "var(--bg-th, rgba(0,0,0,0.03))",
      textAlign: "right",
    };
    const thCenter: React.CSSProperties = { ...thBase, textAlign: "center" };
    const tdBase: React.CSSProperties = {
      padding: "7px 10px",
      fontSize: 12,
      borderBottom: "1px solid var(--border-table, rgba(0,0,0,0.06))",
      verticalAlign: "middle",
      textAlign: "right",
    };
    const tdCenter: React.CSSProperties = { ...tdBase, textAlign: "center" };

    return (
      <div dir="rtl">
        {/* Mandatory review header */}
        <div
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            backgroundColor: "#fef3c7",
            border: "1px solid #f59e0b",
            borderRadius: 8,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3, color: "#92400e" }}>
            סקירה ואישור — חובה לעבור על כל שורה לפני שמירה
          </div>
          <div style={{ fontSize: 12, color: "#78350f" }}>
            השווה את &ldquo;טקסט מקור&rdquo; מול &ldquo;קרן שזוהתה&rdquo; בכל שורה. אסור לאשר אוטומטית.
          </div>
        </div>

        {/* Summary bar */}
        <div
          style={{
            display: "flex",
            gap: 20,
            marginBottom: 16,
            fontSize: 13,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span>
            חודש: <strong>{formatReportDate(parseResult.reportMonth)}</strong>
          </span>
          <span style={{ color: "#059669", fontWeight: 600 }}>✓ {greenCount} ירוק</span>
          <span style={{ color: "#d97706", fontWeight: 600 }}>⚠ {yellowCount} צהוב</span>
          <span style={{ color: "#dc2626", fontWeight: 600 }}>✗ {redCount} אדום</span>
          <span style={{ marginRight: "auto", fontWeight: 600 }}>
            {checkedCount} מסומנים לשמירה
          </span>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto", marginBottom: 20, borderRadius: 8, border: "1px solid var(--border)" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 860 }}
          >
            <thead>
              <tr>
                <th style={thBase}>טקסט מקור</th>
                <th style={thBase}>קרן שזוהתה</th>
                <th style={thBase}>קטגוריה</th>
                <th style={thBase}>מנהל</th>
                <th style={thCenter}>התאמה</th>
                <th style={thCenter}>תשואה</th>
                <th style={thCenter}>YTD מחושב</th>
                <th style={thCenter}>YTD שמור</th>
                <th style={thCenter}>סטטוס</th>
                <th style={thCenter}>✓</th>
              </tr>
            </thead>
            <tbody>
              {parseResult.funds.map((fund, i) => {
                const isChecked = checkedIndices.has(i);
                const { icon, color } = statusConfig(fund.status);
                const rowBg =
                  fund.status === "red"
                    ? "rgba(220,38,38,0.04)"
                    : i % 2 === 0
                    ? "transparent"
                    : "rgba(0,0,0,0.015)";

                return (
                  <tr key={i} style={{ backgroundColor: rowBg }}>
                    {/* טקסט מקור */}
                    <td
                      style={{
                        ...tdBase,
                        fontFamily: "monospace",
                        maxWidth: 180,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: "var(--text-muted)",
                      }}
                      title={fund.rawLine}
                    >
                      {fund.rawLine}
                    </td>

                    {/* קרן שזוהתה */}
                    <td
                      style={{
                        ...tdBase,
                        fontWeight: 600,
                        color: fund.fundId ? "inherit" : "var(--text-muted)",
                      }}
                    >
                      {fund.fundName || "—"}
                    </td>

                    {/* קטגוריה */}
                    <td
                      style={{
                        ...tdBase,
                        color: "var(--text-secondary)",
                        maxWidth: 160,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: 11,
                      }}
                      title={fund.categoryName ?? undefined}
                    >
                      {fund.categoryName || "—"}
                    </td>

                    {/* מנהל */}
                    <td style={{ ...tdBase, color: "var(--text-secondary)", fontSize: 11 }}>
                      {fund.manager || "—"}
                    </td>

                    {/* התאמה */}
                    <td
                      style={{
                        ...tdCenter,
                        color: similarityColor(fund.similarity),
                        fontWeight: 700,
                      }}
                    >
                      {Math.round(fund.similarity * 100)}%
                    </td>

                    {/* תשואה חודשית */}
                    <td
                      style={{
                        ...tdCenter,
                        fontWeight: 600,
                        color:
                          fund.monthlyReturn === null
                            ? "var(--text-muted)"
                            : fund.monthlyReturn >= 0
                            ? "var(--positive, #059669)"
                            : "var(--negative, #dc2626)",
                      }}
                    >
                      {fund.monthlyReturn !== null
                        ? pctSigned(fund.monthlyReturn)
                        : "—"}
                    </td>

                    {/* YTD מחושב */}
                    <td style={{ ...tdCenter, color: "var(--text-secondary)" }}>
                      {fund.ytdComputed !== null ? pctSigned(fund.ytdComputed) : "—"}
                    </td>

                    {/* YTD שמור */}
                    <td style={{ ...tdCenter, color: "var(--text-muted)", fontSize: 11 }}>
                      {fund.ytdStored !== null ? pctSigned(fund.ytdStored) : "—"}
                    </td>

                    {/* סטטוס */}
                    <td style={tdCenter}>
                      <span
                        style={{ color, fontWeight: 700, fontSize: 15, cursor: "default" }}
                        title={fund.warnings.length ? fund.warnings.join(" | ") : undefined}
                      >
                        {icon}
                      </span>
                    </td>

                    {/* Checkbox */}
                    <td style={tdCenter}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={fund.status === "red"}
                        onChange={() => toggleCheck(i)}
                        style={{
                          width: 16,
                          height: 16,
                          cursor: fund.status === "red" ? "not-allowed" : "pointer",
                          accentColor: "#059669",
                        }}
                        title={
                          fund.status === "red"
                            ? fund.warnings.join(" | ")
                            : undefined
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={() => setView("input")} style={btnSecondary}>
            ביטול
          </button>
          <button
            onClick={handleSaveClick}
            disabled={saving || checkedCount === 0}
            style={btnPrimary(saving || checkedCount === 0)}
          >
            {saving ? "שומר..." : `אשר ושמור ${checkedCount} קרנות`}
          </button>
        </div>

        {/* Confirmation modal (N > 10) */}
        {showModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
          >
            <div
              dir="rtl"
              style={{
                backgroundColor: "var(--bg-card)",
                borderRadius: 12,
                padding: 28,
                maxWidth: 420,
                width: "90%",
                boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              }}
            >
              <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, marginTop: 0 }}>
                אישור שמירה
              </h3>
              <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 22 }}>
                אתה עומד לעדכן{" "}
                <strong style={{ color: "var(--text)" }}>{checkedCount} קרנות</strong>{" "}
                לחודש{" "}
                <strong style={{ color: "var(--text)" }}>
                  {formatReportDate(parseResult.reportMonth)}
                </strong>
                . האם אתה בטוח?
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-start" }}>
                <button
                  onClick={handleSave}
                  style={{
                    padding: "9px 22px",
                    backgroundColor: "#059669",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  אשר ושמור
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  style={btnSecondary}
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  DONE VIEW
  // ══════════════════════════════════════════════════════════════════════════

  if (view === "done" && saveResult) {
    const hasFailures = saveResult.failures.length > 0;
    return (
      <div dir="rtl" style={{ maxWidth: 560 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            {hasFailures ? "שמירה הושלמה עם שגיאות" : "✓ שמירה הושלמה"}
          </div>
          <div style={{ fontSize: 14, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span style={{ color: "#059669", fontWeight: 600 }}>
              {saveResult.successes.length} קרנות נשמרו
            </span>
            {hasFailures && (
              <span style={{ color: "#dc2626", fontWeight: 600 }}>
                {saveResult.failures.length} נכשלו
              </span>
            )}
          </div>
        </div>

        {hasFailures && (
          <div
            style={{
              marginBottom: 24,
              padding: "12px 16px",
              backgroundColor: "rgba(220,38,38,0.06)",
              border: "1px solid rgba(220,38,38,0.2)",
              borderRadius: 8,
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "#dc2626" }}>
              קרנות שנכשלו:
            </div>
            {saveResult.failures.map((f, i) => (
              <div
                key={i}
                style={{ fontSize: 12, color: "var(--text-secondary)", padding: "2px 0" }}
              >
                <strong>{f.fundName || f.fundId}</strong>: {f.error}
              </div>
            ))}
          </div>
        )}

        <button onClick={handleReset} style={btnPrimary(false)}>
          עדכון נוסף
        </button>
      </div>
    );
  }

  return null;
}
