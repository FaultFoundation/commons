"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { addNote } from "@/app/admin/tickets/actions";
import { TICKET_NOTE_MAX } from "@/lib/tickets-shared";

/** Internal-note composer. Notes never reach the member or Discord. */
export function TicketNoteForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !value.trim()) return;
    setPending(true);
    setError(null);
    const result = await addNote(ticketId, value);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setValue("");
    router.refresh();
  }

  return (
    <form className="ff-ticket-compose" onSubmit={onSubmit}>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      <textarea
        className="ff-auth__input ff-ticket-textarea"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={TICKET_NOTE_MAX}
        rows={2}
        placeholder="Add an internal note…"
        aria-label="Internal note"
      />
      <div className="ff-ticket-compose__foot">
        <span className="ff-ticket-muted">Only staff can see notes.</span>
        <button
          className="ff-btn ff-btn--outline ff-btn--sm"
          type="submit"
          disabled={pending || !value.trim()}
        >
          {pending ? "Saving…" : "Add note"}
        </button>
      </div>
    </form>
  );
}
