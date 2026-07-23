import { readSignedBotBody } from "@/lib/bot-auth";
import { updateTicket } from "@/lib/tickets";

// POST /api/bot/tickets/{ticketId}/channel — attach the Discord channel the bot
// created for a ticket. Split from creation because the bot names the channel
// with the ticket number, which only exists after the ticket row does.
export const dynamic = "force-dynamic";

type ChannelBody = { discordChannelId?: string; discordChannelName?: string };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  const parsed = await readSignedBotBody<ChannelBody>(request);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: parsed.status });
  }
  const { ticketId } = await params;
  if (!parsed.data.discordChannelId) {
    return Response.json(
      { error: "discordChannelId required" },
      { status: 400 },
    );
  }

  await updateTicket(ticketId, {
    discordChannelId: parsed.data.discordChannelId,
    discordChannelName: parsed.data.discordChannelName ?? null,
  });
  return Response.json({ ok: true });
}
