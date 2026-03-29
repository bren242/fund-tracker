"use client";

import { useState } from "react";

/**
 * Password input with show/hide toggle (eye icon).
 * RTL-safe: toggle button positioned on the left (start) side.
 */
export default function PasswordInput({
  value,
  onChange,
  placeholder = "סיסמה",
  autoFocus,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  style?: React.CSSProperties;
}) {
  const [show, setShow] = useState(false);

  return (
    <div style={{ position: "relative", width: "100%", ...style }}>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{
          width: "100%",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "10px 40px 10px 14px",
          textAlign: "center",
          fontSize: 14,
          backgroundColor: "var(--bg-input)",
          color: "var(--text-primary)",
          boxSizing: "border-box",
        }}
      />
      <button
        type="button"
        onClick={() => setShow((p) => !p)}
        tabIndex={-1}
        style={{
          position: "absolute",
          left: 8,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 4,
          color: "var(--text-muted)",
          fontSize: 16,
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
        }}
        title={show ? "הסתר סיסמה" : "הצג סיסמה"}
      >
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
