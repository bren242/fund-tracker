"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { sanitizeKey, CLIENT_KEYS } from "./clientKey";

/**
 * Client-side hook: resolves the active client key.
 *
 * Priority:
 *  1. Pathname prefix  — /green, /nox/compare  → "green", "nox"
 *  2. ?client= param   — /?client=nox          → "nox"
 *  3. Default           — "green"
 */
export function useClientKey(): string {
  const pathname = usePathname();
  const params = useSearchParams();

  // 1. Check pathname prefix (browser still shows /nox even after rewrite)
  const firstSegment = pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if (firstSegment && CLIENT_KEYS.has(firstSegment)) {
    return firstSegment;
  }

  // 2. Fallback to ?client= param
  return sanitizeKey(params.get("client") || "green");
}

/** Build a query string param for the current client */
export function clientParam(clientKey: string): string {
  return `client=${encodeURIComponent(clientKey)}`;
}

/** Append clientKey to an existing URL path (preserves existing params) */
export function withClient(path: string, clientKey: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}client=${encodeURIComponent(clientKey)}`;
}
