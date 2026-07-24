import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { TicketQueueLive } from "@/components/dashboard/admin/tickets/TicketQueueLive";

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

/**
 * The ticket queue — a LIGHT server render: just the filter tabs. The table
 * itself is loaded and polled client-side by <TicketQueueLive>, keeping the
 * per-request SSR cost under the Worker's free-tier CPU budget.
 */
export function TicketQueue({ view }: { view?: string }) {
  const active = asView(view);

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
        <TicketQueueLive view={active} />
      </Bubble>
    </div>
  );
}
