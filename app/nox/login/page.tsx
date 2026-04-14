"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NoxLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/nox-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace("/nox");
      } else {
        setError("סיסמה שגויה");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", backgroundColor: "#f5f5f7",
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          backgroundColor: "#ffffff", borderRadius: 14, padding: "40px 36px",
          width: "90%", maxWidth: 360,
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          border: "1px solid #e8e8e8", textAlign: "center",
        }}
      >
        <div style={{ marginBottom: 28 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            backgroundColor: "#1B3A2F", margin: "0 auto 16px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 700, color: "#B8975A", fontFamily: "serif",
          }}>N</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#1d1d1f", margin: "0 0 4px" }}>NOX</p>
          <p style={{ fontSize: 13, color: "#999", margin: 0 }}>הזן סיסמה לכניסה</p>
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="סיסמה"
          dir="rtl"
          autoFocus
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "10px 14px", borderRadius: 8, marginBottom: 12,
            border: "1px solid #e0e0e0", fontSize: 14,
            backgroundColor: "#fafafa", color: "#1d1d1f", outline: "none",
          }}
          onFocus={(e) => (e.target.style.borderColor = "#1B3A2F")}
          onBlur={(e) => (e.target.style.borderColor = "#e0e0e0")}
        />

        {error && (
          <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%", padding: "10px 0", borderRadius: 8, border: "none",
            backgroundColor: "#1B3A2F", color: "#ffffff",
            fontSize: 14, fontWeight: 600, cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1, transition: "opacity 0.15s",
          }}
        >
          {loading ? "..." : "כניסה"}
        </button>
      </form>
    </div>
  );
}
