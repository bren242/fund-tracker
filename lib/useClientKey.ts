"use client";

import { useSearchParams } from "next/navigation";
import { sanitizeKey } from "./clientKey";

/**
 * Client-side hook: reads ?client=xxx from URL, defaults to "nox".
 * Also provides a helper to build URLs that preserve the clientKey.
 */
export function useClientKey(): string {
  const params = useSearchParams();
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
