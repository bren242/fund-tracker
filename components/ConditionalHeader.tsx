"use client";

import { usePathname } from "next/navigation";
import AppHeader from "./AppHeader";

/**
 * Renders AppHeader everywhere EXCEPT routes that start with /fund-report.
 * Those are standalone print pages — no navigation needed.
 */
export default function ConditionalHeader() {
  const pathname = usePathname();
  if (pathname.startsWith("/fund-report")) return null;
  return <AppHeader fundCount={84} />;
}
