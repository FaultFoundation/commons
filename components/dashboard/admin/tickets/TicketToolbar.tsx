"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  claimTicket,
  closeTicket,
  exportTranscript,
  reopenTicket,
  setTicketPriority,
  unassignTicket,
} from "@/app/admin/tickets/actions";
import {
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
} from "@/lib/tickets-shared";

type Result = { ok: true } | { ok: false; error: string };

export function TicketToolbar({
  ticketId,
  status,
  priority,
  assignedToUserId,
  currentUserId,
  canTranscript,
}: {
  ticketId: string;
  status: string;
  priority: string | null;
  assignedToUserId: string | null;
  currentUserId: string;
  canTranscript: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const mine = assignedToUserId === currentUserId;
  const closed = status === "closed";

  async function run(action: () => Promise<Result>, successNote?: string) {
    if (pending) return;
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await action();
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (successNote) setNotice(successNote);
    router.refresh();
  }

  return (
    <div className="ff-ticket-toolbar">
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      {notice ? (
        <p className="ff-row__saved" role="status">
          {notice}
        </p>
      ) : null}

      <div className="ff-ticket-toolbar__row">
        {mine ? (
          <button
            className="ff-btn ff-btn--outline ff-btn--sm"
            type="button"
            disabled={pending}
            onClick={() => run(() => unassignTicket(ticketId))}
          >
            Unassign me
          </button>
        ) : (
          <button
            className="ff-btn ff-btn--sm"
            type="button"
            disabled={pending}
            onClick={() => run(() => claimTicket(ticketId))}
          >
            {assignedToUserId ? "Assign to me" : "Claim"}
          </button>
        )}

        <label className="ff-ticket-select">
          <span className="screen-reader-text">Priority</span>
          <select
            className="ff-auth__input"
            value={priority ?? ""}
            disabled={pending}
            onChange={(event) =>
              run(() => setTicketPriority(ticketId, event.target.value))
            }
          >
            <option value="">No priority</option>
            {TICKET_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {TICKET_PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        {closed ? (
          <button
            className="ff-btn ff-btn--sm"
            type="button"
            disabled={pending}
            onClick={() => run(() => reopenTicket(ticketId))}
          >
            Reopen
          </button>
        ) : (
          <button
            className="ff-btn ff-btn--danger ff-btn--sm"
            type="button"
            disabled={pending}
            onClick={() => run(() => closeTicket(ticketId))}
          >
            Close ticket
          </button>
        )}

        <button
          className="ff-btn ff-btn--outline ff-btn--sm"
          type="button"
          disabled={pending || !canTranscript}
          title={
            canTranscript
              ? undefined
              : "No linked Discord user to DM the transcript to."
          }
          onClick={() =>
            run(
              () => exportTranscript(ticketId),
              "Transcript queued — the bot will DM it shortly.",
            )
          }
        >
          Send transcript
        </button>
      </div>
    </div>
  );
}
