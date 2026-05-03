"use client";
import { usePathname } from "next/navigation";

export default function BackNav() {
  const path = usePathname();
  return (
    <a className="v2-back-nav" href={path}>
      <span className="v2-back-arrow">←</span>
      <span className="v2-back-label">חזרה לרשימת הקרנות</span>
    </a>
  );
}
