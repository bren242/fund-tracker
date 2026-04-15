"use client";

import { useState, useEffect } from "react";
import { useBrand } from "@/lib/useBrand";
import BrandLogo from "@/components/BrandLogo";
import PasswordInput from "@/components/PasswordInput";
import NoxChangelogModal from "@/components/NoxChangelogModal";

/**
 * Password gate for public pages (/ and /charts).
 * Uses the client admin password stored in that client's funds.json.
 * Persists auth in sessionStorage per clientKey.
 */
export default function ClientGate({ clientKey, children }: { clientKey: string; children: React.ReactNode }) {
  const SESSION_KEY = `client-auth-${clientKey}`;
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const brand = useBrand(clientKey);

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      setAuthed(true);
    } else {
      setAuthed(false);
    }
  }, [SESSION_KEY]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await fetch(`/api/client-auth?client=${encodeURIComponent(clientKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      sessionStorage.setItem(SESSION_KEY, "1");
      sessionStorage.setItem(`client-auth-password-${clientKey}`, password);
      setAuthed(true);
    } else {
      setError("סיסמה שגויה");
    }
  };

  // Still checking
  if (authed === null) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>טוען...</div>;
  }

  // Authenticated — show content
  if (authed) {
    return (
      <>
        {children}
        <NoxChangelogModal clientKey={clientKey} />
      </>
    );
  }

  // Login screen
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--bg-page)" }}>
      <form onSubmit={handleLogin} style={{ backgroundColor: "var(--bg-surface)", borderRadius: 14, padding: 40, width: "90%", maxWidth: 360, boxShadow: "var(--shadow-card)", border: "1px solid var(--border)", textAlign: "center" }}>
        <div style={{ marginBottom: 24 }}>
          <BrandLogo brand={brand} height={36} variant="light" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>
            {brand.mainTitle}
          </p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>הזן סיסמה לצפייה בדוח</p>
        </div>
        <PasswordInput value={password} onChange={setPassword} autoFocus style={{ marginBottom: 12 }} />
        {error && <p style={{ color: "var(--negative)", fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <button
          type="submit"
          style={{ width: "100%", backgroundColor: brand.primaryColor, color: "#fff", borderRadius: 8, padding: "10px 0", fontWeight: 700, border: "none", cursor: "pointer", fontSize: 14, letterSpacing: 0.3 }}
        >
          כניסה
        </button>
        <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "16px 0 0", opacity: 0.6 }}>Developed by Brenner</p>
      </form>
    </div>
  );
}
