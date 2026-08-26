"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  assignTicket,
  closeTicket,
  setTicketPriority,
} from "@/app/admin/tickets/actions";
import { ConfirmDialog } from "@/components/dashboard/bubbles/ConfirmDialog";
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
  staffMembers,
}: {
  ticketId: string;
  status: string;
  priority: string | null;
  assignedToUserId: string | null;
  staffMembers: { userId: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const closed = status === "closed";

  async function run(action: () => Promise<Result>, after?: () => void) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      after?.();
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="ff-ticket-toolbar">
      {error && !confirmingClose ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <div className="ff-ticket-toolbar__row">
        <label className="ff-ticket-select">
          <span className="screen-reader-text">Assign</span>
          <select
            className="ff-auth__input"
            value={assignedToUserId ?? ""}
            disabled={pending}
            onChange={(event) =>
              run(() => assignTicket(ticketId, event.target.value))
            }
          >
            <option value="">Assign…</option>
            {staffMembers.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
          </select>
        </label>

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
          <span className="ff-ticket-muted">Closed</span>
        ) : (
          <button
            className="ff-btn ff-btn--outline ff-btn--sm"
            type="button"
            disabled={pending}
            onClick={() => setConfirmingClose(true)}
          >
            Close ticket
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmingClose}
        title="Close Ticket"
        description="Close this support ticket and its Discord channel? The member receives the final transcript."
        confirmLabel={pending ? "Closing…" : "Close ticket"}
        danger
        busy={pending}
        error={error}
        onConfirm={() =>
          run(
            () => closeTicket(ticketId),
            () => setConfirmingClose(false),
          )
        }
        onClose={() => {
          if (!pending) setConfirmingClose(false);
        }}
      />
    </div>
  );
}
