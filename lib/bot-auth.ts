import { getCloudflareContext } from "@opennextjs/cloudflare";

import { hmacHex, safeEqualHex } from "@/lib/hmac";

// Verifies bot -> website calls (app/api/bot/*). The bot signs the raw request
// body with BOT_API_SECRET (HMAC-SHA256 hex) in the X-Signature header; we
// recompute and compare in constant time. Kept separate from BOT_BRIDGE_SECRET
// (the other direction) so the two rotate independently.

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
