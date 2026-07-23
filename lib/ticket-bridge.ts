import { getCloudflareContext } from "@opennextjs/cloudflare";

import { hmacHex } from "@/lib/hmac";

// ---------------------------------------------------------------------------
// Website -> bot bridge. The Discord bot runs an in-process HTTP server (the
// Givebutter webhook pattern); these are the calls that make a dashboard action
// take effect in Discord: post a staff reply into the channel, close the
// channel, DM a transcript.
//
// Every call is best-effort and never throws. D1 is already the source of
// truth, so a bridge that's down (or not yet configured) degrades to "stored,
// not yet reflected in Discord" — it must never fail the dashboard action.
// Requests are HMAC-signed with BOT_BRIDGE_SECRET (hex digest), which the bot
// verifies with hmac.compare_digest, matching its Givebutter handler.
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 4000;

function config(): { url: string; secret: string } | null {
  const { env } = getCloudflareContext();
  if (!env.BOT_BRIDGE_URL || !env.BOT_BRIDGE_SECRET) return null;
  return {
    url: env.BOT_BRIDGE_URL.replace(/\/+$/, ""),
    secret: env.BOT_BRIDGE_SECRET,
  };
}

/** POST a signed JSON body to a bot bridge path. Returns parsed JSON or null. */
async function call<T = unknown>(
  path: string,
  payload: unknown,
): Promise<T | null> {
  const cfg = config();
  if (!cfg) return null;
  try {
    const body = JSON.stringify(payload);
    const signature = await hmacHex(cfg.secret, body);
    const res = await fetch(`${cfg.url}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Signature": signature },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => ({}))) as T;
  } catch (error) {
    console.error(`ticket bridge ${path} failed:`, error);
    return null;
  }
}

/** Post a staff reply into the ticket's Discord channel. Returns the created
    Discord message id (so the mirror can be deduped) when delivered. */
export async function bridgePostMessage(input: {
  ticketId: string;
  discordChannelId: string;
  authorName: string;
  content: string;
}): Promise<{ delivered: boolean; discordMessageId?: string }> {
  const result = await call<{ discordMessageId?: string }>(
    "/tickets/message",
    input,
  );
  if (!result) return { delivered: false };
  return { delivered: true, discordMessageId: result.discordMessageId };
}

/** Make the Discord channel read-only and move it to the closed category. */
export async function bridgeCloseChannel(input: {
  ticketId: string;
  discordChannelId: string;
  closedByName: string;
}): Promise<{ delivered: boolean }> {
  return { delivered: (await call("/tickets/close", input)) !== null };
}

/** DM the (website-generated) transcript to the ticket opener. */
export async function bridgeSendTranscript(input: {
  ticketId: string;
  discordUserId: string;
  filename: string;
  content: string;
}): Promise<{ delivered: boolean }> {
  return { delivered: (await call("/tickets/transcript-dm", input)) !== null };
}
