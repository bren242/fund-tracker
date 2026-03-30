"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useClientKey } from "@/lib/useClientKey";
import { useBrand } from "@/lib/useBrand";
import ClientGate from "@/components/ClientGate";
import BrandLogo from "@/components/BrandLogo";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface ParsedField {
  key: string;
  value: string | number | null;
  confidence: number;
}

interface FileResult {
  id: string;
  fileName: string;
  status: "queued" | "uploading" | "parsed" | "saved" | "error";
  error?: string;
  fundName?: string;
  fundNameConfidence?: number;
  fields?: ParsedField[];
  match?: {
    fundId: string | null;
    fundName: string | null;
    similarity: number;
    categoryId: string | null;
  } | null;
  sourceType?: "pdf" | "image";
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

const ACCEPTED_TYPES = ".pdf,.png,.jpg,.jpeg,.webp";
const MAX_SIZE_MB = 10;

const fieldLabel = (key: string): string => {
  const labels: Record<string, string> = {
    monthlyReturn: "תשואה חודשית",
    manager: "מנהל",
    classification: "סיווג",
    "returns.ytd2026": "מצטבר 2026",
    "returns.y2025": "2025",
    "returns.y2024": "2024",
    "returns.y2023": "2023",
    "returns.y2022": "2022",
    "returns.y2021": "2021",
    "returns.y2020": "2020",
    "returns.y2019": "2019",
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

/* ================================================================== */
/*  Upload Page Content                                                */
/* ================================================================== */

function UploadContent() {
  const clientKey = useClientKey();
  const brand = useBrand(clientKey);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileResult[]>([]);
  const [processing, setProcessing] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  // Get session password for API auth
  const [password, setPassword] = useState("");
  useEffect(() => {
    // Read from sessionStorage (set by ClientGate)
    const stored = sessionStorage.getItem(`client-auth-password-${clientKey}`);
    if (stored) setPassword(stored);
  }, [clientKey]);

  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const newFiles: FileResult[] = [];
    for (let i = 0; i < Math.min(selectedFiles.length, 10); i++) {
      const f = selectedFiles[i];
      // Validate type
      const validTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];
      if (!validTypes.includes(f.type)) {
        newFiles.push({
          id: `file-${Date.now()}-${i}`,
          fileName: f.name,
          status: "error",
          error: `סוג קובץ לא נתמך: ${f.type}`,
        });
        continue;
      }
      // Validate size
      if (f.size > MAX_SIZE_MB * 1024 * 1024) {
        newFiles.push({
          id: `file-${Date.now()}-${i}`,
          fileName: f.name,
          status: "error",
          error: `קובץ גדול מדי (${(f.size / 1024 / 1024).toFixed(1)}MB). מקסימום ${MAX_SIZE_MB}MB`,
        });
        continue;
      }
      newFiles.push({
        id: `file-${Date.now()}-${i}`,
        fileName: f.name,
        status: "queued",
      });
    }

    setFiles((prev) => [...prev, ...newFiles]);

    // Process queued files
    const validFiles = Array.from(selectedFiles).filter((f) => {
      const validTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];
      return validTypes.includes(f.type) && f.size <= MAX_SIZE_MB * 1024 * 1024;
    });
    if (validFiles.length > 0) {
      processFiles(validFiles, newFiles.filter((f) => f.status === "queued"));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientKey, password]);

  const processFiles = async (rawFiles: File[], fileResults: FileResult[]) => {
    setProcessing(true);
    for (let i = 0; i < rawFiles.length; i++) {
      const file = rawFiles[i];
      const resultId = fileResults[i]?.id;
      if (!resultId) continue;

      // Update status to uploading
      setFiles((prev) => prev.map((f) => f.id === resultId ? { ...f, status: "uploading" as const } : f));

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(
          `/api/parse?action=parse-file&client=${encodeURIComponent(clientKey)}`,
          {
            method: "POST",
            headers: { "x-admin-password": password },
            body: formData,
          }
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "שגיאה בשרת" }));
          setFiles((prev) =>
            prev.map((f) =>
              f.id === resultId ? { ...f, status: "error" as const, error: err.error || "שגיאה בפענוח" } : f
            )
          );
          continue;
        }

        const data = await res.json();
        setFiles((prev) =>
          prev.map((f) =>
            f.id === resultId
              ? {
                  ...f,
                  status: "parsed" as const,
                  fundName: data.fundName,
                  fundNameConfidence: data.fundNameConfidence,
                  fields: data.fields,
                  match: data.match,
                  sourceType: data.sourceType,
                }
              : f
          )
        );
      } catch {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === resultId ? { ...f, status: "error" as const, error: "שגיאה בחיבור לשרת" } : f
          )
        );
      }
    }
    setProcessing(false);
  };

  const saveDraft = async (fileResult: FileResult) => {
    if (!fileResult.fields || fileResult.fields.length === 0) return;

    setFiles((prev) => prev.map((f) => f.id === fileResult.id ? { ...f, status: "uploading" as const } : f));

    try {
      const res = await fetch(
        `/api/parse?action=save-draft&client=${encodeURIComponent(clientKey)}`,
        {
          method: "POST",
          headers: {
            "x-admin-password": password,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sourceText: fileResult.fileName,
            sourceType: "file",
            fundName: fileResult.fundName,
            fundNameConfidence: fileResult.fundNameConfidence,
            fields: fileResult.fields,
            match: fileResult.match,
          }),
        }
      );

      if (res.ok) {
        setFiles((prev) => prev.map((f) => f.id === fileResult.id ? { ...f, status: "saved" as const } : f));
      } else {
        const err = await res.json().catch(() => ({ error: "שגיאה" }));
        setFiles((prev) => prev.map((f) => f.id === fileResult.id ? { ...f, status: "error" as const, error: err.error } : f));
      }
    } catch {
      setFiles((prev) => prev.map((f) => f.id === fileResult.id ? { ...f, status: "error" as const, error: "שגיאה בשמירה" } : f));
    }
  };

  const saveAllDrafts = async () => {
    const parsedFiles = files.filter((f) => f.status === "parsed" && f.fields && f.fields.length > 0);
    if (parsedFiles.length === 0) return;
    setSavingAll(true);
    for (const f of parsedFiles) {
      await saveDraft(f);
    }
    setSavingAll(false);
  };

  const clearAll = () => {
    setFiles([]);
  };

  const parsedCount = files.filter((f) => f.status === "parsed").length;
  const savedCount = files.filter((f) => f.status === "saved").length;
  const errorCount = files.filter((f) => f.status === "error").length;

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "var(--bg-page)",
      direction: "rtl",
    }}>
      {/* Header */}
      <div style={{
        backgroundColor: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BrandLogo brand={brand} height={28} variant="light" />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
            העלאת דיווחים
          </span>
        </div>
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          v{brand.version}
        </span>
      </div>

      {/* Main content */}
      <div style={{ padding: "16px", maxWidth: 600, margin: "0 auto" }}>

        {/* Upload zone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = brand.primaryColor; }}
          onDragLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.style.borderColor = "var(--border)";
            handleFileSelect(e.dataTransfer.files);
          }}
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "2px dashed var(--border)",
            borderRadius: 12,
            padding: "32px 20px",
            textAlign: "center",
            cursor: "pointer",
            marginBottom: 16,
            transition: "border-color 0.2s",
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 8 }}>📤</div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>
            לחץ או גרור קבצים
          </p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 12px" }}>
            PDF · PNG · JPG — עד {MAX_SIZE_MB}MB לקובץ
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              style={{
                backgroundColor: brand.primaryColor,
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              📎 בחר קבצים
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}
              style={{
                backgroundColor: "transparent",
                color: brand.primaryColor,
                border: `1px solid ${brand.primaryColor}`,
                borderRadius: 8,
                padding: "10px 20px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              📷 צלם מסמך
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              handleFileSelect(e.target.files);
              e.target.value = ""; // allow re-select
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => {
              handleFileSelect(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* Summary bar */}
        {files.length > 0 && (
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            padding: "8px 12px",
            backgroundColor: "var(--bg-surface)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            fontSize: 11,
          }}>
            <div style={{ display: "flex", gap: 12 }}>
              {parsedCount > 0 && <span style={{ color: "#059669" }}>✓ {parsedCount} מוכנים</span>}
              {savedCount > 0 && <span style={{ color: "#3b82f6" }}>💾 {savedCount} נשמרו</span>}
              {errorCount > 0 && <span style={{ color: "#ef4444" }}>✗ {errorCount} שגיאות</span>}
              {processing && <span style={{ color: "var(--text-muted)" }}>⏳ מעבד...</span>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {parsedCount > 0 && (
                <button
                  onClick={saveAllDrafts}
                  disabled={savingAll}
                  style={{
                    backgroundColor: "#059669",
                    color: "#fff",
                    border: "none",
                    borderRadius: 5,
                    padding: "4px 12px",
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                    opacity: savingAll ? 0.5 : 1,
                  }}
                >
                  {savingAll ? "שומר..." : `💾 שמור הכל (${parsedCount})`}
                </button>
              )}
              <button
                onClick={clearAll}
                style={{
                  backgroundColor: "transparent",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: 5,
                  padding: "4px 12px",
                  fontSize: 10,
                  cursor: "pointer",
                }}
              >
                נקה
              </button>
            </div>
          </div>
        )}

        {/* File results */}
        {files.map((file) => (
          <FileCard
            key={file.id}
            file={file}
            onSave={() => saveDraft(file)}
            primaryColor={brand.primaryColor}
          />
        ))}

        {/* Empty state */}
        {files.length === 0 && (
          <div style={{
            textAlign: "center",
            padding: "40px 20px",
            color: "var(--text-muted)",
            fontSize: 12,
          }}>
            <p>העלה PDF או תמונה של פאקט שיט, דיווח חודשי, או צילום מסך</p>
            <p>הנתונים יישמרו כטיוטה לאישור ב-Admin</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  File Card Component                                                */
/* ================================================================== */

function FileCard({ file, onSave, primaryColor }: {
  file: FileResult;
  onSave: () => void;
  primaryColor: string;
}) {
  const statusConfig: Record<string, { icon: string; label: string; color: string }> = {
    queued: { icon: "⏳", label: "בתור", color: "var(--text-muted)" },
    uploading: { icon: "🔄", label: "מעבד...", color: "#f59e0b" },
    parsed: { icon: "✓", label: "מוכן", color: "#059669" },
    saved: { icon: "💾", label: "נשמר כטיוטה", color: "#3b82f6" },
    error: { icon: "✗", label: "שגיאה", color: "#ef4444" },
  };

  const s = statusConfig[file.status] || statusConfig.queued;

  return (
    <div style={{
      backgroundColor: "var(--bg-surface)",
      border: `1px solid ${file.status === "error" ? "#ef444430" : file.status === "saved" ? "#3b82f630" : "var(--border)"}`,
      borderRadius: 10,
      padding: 14,
      marginBottom: 10,
      opacity: file.status === "saved" ? 0.7 : 1,
    }}>
      {/* File header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{file.fileName.endsWith(".pdf") ? "📄" : "🖼️"}</span>
          <span style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-primary)",
            maxWidth: 200,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {file.fileName}
          </span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: s.color, display: "flex", alignItems: "center", gap: 4 }}>
          {s.icon} {s.label}
        </span>
      </div>

      {/* Error message */}
      {file.status === "error" && file.error && (
        <p style={{ fontSize: 11, color: "#ef4444", margin: "0 0 8px", padding: "6px 10px", backgroundColor: "#ef444410", borderRadius: 6 }}>
          {file.error}
        </p>
      )}

      {/* Parsed result */}
      {(file.status === "parsed" || file.status === "saved") && file.fields && (
        <div>
          {/* Fund name */}
          {file.fundName && (
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "6px 10px",
              backgroundColor: "var(--bg-input)",
              borderRadius: 6,
              marginBottom: 6,
              fontSize: 12,
            }}>
              <span style={{ fontWeight: 600 }}>{file.fundName}</span>
              {file.match?.fundName && (
                <span style={{ fontSize: 10, color: "#059669" }}>
                  → {file.match.fundName}
                </span>
              )}
            </div>
          )}

          {/* Fields */}
          {file.fields.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
              {file.fields.map((field, idx) => (
                <span
                  key={idx}
                  style={{
                    fontSize: 10,
                    padding: "3px 8px",
                    borderRadius: 6,
                    backgroundColor: field.confidence >= 0.7 ? "#05966915" : "#f59e0b15",
                    color: field.confidence >= 0.7 ? "#059669" : "#f59e0b",
                    fontWeight: 500,
                  }}
                >
                  {fieldLabel(field.key)}: {formatValue(field.key, field.value)}
                </span>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 8px" }}>
              לא נמצאו שדות לחילוץ
            </p>
          )}

          {/* Save button */}
          {file.status === "parsed" && file.fields.length > 0 && (
            <button
              onClick={onSave}
              style={{
                backgroundColor: primaryColor,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "6px 16px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                width: "100%",
              }}
            >
              💾 שמור כטיוטה ({file.fields.length} שדות)
            </button>
          )}
        </div>
      )}

      {/* Processing spinner */}
      {file.status === "uploading" && (
        <div style={{
          textAlign: "center",
          padding: "12px 0",
          fontSize: 12,
          color: "var(--text-muted)",
        }}>
          <div style={{
            width: "100%",
            height: 3,
            backgroundColor: "var(--border)",
            borderRadius: 2,
            overflow: "hidden",
          }}>
            <div style={{
              width: "60%",
              height: "100%",
              backgroundColor: primaryColor,
              borderRadius: 2,
              animation: "pulse 1.5s ease-in-out infinite",
            }} />
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 11 }}>מפענח באמצעות AI...</p>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Page Export                                                         */
/* ================================================================== */

function UploadPage() {
  const clientKey = useClientKey();
  const brand = useBrand(clientKey);

  // Check feature flag
  if (!brand.features?.mobileUpload && !brand.features?.aiParser) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--bg-page)",
        direction: "rtl",
      }}>
        <div style={{
          backgroundColor: "var(--bg-surface)",
          borderRadius: 12,
          padding: 40,
          textAlign: "center",
          maxWidth: 360,
        }}>
          <p style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 600 }}>
            העלאת קבצים לא זמינה
          </p>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            הפיצ׳ר לא מופעל עבור לקוח זה
          </p>
        </div>
      </div>
    );
  }

  return (
    <ClientGate clientKey={clientKey}>
      <UploadContent />
    </ClientGate>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>טוען...</div>}>
      <UploadPage />
    </Suspense>
  );
}
