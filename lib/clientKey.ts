/**
 * Client key helpers.
 * Every client (NOX, GREEN, etc.) is identified by a simple string key.
 * Single source of truth for known client keys.
 */

/** Known client keys — used by middleware and useClientKey */
export const CLIENT_KEYS = new Set(["green", "nox"]);

/** Extract clientKey from a NextRequest (server-side) */
export function getClientKeyFromRequest(url: string): string {
  try {
    const u = new URL(url);
    return sanitizeKey(u.searchParams.get("client") || "green");
  } catch {
    return "green";
  }
}

/** Sanitize key — only lowercase letters, numbers, hyphens */
export function sanitizeKey(raw: string): string {
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return cleaned || "green";
}
