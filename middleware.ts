import { NextRequest, NextResponse } from "next/server";
import { CLIENT_KEYS } from "./lib/clientKey";

/**
 * Client-routing middleware.
 * Rewrites clean paths like /green or /nox/compare into
 * the internal form /?client=green or /compare?client=nox.
 *
 * Existing ?client= param still works as fallback.
 */

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Extract first path segment
  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0]?.toLowerCase();

  // ── NOX maintenance ───────────────────────────────────────
  if (firstSegment === "nox") {
    return new NextResponse(
      `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>תחזוקה</title>
      <style>body{margin:0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f7;}
      .box{text-align:center;padding:40px;background:#fff;border-radius:14px;border:1px solid #e8e8e8;box-shadow:0 4px 24px rgba(0,0,0,0.07);}
      h1{font-size:18px;font-weight:600;color:#1d1d1f;margin:0 0 8px;}p{font-size:14px;color:#888;margin:0;}</style></head>
      <body><div class="box"><h1>המערכת בתחזוקה</h1><p>נחזור בקרוב</p></div></body></html>`,
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
  // ───────────────────────────────────────────────────────────

  if (firstSegment && CLIENT_KEYS.has(firstSegment)) {
    // Build internal path without client prefix
    const restPath = "/" + segments.slice(1).join("/") || "/";

    const url = req.nextUrl.clone();
    url.pathname = restPath;
    url.searchParams.set("client", firstSegment);

    return NextResponse.rewrite(url);
  }

  // Block bare "/" and unknown paths (no valid client) — show 404
  // Allow /admin with ?client= param, and internal pages that already have ?client=
  const hasClientParam = req.nextUrl.searchParams.has("client");
  const isAdminOrInternal = pathname === "/admin" || pathname === "/compare" || pathname === "/charts" || pathname === "/upload" || pathname === "/data-completion" || pathname === "/analysis" || pathname === "/fund-status" || pathname === "/consistency";

  if (!hasClientParam && !isAdminOrInternal && pathname === "/") {
    // Rewrite to Next.js not-found page
    const url = req.nextUrl.clone();
    url.pathname = "/_not-found";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip API routes, Next.js internals, static assets
  matcher: ["/((?!api|_next|favicon\\.ico|branding).*)"],
};
