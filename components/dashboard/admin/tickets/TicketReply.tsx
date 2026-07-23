"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { replyToTicket } from "@/app/admin/tickets/actions";
import { TICKET_REPLY_MAX } from "@/lib/tickets-shared";

/** Staff reply composer. Writes a website-source message and (via the bridge)
    posts it into the Discord channel. Closed tickets show a hint instead. */
export function TicketReply({
  ticketId,
  closed,
}: {
  ticketId: string;
  closed: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (closed) {
    return (
      <p className="ff-ticket-muted">
        This ticket is closed. Reopen it to reply.
      </p>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !value.trim()) return;
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await replyToTicket(ticketId, value);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setValue("");
    if (!result.delivered) {
      setNotice("Saved. Not yet delivered to Discord — the bot may be offline.");
    }
    router.refresh();
  }

  return (
    <form className="ff-ticket-compose" onSubmit={onSubmit}>
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
      <textarea
        className="ff-auth__input ff-ticket-textarea"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={TICKET_REPLY_MAX}
        rows={3}
        placeholder="Reply to the member…"
        aria-label="Reply"
      />
      <div className="ff-ticket-compose__foot">
        <span className="ff-ticket-muted">
          {value.length}/{TICKET_REPLY_MAX}
        </span>
        <button
          className="ff-btn ff-btn--sm"
          type="submit"
          disabled={pending || !value.trim()}
        >
          {pending ? "Sending…" : "Send reply"}
        </button>
      </div>
    </form>
  );
}
