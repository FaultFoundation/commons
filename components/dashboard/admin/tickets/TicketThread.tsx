"use client";

import { useCallback, useEffect, useState } from "react";

import { TicketReply } from "@/components/dashboard/admin/tickets/TicketReply";

type ThreadMessage = {
  id: string;
  authorType: string;
  authorName: string;
  content: string;
  attachments: string | null;
  source: string;
  createdAt: string;
};

function parseAttachments(raw: string | null): { url: string; name: string }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * The ticket conversation, loaded and polled client-side from
 * /api/admin/tickets/thread. This keeps the heavy, unbounded message list off
 * the server render (which on Workers' free CPU budget was tripping the limit)
 * — the server now ships only the light ticket shell.
 */
export function TicketThread({ ticketId }: { ticketId: string }) {
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/tickets/thread?ticketId=${encodeURIComponent(ticketId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        setError("Couldn't load messages.");
        return;
      }
      const data = (await res.json()) as {
        status?: string;
        messages?: ThreadMessage[];
      };
      setMessages(data.messages ?? []);
      setClosed(data.status === "closed");
      setError(null);
    } catch {
      setError("Couldn't load messages.");
    }
  }, [ticketId]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 8000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <>
      {error ? <p className="ff-ticket-muted">{error}</p> : null}
      {messages === null ? (
        <p className="ff-ticket-muted">Loading…</p>
      ) : messages.length === 0 ? (
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
                    {new Date(message.createdAt).toLocaleString()}
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
      <TicketReply ticketId={ticketId} closed={closed} onSent={load} />
    </>
  );
}
