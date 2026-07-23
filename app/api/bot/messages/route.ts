import { readSignedBotBody } from "@/lib/bot-auth";
import {
  appendMessage,
  getTicketByChannel,
  getUserIdByDiscordId,
} from "@/lib/tickets";
import type { TicketAuthorType } from "@/lib/tickets-shared";

// POST /api/bot/messages — mirror one Discord message into the ticket. Keyed by
// channel (all the bot's on_message has), and idempotent on discordMessageId so
// a replayed event never duplicates a row.
export const dynamic = "force-dynamic";

type MessageBody = {
  discordChannelId?: string;
  discordMessageId?: string;
  authorType?: TicketAuthorType;
  authorName?: string;
  authorDiscordId?: string;
  content?: string;
  attachments?: { url: string; name: string }[];
};

export async function POST(request: Request) {
  const parsed = await readSignedBotBody<MessageBody>(request);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }
  const body = parsed.data;
  if (!body.discordChannelId || !body.discordMessageId) {
    return Response.json(
      { error: "discordChannelId and discordMessageId required" },
      { status: 400 },
    );
  }

  const ticket = await getTicketByChannel(body.discordChannelId);
  if (!ticket) {
    return Response.json({ error: "no ticket for channel" }, { status: 404 });
  }

  const authorUserId = body.authorDiscordId
    ? await getUserIdByDiscordId(body.authorDiscordId)
    : null;

  await appendMessage({
    ticketId: ticket.id,
    authorType: body.authorType ?? "user",
    authorName: body.authorName || "Member",
    authorUserId,
    authorDiscordId: body.authorDiscordId ?? null,
    content: body.content ?? "",
    attachments: body.attachments ? JSON.stringify(body.attachments) : null,
    source: "discord",
    discordMessageId: body.discordMessageId,
  });

  return Response.json({ ok: true });
}
