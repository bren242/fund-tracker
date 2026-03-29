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

  return NextResponse.next();
}

export const config = {
  // Skip API routes, Next.js internals, static assets
  matcher: ["/((?!api|_next|favicon\\.ico|branding).*)"],
};
