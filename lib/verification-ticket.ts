import { and, eq, inArray, like } from "drizzle-orm";

import { botOutbox, programMemberships, supportTickets } from "@/db/schema";
import { enqueueBotJob } from "@/lib/bot-outbox";
import { getDb } from "@/lib/db";
import { getPlatformIdentity } from "@/lib/platform-identities";
import { PROGRAM_COLLEGIATE_ID } from "@/lib/programs";

// ---------------------------------------------------------------------------
// Opening a Discord support ticket for a member stuck in MANUAL_REVIEW (chiefly
// alumni without a school email). Discord is where members actually talk to
// staff, so the site enqueues a create_ticket job and the bot makes the channel
// — the mirror image of a user-opened ticket. Lives in its own module (not
// lib/tickets.ts) to avoid the tickets <-> bot-outbox import cycle.
// ---------------------------------------------------------------------------

const VERIFICATION_CATEGORY = "Verification";

/**
 * True when this member already has an open verification ticket, or a
 * create_ticket job for them is still queued (pending/claimed). The dedup guard
 * that keeps re-triggers from opening a second channel.
 */
export async function hasOpenVerificationTicket(
  userId: string,
): Promise<boolean> {
  const db = getDb();

  const open = await db
    .select({ id: supportTickets.id })
    .from(supportTickets)
    .where(
      and(
        eq(supportTickets.userId, userId),
        eq(supportTickets.category, VERIFICATION_CATEGORY),
        eq(supportTickets.status, "open"),
      ),
    )
    .limit(1);
  if (open.length) return true;

  // A job enqueued but not yet turned into a ticket. Only pending/claimed count
  // — a done job's ticket is covered by the check above, and a failed one is
  // terminal, so a fresh review should be allowed to enqueue again.
  const queued = await db
    .select({ id: botOutbox.id })
    .from(botOutbox)
    .where(
      and(
        eq(botOutbox.kind, "create_ticket"),
        inArray(botOutbox.status, ["pending", "claimed"]),
        like(botOutbox.payload, `%"registrantUserId":"${userId}"%`),
      ),
    )
    .limit(1);
  return queued.length > 0;
}

/**
 * Best-effort: open a Discord verification ticket for a MANUAL_REVIEW member.
 * Self-gates on the status, so it's safe to call unconditionally from the
 * Discord-link hook (which fires for every member). No-ops when they're not in
 * review, their Discord isn't linked yet (a later trigger retries), or a ticket
 * already exists. Never throws — a queue hiccup must not fail the registration
 * or the account link that triggered it.
 */
export async function ensureVerificationTicket(
  userId: string,
  reason: string,
): Promise<void> {
  try {
    const db = getDb();
    const membership = await db
      .select({ status: programMemberships.status })
      .from(programMemberships)
      .where(
        and(
          eq(programMemberships.userId, userId),
          eq(programMemberships.programId, PROGRAM_COLLEGIATE_ID),
        ),
      )
      .limit(1);
    if (membership[0]?.status !== "MANUAL_REVIEW") return;

    const discord = await getPlatformIdentity(userId, "discord");
    if (!discord?.externalId) return; // not linked yet — a later trigger retries
    if (await hasOpenVerificationTicket(userId)) return;

    await enqueueBotJob("create_ticket", {
      registrantUserId: userId,
      discordUserId: discord.externalId,
      discordUsername: discord.handle ?? null,
      category: VERIFICATION_CATEGORY,
      description: reason,
    });
  } catch (error) {
    console.error("ensureVerificationTicket failed:", error);
  }
}
