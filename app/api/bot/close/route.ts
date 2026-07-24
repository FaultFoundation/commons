import { readSignedBotBody } from "@/lib/bot-auth";
import { enqueueBotJob } from "@/lib/bot-outbox";
import {
  buildTranscript,
  closeTicket,
  getTicket,
  getTicketByChannel,
  getTicketMessages,
} from "@/lib/tickets";

// POST /api/bot/close — a ticket was closed from Discord (/close or the
// inactivity auto-close). Marks D1 closed and runs the SAME teardown as a
// website close: DM the transcript, then delete the channel — both via the
// outbox, so the channel goes away after the /close command's own reply rather
// than mid-command.
export const dynamic = "force-dynamic";

type CloseBody = { discordChannelId?: string; closeReason?: string };

export async function POST(request: Request) {
  const parsed = await readSignedBotBody<CloseBody>(request);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }
  if (!parsed.data.discordChannelId) {
    return Response.json(
      { error: "discordChannelId required" },
      { status: 400 },
    );
  }

  const found = await getTicketByChannel(parsed.data.discordChannelId);
  if (!found) {
    return Response.json({ error: "no ticket for channel" }, { status: 404 });
  }
  // Already closed — a repeat mirror must not re-DM a transcript or re-enqueue
  // a delete.
  if (found.status === "closed") return Response.json({ ok: true });

  await closeTicket(found.id, {
    closeReason: parsed.data.closeReason || "discord",
  });

  const ticket = await getTicket(found.id);
  if (ticket?.discordUserId) {
    const messages = await getTicketMessages(found.id);
    await enqueueBotJob(
      "send_transcript",
      {
        discordUserId: ticket.discordUserId,
        filename: `ticket-${String(ticket.ticketNumber).padStart(4, "0")}.txt`,
        content: buildTranscript(ticket, messages),
      },
      found.id,
    );
  }
  if (ticket?.discordChannelId) {
    await enqueueBotJob(
      "close_channel",
      { discordChannelId: ticket.discordChannelId },
      found.id,
    );
  }

  return Response.json({ ok: true });
}
