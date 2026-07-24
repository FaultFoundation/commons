import { getCloudflareContext } from "@opennextjs/cloudflare";

import { hmacHex, safeEqualHex } from "@/lib/hmac";

// Verifies the bot's calls to the site (app/api/bot/*). The bot signs POST
// bodies with BOT_API_SECRET (HMAC-SHA256 hex) in the X-Signature header; we
// recompute and compare in constant time. The outbox poll GET has no body, so
// it bears the same secret as a token (authorizeBotBearer).

export type BotBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

/**
 * Read + authenticate a signed bot request, returning the parsed JSON body.
 * The body is read once here (a Request body can't be read twice), so handlers
 * take the parsed value from this instead of calling request.json().
 */
export async function readSignedBotBody<T>(
  request: Request,
): Promise<BotBodyResult<T>> {
  const { env } = getCloudflareContext();
  const secret = env.BOT_API_SECRET;
  // Unconfigured: refuse rather than accept unsigned calls.
  if (!secret) {
    return { ok: false, status: 503, error: "bot bridge not configured" };
  }

  const signature = request.headers.get("X-Signature");
  if (!signature) {
    return { ok: false, status: 401, error: "missing signature" };
  }

  const raw = await request.text();
  const expected = await hmacHex(secret, raw);
  if (!safeEqualHex(signature, expected)) {
    return { ok: false, status: 401, error: "bad signature" };
  }

  try {
    return { ok: true, data: JSON.parse(raw) as T };
  } catch {
    return { ok: false, status: 400, error: "invalid JSON" };
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Authorize a bot GET (the outbox poll — no body to sign) with a bearer token
 * equal to BOT_API_SECRET, compared in constant time. Over HTTPS this is the
 * same trust as the HMAC used on the POST routes.
 */
export function authorizeBotBearer(
  request: Request,
): { ok: true } | { ok: false; status: number } {
  const { env } = getCloudflareContext();
  const secret = env.BOT_API_SECRET;
  if (!secret) return { ok: false, status: 503 };
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !timingSafeEqual(token, secret)) {
    return { ok: false, status: 401 };
  }
  return { ok: true };
}
