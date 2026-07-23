// Support-ticket constants + formatting, shared by server code and client
// components. Must stay free of server-only imports (db, cloudflare context).

export const TICKET_STATUSES = ["open", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

/**
 * The inquiry types the Discord bot opens tickets with. Kept as suggestions,
 * not an enum — the `category` column is free text so a staff member can
 * retag, and a future bot category never needs a migration.
 */
export const TICKET_CATEGORIES = ["Verification", "Other", "Internal"] as const;

/** How a ticket message was authored. */
export const TICKET_AUTHOR_TYPES = ["user", "staff", "system"] as const;
export type TicketAuthorType = (typeof TICKET_AUTHOR_TYPES)[number];

/** Which side wrote a message — also the "don't re-mirror" signal for the bot. */
export type TicketMessageSource = "discord" | "website";

// A staff reply is mirrored into a Discord message, which caps at 2000 chars.
export const TICKET_REPLY_MAX = 2000;
export const TICKET_NOTE_MAX = 2000;

/** #0007 — 4-digit, zero-padded, matching the bot's channel naming. */
export function formatTicketNumber(ticketNumber: number): string {
  return `#${String(ticketNumber).padStart(4, "0")}`;
}

export function isTicketStatus(value: unknown): value is TicketStatus {
  return (
    typeof value === "string" &&
    (TICKET_STATUSES as readonly string[]).includes(value)
  );
}

export function isTicketPriority(value: unknown): value is TicketPriority {
  return (
    typeof value === "string" &&
    (TICKET_PRIORITIES as readonly string[]).includes(value)
  );
}
