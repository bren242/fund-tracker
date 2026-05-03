"use client";

import { useState } from "react";

export default function CompareDeepData() {
  const [open, setOpen] = useState(false);

  return (
    <div className="cmp-deep">
      <button className="cmp-deep-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? "הסתר נתונים מלאים ▲" : "הצג נתונים מלאים — תשואות שנתיות, שארפ, סטיית תקן ▼"}
      </button>
      {open && (
        <div className="cmp-deep-body">
          <p className="cmp-deep-soon">פיצ׳ר זה יושק בקרוב</p>
        </div>
      )}
    </div>
  );
}
