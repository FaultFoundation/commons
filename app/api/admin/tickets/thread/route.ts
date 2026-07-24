import { requireStaffApi } from "@/lib/admin-api";
import { getTicket, getTicketMessages } from "@/lib/tickets";

// GET /api/admin/tickets/thread?ticketId=… — the conversation, polled by the
// client. A plain D1 read + JSON (no React render), so it stays well under the
// Worker CPU budget that a full SSR re-render of the tab blows through.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireStaffApi("manageTickets");
  if (!auth.ok) return auth.response;

  const ticketId = new URL(request.url).searchParams.get("ticketId");
  if (!ticketId) {
    return Response.json({ error: "ticketId required" }, { status: 400 });
  }

  const ticket = await getTicket(ticketId);
  if (!ticket) return Response.json({ error: "not found" }, { status: 404 });

  const messages = await getTicketMessages(ticketId);
  return Response.json({ status: ticket.status, messages });
}
