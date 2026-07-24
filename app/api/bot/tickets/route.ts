import { readSignedBotBody } from "@/lib/bot-auth";
import { createTicket, getUserIdByDiscordId } from "@/lib/tickets";

// POST /api/bot/tickets — the bot reports that a Discord member opened a ticket.
// Returns the assigned ticket id + number so the bot can name the channel
// (ticket-<user>-0007) and then attach it via /api/bot/tickets/{id}/channel.
export const dynamic = "force-dynamic";

type CreateBody = {
  discordUserId?: string;
  discordUsername?: string;
  // Set at creation (the bot already made the channel), so a ticket is never
  // left without its channel link — that link is how a Discord-side close finds
  // and closes the row.
  discordChannelId?: string;
  discordChannelName?: string;
  category?: string;
  subject?: string;
  /** The opener's modal text — stored as the first (user) message. */
  description?: string;
};

export async function POST(request: Request) {
  const parsed = await readSignedBotBody<CreateBody>(request);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }
  const body = parsed.data;
  if (!body.discordUserId) {
    return Response.json({ error: "discordUserId required" }, { status: 400 });
  }

  const userId = await getUserIdByDiscordId(body.discordUserId);
  const openerName = body.discordUsername || "Member";

  const { id, ticketNumber } = await createTicket({
    userId,
    discordUserId: body.discordUserId,
    discordUsername: body.discordUsername ?? null,
    discordChannelId: body.discordChannelId ?? null,
    discordChannelName: body.discordChannelName ?? null,
    category: body.category ?? null,
    subject: body.subject ?? null,
    firstMessage: body.description
      ? {
          authorType: "user",
          authorName: openerName,
          authorDiscordId: body.discordUserId,
          content: body.description,
          source: "discord",
        }
      : undefined,
  });

  return Response.json({ ticketId: id, ticketNumber });
}
