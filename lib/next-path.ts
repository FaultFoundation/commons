// Post-auth redirect targets (`/login/?next=…`). Shared by the auth pages and
// anything that links into them; no server-only imports.

// Control characters, which could smuggle a header break into a redirect.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Accepts only same-origin absolute paths, so a `next` value can never send a
 * member to another site after signing in. Rejects scheme-relative `//host`
 * and backslash variants (browsers normalize `/\` to `//`).
 */
export function sanitizeNextPath(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.includes("\\")) return null;
  if (CONTROL_CHARS.test(raw)) return null;
  return raw.slice(0, 512);
}

/** Carries a `next` through a link between the auth pages. */
export function withNext(path: string, next: string | null | undefined): string {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}
