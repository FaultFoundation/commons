import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import {
  platformIdentities,
  supportTicketMessages,
  supportTicketNotes,
  supportTickets,
  user,
} from "@/db/schema";
import { getDb } from "@/lib/db";
import type {
  TicketAuthorType,
  TicketMessageSource,
} from "@/lib/tickets-shared";

// ---------------------------------------------------------------------------
// Support-ticket reads + the shared write helpers.
//
// D1 is the source of truth. These writers are the single path used by BOTH
// the dashboard server actions (app/admin/tickets/actions.ts) and the
// bot-facing API routes (app/api/bot/*) — so a ticket opened from Discord and
// one touched from the website go through the exact same rules. Authorization
// is enforced by the callers (requireStaffCapability / the bot secret), never
// here.
// ---------------------------------------------------------------------------

const assignee = alias(user, "assignee");

/** The opener's display name: their site name if linked, else the Discord one. */
const openerName = sql<string>`coalesce(${user.name}, ${supportTickets.discordUsername}, 'Unknown')`;

export type TicketSummary = {
  id: string;
  ticketNumber: number;
  status: string;
  priority: string | null;
  category: string | null;
  subject: string | null;
  openerName: string;
  assigneeName: string | null;
  assignedToUserId: string | null;
  lastActivityAt: Date;
  createdAt: Date;
};

export type TicketListFilter = {
  status?: "open" | "closed";
  assignedToUserId?: string;
  unassigned?: boolean;
};

/** Tickets for the queue, newest activity first. */
export async function listTickets(
  filter: TicketListFilter = {},
): Promise<TicketSummary[]> {
  const conditions = [];
  if (filter.status) conditions.push(eq(supportTickets.status, filter.status));
  if (filter.unassigned) conditions.push(isNull(supportTickets.assignedToUserId));
  else if (filter.assignedToUserId) {
    conditions.push(eq(supportTickets.assignedToUserId, filter.assignedToUserId));
  }

  return getDb()
    .select({
      id: supportTickets.id,
      ticketNumber: supportTickets.ticketNumber,
      status: supportTickets.status,
      priority: supportTickets.priority,
      category: supportTickets.category,
      subject: supportTickets.subject,
      openerName,
      assigneeName: assignee.name,
      assignedToUserId: supportTickets.assignedToUserId,
      lastActivityAt: supportTickets.lastActivityAt,
      createdAt: supportTickets.createdAt,
    })
    .from(supportTickets)
    .leftJoin(user, eq(user.id, supportTickets.userId))
    .leftJoin(assignee, eq(assignee.id, supportTickets.assignedToUserId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(supportTickets.lastActivityAt));
}

export type TicketDetail = TicketSummary & {
  discordUserId: string | null;
  discordUsername: string | null;
  discordChannelId: string | null;
  discordChannelName: string | null;
  userId: string | null;
  closeReason: string | null;
  closedAt: Date | null;
};

export async function getTicket(ticketId: string): Promise<TicketDetail | null> {
  const rows = await getDb()
    .select({
      id: supportTickets.id,
      ticketNumber: supportTickets.ticketNumber,
      status: supportTickets.status,
      priority: supportTickets.priority,
      category: supportTickets.category,
      subject: supportTickets.subject,
      openerName,
      assigneeName: assignee.name,
      assignedToUserId: supportTickets.assignedToUserId,
      lastActivityAt: supportTickets.lastActivityAt,
      createdAt: supportTickets.createdAt,
      discordUserId: supportTickets.discordUserId,
      discordUsername: supportTickets.discordUsername,
      discordChannelId: supportTickets.discordChannelId,
      discordChannelName: supportTickets.discordChannelName,
      userId: supportTickets.userId,
      closeReason: supportTickets.closeReason,
      closedAt: supportTickets.closedAt,
    })
    .from(supportTickets)
    .leftJoin(user, eq(user.id, supportTickets.userId))
    .leftJoin(assignee, eq(assignee.id, supportTickets.assignedToUserId))
    .where(eq(supportTickets.id, ticketId))
    .limit(1);
  return rows[0] ?? null;
}

export type TicketMessage = {
  id: string;
  authorType: string;
  authorName: string;
  authorUserId: string | null;
  content: string;
  attachments: string | null;
  source: string;
  createdAt: Date;
};

/** The mirrored conversation, oldest first. */
export async function getTicketMessages(
  ticketId: string,
): Promise<TicketMessage[]> {
  return getDb()
    .select({
      id: supportTicketMessages.id,
      authorType: supportTicketMessages.authorType,
      authorName: supportTicketMessages.authorName,
      authorUserId: supportTicketMessages.authorUserId,
      content: supportTicketMessages.content,
      attachments: supportTicketMessages.attachments,
      source: supportTicketMessages.source,
      createdAt: supportTicketMessages.createdAt,
    })
    .from(supportTicketMessages)
    .where(eq(supportTicketMessages.ticketId, ticketId))
    .orderBy(supportTicketMessages.createdAt);
}

export type TicketNote = {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: Date;
};

/** Internal notes, newest first. */
export async function getTicketNotes(ticketId: string): Promise<TicketNote[]> {
  return getDb()
    .select({
      id: supportTicketNotes.id,
      body: supportTicketNotes.body,
      authorName: user.name,
      createdAt: supportTicketNotes.createdAt,
    })
    .from(supportTicketNotes)
    .leftJoin(user, eq(user.id, supportTicketNotes.authorUserId))
    .where(eq(supportTicketNotes.ticketId, ticketId))
    .orderBy(desc(supportTicketNotes.createdAt));
}

// ---------------------------------------------------------------------------
// Writers (shared by dashboard actions + bot routes)
// ---------------------------------------------------------------------------

/**
 * The next display number. max()+1 races under concurrency, but the unique
 * index on ticket_number turns a race into an insert error the caller retries,
 * rather than a silent duplicate. Volume here is tiny.
 */
export async function getNextTicketNumber(): Promise<number> {
  const rows = await getDb()
    .select({ max: sql<number | null>`max(${supportTickets.ticketNumber})` })
    .from(supportTickets);
  return (rows[0]?.max ?? 0) + 1;
}

export type CreateTicketInput = {
  userId?: string | null;
  discordUserId?: string | null;
  discordUsername?: string | null;
  discordChannelId?: string | null;
  discordChannelName?: string | null;
  category?: string | null;
  subject?: string | null;
  /** Optional opening message (the modal description), stored as the first row. */
  firstMessage?: {
    authorName: string;
    content: string;
    authorType?: TicketAuthorType;
    authorDiscordId?: string | null;
    source?: TicketMessageSource;
    discordMessageId?: string | null;
  };
};

/** Create a ticket (and optionally its opening message). Retries once on a
    ticket-number collision. Returns the new id + number. */
export async function createTicket(
  input: CreateTicketInput,
): Promise<{ id: string; ticketNumber: number }> {
  const db = getDb();
  const now = new Date();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ticketNumber = await getNextTicketNumber();
    const id = crypto.randomUUID();
    try {
      await db.insert(supportTickets).values({
        id,
        ticketNumber,
        userId: input.userId ?? null,
        discordUserId: input.discordUserId ?? null,
        discordUsername: input.discordUsername ?? null,
        discordChannelId: input.discordChannelId ?? null,
        discordChannelName: input.discordChannelName ?? null,
        category: input.category ?? null,
        subject: input.subject ?? null,
        status: "open",
        lastActivityAt: now,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      // Unique collision on ticket_number (or channel) — recompute and retry.
      if (attempt < 2) continue;
      throw error;
    }

    if (input.firstMessage) {
      await appendMessage({
        ticketId: id,
        authorType: input.firstMessage.authorType ?? "user",
        authorName: input.firstMessage.authorName,
        authorDiscordId: input.firstMessage.authorDiscordId ?? null,
        authorUserId: input.userId ?? null,
        content: input.firstMessage.content,
        source: input.firstMessage.source ?? "discord",
        discordMessageId: input.firstMessage.discordMessageId ?? null,
      });
    }
    return { id, ticketNumber };
  }
  throw new Error("could not allocate a ticket number");
}

export type AppendMessageInput = {
  ticketId: string;
  authorType: TicketAuthorType;
  authorName: string;
  authorUserId?: string | null;
  authorDiscordId?: string | null;
  content: string;
  attachments?: string | null;
  source: TicketMessageSource;
  discordMessageId?: string | null;
};

/**
 * Append a message and bump the ticket's activity clock. Idempotent on
 * discord_message_id: replaying a mirror event never duplicates a row.
 * Returns the inserted message id, or null when the row already existed.
 */
export async function appendMessage(
  input: AppendMessageInput,
): Promise<string | null> {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date();

  const inserted = await db
    .insert(supportTicketMessages)
    .values({
      id,
      ticketId: input.ticketId,
      authorType: input.authorType,
      authorName: input.authorName,
      authorUserId: input.authorUserId ?? null,
      authorDiscordId: input.authorDiscordId ?? null,
      content: input.content,
      attachments: input.attachments ?? null,
      source: input.source,
      discordMessageId: input.discordMessageId ?? null,
      createdAt: now,
    })
    .onConflictDoNothing({ target: supportTicketMessages.discordMessageId })
    .returning({ id: supportTicketMessages.id });

  if (inserted.length === 0) return null; // duplicate mirror event

  await db
    .update(supportTickets)
    .set({ lastActivityAt: now, updatedAt: now, warningSent: false })
    .where(eq(supportTickets.id, input.ticketId));
  return id;
}

/** Attach the discord message id to a website-authored reply the bot posted,
    so the bot's own on_message mirror is deduped by the unique index. */
export async function linkMessageToDiscord(
  messageId: string,
  discordMessageId: string,
): Promise<void> {
  await getDb()
    .update(supportTicketMessages)
    .set({ discordMessageId })
    .where(eq(supportTicketMessages.id, messageId));
}

export type TicketPatch = {
  status?: "open" | "closed";
  priority?: string | null;
  category?: string | null;
  subject?: string | null;
  assignedToUserId?: string | null;
  discordChannelId?: string | null;
  discordChannelName?: string | null;
};

/** Generic metadata update. Always stamps updatedAt. */
export async function updateTicket(
  ticketId: string,
  patch: TicketPatch,
): Promise<void> {
  await getDb()
    .update(supportTickets)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(supportTickets.id, ticketId));
}

export async function closeTicket(
  ticketId: string,
  opts: { closedByUserId?: string | null; closeReason: string },
): Promise<void> {
  const now = new Date();
  await getDb()
    .update(supportTickets)
    .set({
      status: "closed",
      closedAt: now,
      closedByUserId: opts.closedByUserId ?? null,
      closeReason: opts.closeReason,
      updatedAt: now,
    })
    .where(eq(supportTickets.id, ticketId));
}

export async function reopenTicket(ticketId: string): Promise<void> {
  await getDb()
    .update(supportTickets)
    .set({
      status: "open",
      closedAt: null,
      closedByUserId: null,
      closeReason: null,
      updatedAt: new Date(),
    })
    .where(eq(supportTickets.id, ticketId));
}

export async function addTicketNote(
  ticketId: string,
  authorUserId: string,
  body: string,
): Promise<void> {
  await getDb().insert(supportTicketNotes).values({
    id: crypto.randomUUID(),
    ticketId,
    authorUserId,
    body,
    createdAt: new Date(),
  });
}

/** Lookup by mirrored Discord channel — the bot's key into a ticket. */
export async function getTicketByChannel(
  discordChannelId: string,
): Promise<{ id: string; status: string } | null> {
  const rows = await getDb()
    .select({ id: supportTickets.id, status: supportTickets.status })
    .from(supportTickets)
    .where(eq(supportTickets.discordChannelId, discordChannelId))
    .limit(1);
  return rows[0] ?? null;
}

/** Resolve a Discord snowflake to a linked site account, or null. Lets a ticket
    (or a mirrored message) attribute to the member's real profile when linked. */
export async function getUserIdByDiscordId(
  discordId: string,
): Promise<string | null> {
  const rows = await getDb()
    .select({ userId: platformIdentities.userId })
    .from(platformIdentities)
    .where(
      and(
        eq(platformIdentities.provider, "discord"),
        eq(platformIdentities.externalId, discordId),
      ),
    )
    .limit(1);
  return rows[0]?.userId ?? null;
}
