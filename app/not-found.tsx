export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f8fafc",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        direction: "rtl",
      }}
    >
      <div
        style={{
          textAlign: "center",
          maxWidth: 440,
          padding: "48px 32px",
          backgroundColor: "#fff",
          borderRadius: 16,
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          border: "1px solid #e2e8f0",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>404</div>
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#1e293b",
            margin: "0 0 12px",
          }}
        >
          Fund Tracker
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "#64748b",
            lineHeight: 1.7,
            margin: "0 0 24px",
          }}
        >
          הגעת למערכת מעקב קרנות.
          <br />
          נא לוודא שהכתובת כוללת את שם המותג.
        </p>
        <div
          style={{
            backgroundColor: "#f1f5f9",
            borderRadius: 8,
            padding: "12px 16px",
            fontSize: 13,
            color: "#475569",
            direction: "ltr",
            fontFamily: "monospace",
          }}
        >
          example.com/<strong>brand-name</strong>
        </div>
      </div>
    </div>
  );
}
