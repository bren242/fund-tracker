"use client";

export default function BackNav({ client = "green" }: { client?: string }) {
  return (
    <a className="v2-back-nav" href={`/${client}`}>
      <span className="v2-back-arrow">←</span>
      <span className="v2-back-label">חזרה לדוח הקרנות</span>
    </a>
  );
}
