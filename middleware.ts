import { NextResponse, type NextRequest } from "next/server";

/**
 * Trailing-slash redirects, minus /api/*. Next's built-in enforcement
 * (trailingSlash: true) also 308s API routes to trailing-slash URLs, which
 * better-auth's router 404s — so sign-in/out died under `next dev` (the
 * OpenNext worker never applied the redirect to API routes, hence prod
 * worked). skipTrailingSlashRedirect hands the job to us instead.
 */
/** Request header carrying the resolved pathname down to server components. */
export const PATHNAME_HEADER = "x-ff-pathname";

/** The portal used to live under /dashboard; keep those URLs working. */
const LEGACY_PATHS: Record<string, string> = {
  "/dashboard/": "/home/",
  "/dashboard/accounts/": "/account/",
  "/dashboard/register/": "/account/setup/",
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const moved = LEGACY_PATHS[pathname];
  if (moved) {
    const url = new URL(request.url);
    url.pathname = moved;
    return NextResponse.redirect(url, 308);
  }

  if (
    !pathname.endsWith("/") &&
    !pathname.startsWith("/api/") &&
    !/\.[^/]*$/.test(pathname)
  ) {
    // Plain URL, not request.nextUrl.clone(): NextURL re-normalizes the
    // pathname on serialize and strips the very slash we're adding.
    const url = new URL(request.url);
    url.pathname = `${pathname}/`;
    return NextResponse.redirect(url, 308);
  }

  // Server components can't see their own URL. AdminGate needs it to build the
  // "come back here after unlocking" link, so publish it as a request header
  // rather than threading a prop through every admin page (which the next new
  // admin page would forget).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PATHNAME_HEADER, pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Skip API routes, Next internals, and anything with a file extension —
  // the function re-checks, but the matcher keeps middleware off the hot
  // path for assets.
  matcher: ["/((?!api/|_next/|wp-content/|.*\\.).*)"],
};
