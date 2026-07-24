import { requireStaffApi } from "@/lib/admin-api";
import { listTickets, type TicketListFilter } from "@/lib/tickets";

// GET /api/admin/tickets/list?view=… — the queue, polled by the client. Plain
// D1 read + JSON, no SSR.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireStaffApi("manageTickets");
  if (!auth.ok) return auth.response;

  const view = new URL(request.url).searchParams.get("view") ?? "open";
  const filter: TicketListFilter =
    view === "mine"
      ? { assignedToUserId: auth.userId }
      : view === "unassigned"
        ? { status: "open", unassigned: true }
        : view === "closed"
          ? { status: "closed" }
          : view === "all"
            ? {}
            : { status: "open" };

  const tickets = await listTickets(filter);
  return Response.json({ tickets });
}
