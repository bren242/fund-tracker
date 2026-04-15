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
