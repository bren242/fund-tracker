/**
 * Client key helpers.
 * Every client (NOX, GREEN, etc.) is identified by a simple string key.
 * It comes from the URL param ?client=xxx and defaults to "nox".
 */

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
