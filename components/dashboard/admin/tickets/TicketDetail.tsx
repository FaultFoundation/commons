import { notFound } from "next/navigation";

import { TicketNoteForm } from "@/components/dashboard/admin/tickets/TicketNoteForm";
import { TicketThread } from "@/components/dashboard/admin/tickets/TicketThread";
import { TicketToolbar } from "@/components/dashboard/admin/tickets/TicketToolbar";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { listStaffMembers } from "@/lib/staff";
import { getTicket, getTicketNotes } from "@/lib/tickets";
import { formatTicketNumber } from "@/lib/tickets-shared";

/**
 * The ticket detail — a LIGHT server render (header, toolbar, notes). The
 * conversation is the heavy, unbounded part, so it's loaded and polled
 * client-side by <TicketThread> from a JSON endpoint; keeping it out of the
 * server render is what keeps this under the Worker's free-tier CPU budget.
 */
export async function TicketDetail({ ticketId }: { ticketId: string }) {
  const ticket = await getTicket(ticketId);
  if (!ticket) notFound();

  const [notes, staffMembers] = await Promise.all([
    getTicketNotes(ticketId),
    listStaffMembers(),
  ]);

  return (
    <>
      <a className="ff-ticket-back" href="/admin/tickets/">
        <span aria-hidden="true">←</span> Back to tickets
      </a>
      <div className="ff-bubble-grid">
        <Bubble
          title={`${formatTicketNumber(ticket.ticketNumber)}${
            ticket.subject ? ` — ${ticket.subject}` : ""
          }`}
          span="full"
          actions={
            <span
              className={`ff-ticket-status ff-ticket-status--${ticket.status}`}
            >
              {ticket.status}
            </span>
          }
        >
          <dl className="ff-ticket-meta">
            <div>
              <dt>Opener</dt>
              <dd>
                {ticket.openerName}
                {ticket.discordUsername ? (
                  <span className="ff-ticket-muted">
                    {" "}
                    · {ticket.discordUsername}
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>Category</dt>
              <dd>{ticket.category ?? "—"}</dd>
            </div>
            <div>
              <dt>Assignee</dt>
              <dd>{ticket.assigneeName ?? "Unassigned"}</dd>
            </div>
            <div>
              <dt>Opened</dt>
              <dd>{ticket.createdAt.toLocaleString()}</dd>
            </div>
            {ticket.discordChannelName ? (
              <div>
                <dt>Channel</dt>
                <dd className="ff-ticket-muted">#{ticket.discordChannelName}</dd>
              </div>
            ) : null}
          </dl>

          <TicketToolbar
            ticketId={ticket.id}
            status={ticket.status}
            priority={ticket.priority}
            assignedToUserId={ticket.assignedToUserId}
            staffMembers={staffMembers}
          />
        </Bubble>

        <Bubble title="Conversation" span="full">
          <TicketThread ticketId={ticket.id} />
        </Bubble>

        <Bubble title="Internal Notes">
          <TicketNoteForm ticketId={ticket.id} />
          {notes.length === 0 ? (
            <p className="ff-ticket-muted">No notes yet.</p>
          ) : (
            <ul className="ff-ticket-notes">
              {notes.map((note) => (
                <li key={note.id}>
                  <div className="ff-ticket-msg__head">
                    <span className="ff-ticket-msg__author">
                      {note.authorName ?? "Unknown"}
                    </span>
                    <span className="ff-ticket-muted">
                      {note.createdAt.toLocaleString()}
                    </span>
                  </div>
                  <p className="ff-ticket-msg__body">{note.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Bubble>
      </div>
    </>
  );
}
