"use client";

import { useCallback, useEffect, useState } from "react";

import {
  TICKET_PRIORITY_LABELS,
  formatTicketNumber,
  isTicketPriority,
} from "@/lib/tickets-shared";

type QueueTicket = {
  id: string;
  ticketNumber: number;
  status: string;
  priority: string | null;
  category: string | null;
  subject: string | null;
  openerName: string;
  assigneeName: string | null;
  lastActivityAt: string;
};

function relativeTime(iso: string): string {
  const date = new Date(iso);
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

/**
 * The ticket queue, loaded and polled client-side from
 * /api/admin/tickets/list. Keeps the table off the server render (Workers free
 * CPU budget) — the server ships only the filter tabs and this island.
 */
export function TicketQueueLive({ view }: { view: string }) {
  const [tickets, setTickets] = useState<QueueTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/tickets/list?view=${encodeURIComponent(view)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        setError("Couldn't load tickets.");
        return;
      }
      const data = (await res.json()) as { tickets?: QueueTicket[] };
      setTickets(data.tickets ?? []);
      setError(null);
    } catch {
      setError("Couldn't load tickets.");
    }
  }, [view]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 8000);
    return () => window.clearInterval(id);
  }, [load]);

  if (error) return <p className="ff-ticket-muted">{error}</p>;
  if (tickets === null) return <p className="ff-ticket-muted">Loading…</p>;
  if (tickets.length === 0) return <p className="ff-ticket-empty">No tickets here.</p>;

  return (
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
  );
}
