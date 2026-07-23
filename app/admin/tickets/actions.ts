"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireAdminUnlock } from "@/lib/admin-unlock";
import { getAuth } from "@/lib/auth";
import { requireStaffCapability } from "@/lib/staff";
import {
  addTicketNote,
  appendMessage,
  closeTicket as closeTicketRow,
  getTicket,
  getTicketMessages,
  linkMessageToDiscord,
  reopenTicket as reopenTicketRow,
  updateTicket,
} from "@/lib/tickets";
import {
  bridgeCloseChannel,
  bridgePostMessage,
  bridgeSendTranscript,
} from "@/lib/ticket-bridge";
import {
  TICKET_NOTE_MAX,
  TICKET_REPLY_MAX,
  formatTicketNumber,
  isTicketPriority,
} from "@/lib/tickets-shared";

// ---------------------------------------------------------------------------
// Support-ticket dashboard actions. Same contract as the other action files:
// re-check the session, re-derive authorization from D1 (staff capability AND a
// fresh 2FA unlock), mutate D1, then reflect the change into Discord through the
// bot bridge where there's a side effect. Nothing throws across the boundary.
// ---------------------------------------------------------------------------

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

type Actor = { userId: string; userName: string };

/** Every ticket action opens with this: staff + unlocked, or a plain error. */
async function requireActor(): Promise<
  ActionResult<{ actor: Actor }>
> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Your session expired. Sign in again." };
  const userId = session.user.id;

  const staff = await requireStaffCapability(userId, "manageTickets");
  if (!staff.ok) return { ok: false, error: staff.error };

  const unlock = await requireAdminUnlock(userId);
  if (!unlock.ok) return { ok: false, error: unlock.error };

  return { ok: true, actor: { userId, userName: session.user.name } };
}

function revalidateTicket(ticketId: string) {
  revalidatePath("/admin/tickets/", "layout");
  revalidatePath(`/admin/tickets/${ticketId}/`, "layout");
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

export async function claimTicket(ticketId: string): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;
  await updateTicket(ticketId, { assignedToUserId: gate.actor.userId });
  revalidateTicket(ticketId);
  return { ok: true };
}

export async function unassignTicket(ticketId: string): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;
  await updateTicket(ticketId, { assignedToUserId: null });
  revalidateTicket(ticketId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function setTicketPriority(
  ticketId: string,
  priority: string,
): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;
  const value = priority === "" ? null : priority;
  if (value !== null && !isTicketPriority(value)) {
    return { ok: false, error: "Unknown priority." };
  }
  await updateTicket(ticketId, { priority: value });
  revalidateTicket(ticketId);
  return { ok: true };
}

export async function setTicketCategory(
  ticketId: string,
  category: string,
): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;
  const value = category.trim().slice(0, 60);
  await updateTicket(ticketId, { category: value || null });
  revalidateTicket(ticketId);
  return { ok: true };
}

export async function setTicketSubject(
  ticketId: string,
  subject: string,
): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;
  const value = subject.trim().slice(0, 140);
  await updateTicket(ticketId, { subject: value || null });
  revalidateTicket(ticketId);
  return { ok: true };
}

export async function addNote(
  ticketId: string,
  body: string,
): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;
  const value = body.trim().slice(0, TICKET_NOTE_MAX);
  if (!value) return { ok: false, error: "Write a note first." };
  await addTicketNote(ticketId, gate.actor.userId, value);
  revalidateTicket(ticketId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------

export async function replyToTicket(
  ticketId: string,
  content: string,
): Promise<ActionResult<{ delivered: boolean }>> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  const value = content.trim();
  if (!value) return { ok: false, error: "Write a reply first." };
  if (value.length > TICKET_REPLY_MAX) {
    return {
      ok: false,
      error: `Replies are capped at ${TICKET_REPLY_MAX} characters (Discord's limit).`,
    };
  }

  const ticket = await getTicket(ticketId);
  if (!ticket) return { ok: false, error: "That ticket no longer exists." };

  // Store first, so the reply is never lost even if Discord is unreachable.
  const messageId = await appendMessage({
    ticketId,
    authorType: "staff",
    authorName: gate.actor.userName,
    authorUserId: gate.actor.userId,
    content: value,
    source: "website",
  });

  let delivered = false;
  if (messageId && ticket.discordChannelId) {
    const result = await bridgePostMessage({
      ticketId,
      discordChannelId: ticket.discordChannelId,
      authorName: gate.actor.userName,
      content: value,
    });
    delivered = result.delivered;
    // Tie our row to the Discord message so the bot's own mirror is deduped.
    if (result.discordMessageId) {
      await linkMessageToDiscord(messageId, result.discordMessageId);
    }
  }

  revalidateTicket(ticketId);
  return { ok: true, delivered };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function closeTicket(ticketId: string): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  const ticket = await getTicket(ticketId);
  if (!ticket) return { ok: false, error: "That ticket no longer exists." };

  await closeTicketRow(ticketId, {
    closedByUserId: gate.actor.userId,
    closeReason: "manual",
  });
  if (ticket.discordChannelId) {
    await bridgeCloseChannel({
      ticketId,
      discordChannelId: ticket.discordChannelId,
      closedByName: gate.actor.userName,
    });
  }
  revalidateTicket(ticketId);
  return { ok: true };
}

export async function reopenTicket(ticketId: string): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;
  await reopenTicketRow(ticketId);
  revalidateTicket(ticketId);
  return { ok: true };
}

export async function exportTranscript(
  ticketId: string,
): Promise<ActionResult<{ delivered: boolean }>> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  const ticket = await getTicket(ticketId);
  if (!ticket) return { ok: false, error: "That ticket no longer exists." };
  if (!ticket.discordUserId) {
    return {
      ok: false,
      error: "This ticket has no Discord user to DM the transcript to.",
    };
  }

  const messages = await getTicketMessages(ticketId);
  const transcript = buildTranscript(ticket, messages);
  const result = await bridgeSendTranscript({
    ticketId,
    discordUserId: ticket.discordUserId,
    filename: `ticket-${String(ticket.ticketNumber).padStart(4, "0")}.txt`,
    content: transcript,
  });
  if (!result.delivered) {
    return {
      ok: false,
      error: "Couldn't reach the Discord bot to deliver the transcript.",
    };
  }
  return { ok: true, delivered: true };
}

/** Plain-text transcript, generated from D1 (we hold the whole conversation). */
function buildTranscript(
  ticket: Awaited<ReturnType<typeof getTicket>> & object,
  messages: Awaited<ReturnType<typeof getTicketMessages>>,
): string {
  const header = [
    `Support Ticket ${formatTicketNumber(ticket.ticketNumber)}${
      ticket.category ? ` — ${ticket.category}` : ""
    }`,
    `Opened by ${ticket.openerName} on ${ticket.createdAt.toISOString()}`,
    `Status: ${ticket.status}`,
    "",
    "----------------------------------------",
    "",
  ];
  const body = messages.map((message) => {
    const stamp = message.createdAt.toISOString();
    return `[${stamp}] ${message.authorName} (${message.authorType}):\n${message.content}\n`;
  });
  return [...header, ...body].join("\n");
}
