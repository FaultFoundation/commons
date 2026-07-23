import { headers } from "next/headers";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { getAuth } from "@/lib/auth";
import { listTickets, type TicketListFilter } from "@/lib/tickets";
import {
  TICKET_PRIORITY_LABELS,
  formatTicketNumber,
  isTicketPriority,
} from "@/lib/tickets-shared";

type View = "open" | "all" | "closed" | "mine" | "unassigned";

const VIEWS: { key: View; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "mine", label: "Mine" },
  { key: "unassigned", label: "Unassigned" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

function asView(value: string | undefined): View {
  return value === "all" ||
    value === "closed" ||
    value === "mine" ||
    value === "unassigned"
    ? value
    : "open";
}

function relativeTime(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

/** The ticket queue. Rendered inside AdminGate, so it only runs for verified
    staff — the session lookup here is just to resolve the "Mine" filter. */
export async function TicketQueue({ view }: { view?: string }) {
  const active = asView(view);
  const session = await getAuth().api.getSession({ headers: await headers() });
  const userId = session?.user.id ?? "";

  const filter: TicketListFilter =
    active === "mine"
      ? { assignedToUserId: userId }
      : active === "unassigned"
        ? { status: "open", unassigned: true }
        : active === "closed"
          ? { status: "closed" }
          : active === "all"
            ? {}
            : { status: "open" };

  const tickets = await listTickets(filter);

  return (
    <div className="ff-bubble-grid">
      <Bubble title="Support Tickets" span="full">
        <nav className="ff-ticket-views" aria-label="Ticket filters">
          {VIEWS.map((v) => (
            <a
              key={v.key}
              className="ff-ticket-view"
              href={`/admin/tickets/?view=${v.key}`}
              aria-current={v.key === active ? "page" : undefined}
            >
              {v.label}
            </a>
          ))}
        </nav>

        {tickets.length === 0 ? (
          <p className="ff-ticket-empty">No tickets here.</p>
        ) : (
          <div className="ff-ticket-table-wrap">
            <table className="ff-ticket-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Ticket</th>
                  <th scope="col">Opener</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Assignee</th>
                  <th scope="col">Activity</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td className="ff-ticket-num">
                      <a href={`/admin/tickets/${ticket.id}/`}>
                        {formatTicketNumber(ticket.ticketNumber)}
                      </a>
                    </td>
                    <td>
                      <a
                        className="ff-ticket-subject"
                        href={`/admin/tickets/${ticket.id}/`}
                      >
                        {ticket.subject || ticket.category || "Support request"}
                      </a>
                      {ticket.category && ticket.subject ? (
                        <span className="ff-ticket-tag">{ticket.category}</span>
                      ) : null}
                    </td>
                    <td>{ticket.openerName}</td>
                    <td>
                      {isTicketPriority(ticket.priority) ? (
                        <span
                          className={`ff-ticket-prio ff-ticket-prio--${ticket.priority}`}
                        >
                          {TICKET_PRIORITY_LABELS[ticket.priority]}
                        </span>
                      ) : (
                        <span className="ff-ticket-muted">—</span>
                      )}
                    </td>
                    <td>
                      {ticket.assigneeName ?? (
                        <span className="ff-ticket-muted">Unassigned</span>
                      )}
                    </td>
                    <td className="ff-ticket-muted">
                      {relativeTime(ticket.lastActivityAt)}
                    </td>
                    <td>
                      <span
                        className={`ff-ticket-status ff-ticket-status--${ticket.status}`}
                      >
                        {ticket.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Bubble>
    </div>
  );
}
