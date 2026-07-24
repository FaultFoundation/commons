import { notFound } from "next/navigation";

import { LiveRefresh } from "@/components/dashboard/admin/tickets/LiveRefresh";
import { TicketNoteForm } from "@/components/dashboard/admin/tickets/TicketNoteForm";
import { TicketReply } from "@/components/dashboard/admin/tickets/TicketReply";
import { TicketToolbar } from "@/components/dashboard/admin/tickets/TicketToolbar";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { listStaffMembers } from "@/lib/staff";
import {
  getTicket,
  getTicketMessages,
  getTicketNotes,
} from "@/lib/tickets";
import { formatTicketNumber } from "@/lib/tickets-shared";

function parseAttachments(raw: string | null): { url: string; name: string }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** The full ticket view. Rendered inside AdminGate, so only verified staff
    reach it — the session lookup here just resolves "is this assigned to me". */
export async function TicketDetail({ ticketId }: { ticketId: string }) {
  const ticket = await getTicket(ticketId);
  if (!ticket) notFound();

  const [messages, notes, staffMembers] = await Promise.all([
    getTicketMessages(ticketId),
    getTicketNotes(ticketId),
    listStaffMembers(),
  ]);

  const closed = ticket.status === "closed";

  return (
    <>
      <LiveRefresh />
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
          <span className={`ff-ticket-status ff-ticket-status--${ticket.status}`}>
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
                <span className="ff-ticket-muted"> · {ticket.discordUsername}</span>
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
        {messages.length === 0 ? (
          <p className="ff-ticket-muted">No messages yet.</p>
        ) : (
          <ol className="ff-ticket-log">
            {messages.map((message) => {
              const attachments = parseAttachments(message.attachments);
              return (
                <li
                  key={message.id}
                  className={`ff-ticket-msg ff-ticket-msg--${message.authorType}`}
                >
                  <div className="ff-ticket-msg__head">
                    <span className="ff-ticket-msg__author">
                      {message.authorName}
                    </span>
                    <span className="ff-ticket-msg__badge">
                      {message.authorType}
                    </span>
                    <span className="ff-ticket-muted">
                      {message.createdAt.toLocaleString()}
                    </span>
                  </div>
                  {message.content ? (
                    <p className="ff-ticket-msg__body">{message.content}</p>
                  ) : null}
                  {attachments.length > 0 ? (
                    <ul className="ff-ticket-msg__files">
                      {attachments.map((file) => (
                        <li key={file.url}>
                          <a href={file.url} target="_blank" rel="noreferrer">
                            {file.name || "Attachment"}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        <TicketReply ticketId={ticket.id} closed={closed} />
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
