import { getAuth } from "@/lib/auth";
import { clearLegacySessionCookies, migrateSessionCookies } from "@/lib/session-cookie-migration";

/**
 * Better Auth's router, plus CORS for the marketing site.
 *
 * fault.foundation's header renders the signed-in avatar by calling
 * get-session here from the browser. That's a cross-ORIGIN request (same site,
 * different host), so it needs both an explicit allow-origin and
 * allow-credentials — a wildcard is invalid once credentials are involved,
 * which is why the origin is echoed back from an allowlist rather than
 * hardcoded to one value.
 *
 * The allowlist is intentionally separate from `trustedOrigins` in lib/auth.ts
 * even though the entries overlap: that list governs Better Auth's own CSRF
 * origin check on state-changing calls, this one governs whether the browser
 * will hand the response to the caller at all. Both have to name an origin for
 * it to work, and neither is a substitute for the other.
 */
const ALLOWED_ORIGINS = new Set(
  process.env.NODE_ENV === "development"
    ? [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3999",
      ]
    : ["https://fault.foundation", "https://commons.fault.foundation"],
);

function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  // Vary unconditionally: the response differs by Origin even when we decline,
  // and a cache that missed that would serve one site's headers to another.
  headers.set("Vary", "Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  return headers;
}

async function handler(request: Request) {
  const auth = getAuth();
  const migration = await migrateSessionCookies(request.headers, auth);
  // NextRequest and workerd's Request are different implementations; cloning
  // with new Request(request) fails in production. Copy URL/body explicitly,
  // and leave the normal single-cookie request untouched.
  const authRequest = migration.headers === request.headers ? request : new Request(request.url, {
    method: request.method,
    headers: migration.headers,
    ...(request.method === "GET" || request.method === "HEAD" ? {} : { body: await request.arrayBuffer() }),
  });
  const response = await auth.handler(authRequest);
  // Preserve explicit sign-out/challenge expirations and real login renewals.
  // Otherwise promote the validated survivor before removing the old host cookie.
  if (response.ok && migration.replacement && !response.headers.getSetCookie().some(cookie =>
    cookie.startsWith("__Secure-better-auth.session_token="))) {
    response.headers.append("Set-Cookie", migration.replacement);
  }
  clearLegacySessionCookies(request, response);
  response.headers.set("Cache-Control", "private, no-store");
  const cors = corsHeaders(request);
  // Copy onto the existing response so Better Auth's own Set-Cookie headers
  // survive — building a new Response from `response.headers` would work too,
  // but mutating in place can't drop one by accident.
  cors.forEach((value, key) => response.headers.set(key, value));
  return response;
}

export async function OPTIONS(request: Request) {
  const headers = corsHeaders(request);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set(
    "Access-Control-Allow-Headers",
    request.headers.get("access-control-request-headers") ?? "content-type",
  );
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(null, { status: 204, headers });
}

export { handler as GET, handler as POST };
