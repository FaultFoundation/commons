import { readSignedBotBody } from "@/lib/bot-auth";
import { closeTicket, getTicketByChannel } from "@/lib/tickets";

// POST /api/bot/close — a ticket was closed from Discord (/close or the
// inactivity auto-close). Marks the mirrored ticket closed in D1.
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

  const ticket = await getTicketByChannel(parsed.data.discordChannelId);
  if (!ticket) {
    return Response.json({ error: "no ticket for channel" }, { status: 404 });
  }

  await closeTicket(ticket.id, {
    closeReason: parsed.data.closeReason || "discord",
  });
  return Response.json({ ok: true });
}
