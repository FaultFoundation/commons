import type { getAuth } from "@/lib/auth";

type Auth = ReturnType<typeof getAuth>;
const TOKEN = "__Secure-better-auth.session_token";
const DATA = "__Secure-better-auth.session_data";

/** September's host-only → parent-domain migration left same-name cookies in
 * browsers. Better Auth takes the FIRST token but can serve a different cached
 * session for 60 seconds. Resolve duplicates against signed, live DB sessions;
 * never let that cache decide which account is authenticated. */
export async function migrateSessionCookies(headers: Headers, auth: Auth): Promise<{ headers: Headers; replacement?: string }> {
  const parts = (headers.get("cookie") ?? "").split(";").map(p => p.trim()).filter(Boolean);
  const name = (part: string) => part.slice(0, part.indexOf("="));
  const tokens = parts.filter(p => name(p) === TOKEN);
  if (tokens.length < 2) return { headers };

  const rest = parts.filter(p => name(p) !== TOKEN && name(p) !== DATA && !name(p).startsWith(`${DATA}.`));
  const clean = new Headers(headers);
  clean.set("cookie", rest.join("; "));
  // Bound the exceptional migration path even for deliberately oversized input.
  const candidates = [...new Set(tokens)];
  if (candidates.length > 4) return { headers: clean };
  const { baseURL } = await auth.$context;
  let selected: { cookie: string; createdAt: number; expiresAt: number } | null = null;
  for (const cookie of candidates) {
    const trial = new Headers(clean);
    trial.set("cookie", [...rest, cookie].join("; "));
    const url = new URL(`${baseURL.replace(/\/$/, "")}/get-session`);
    url.searchParams.set("disableCookieCache", "true");
    url.searchParams.set("disableRefresh", "true");
    // Use the router so nextCookies cannot forward trial deletions/refreshes to
    // the real browser. Better Auth still verifies the signature and DB expiry.
    const response = await auth.handler(new Request(url.toString(), { headers: trial }));
    if (!response.ok) throw new Error("Could not verify duplicate session cookies");
    const data = await response.json() as { session?: { createdAt: string; expiresAt: string }; user?: { id: string } } | null;
    if (!data?.session || !data.user) continue;
    const createdAt = new Date(data.session.createdAt).getTime();
    if (!selected || createdAt >= selected.createdAt) selected = { cookie, createdAt, expiresAt: new Date(data.session.expiresAt).getTime() };
  }
  if (selected) clean.set("cookie", [...rest, selected.cookie].join("; "));
  return {
    headers: clean,
    ...(selected ? { replacement: `${selected.cookie}; Max-Age=${Math.max(0, Math.floor((selected.expiresAt - Date.now()) / 1000))}; Domain=.fault.foundation; Path=/; HttpOnly; Secure; SameSite=Lax` } : {}),
  };
}

export async function migrateSessionHeaders(headers: Headers, auth: Auth): Promise<Headers> {
  return (await migrateSessionCookies(headers, auth)).headers;
}

/** Expire only the former host-scoped cookies. The current parent-domain
 * cookies, including newly issued login/2FA cookies, retain their lifetime. */
export function clearLegacySessionCookies(request: Request, response: Response) {
  if (new URL(request.url).hostname !== "commons.fault.foundation") return;
  // Do not erase a member's only (old host-only) credential on a cache-only
  // read. Clean up when auth issues a replacement OR explicitly expires it
  // (sign-out and the password-to-2FA transition must clear both scopes).
  const changed = response.headers.getSetCookie().some(cookie =>
    cookie.startsWith(`${TOKEN}=`) && /;\s*Domain=\.?fault\.foundation(?:;|$)/i.test(cookie));
  if (!changed) return;
  const names = new Set([TOKEN, DATA, "__Secure-better-auth.dont_remember",
    "__Secure-better-auth.two_factor", "__Secure-better-auth.trust_device"]);
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const cookieName = part.trim().split("=", 1)[0];
    if (cookieName.startsWith(`${DATA}.`) && /^\d+$/.test(cookieName.slice(DATA.length + 1))) names.add(cookieName);
  }
  for (const cookieName of names) {
    response.headers.append("Set-Cookie", `${cookieName}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`);
  }
}
