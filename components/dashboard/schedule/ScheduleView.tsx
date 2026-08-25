import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import {
  SCHEDULE_PROVIDER_LABELS,
  type ScheduleEntry,
  type ScheduleStatus,
} from "@/lib/schedule-shared";

/**
 * The member's cross-site calendar: two bubbles, Upcoming and Results, each a
 * list of normalized entries aggregated from their connected FACEIT / start.gg
 * / Challonge accounts (lib/schedule.ts). Pure server component — the data is
 * synced before render and there's nothing to poll, so no client directive.
 */
export function ScheduleView({
  upcoming,
  past,
  anyConnected,
}: {
  upcoming: ScheduleEntry[];
  past: ScheduleEntry[];
  anyConnected: boolean;
}) {
  return (
    <div className="ff-bubble-grid">
      <Bubble title="Upcoming" span="full">
        {upcoming.length > 0 ? (
          <div className="ff-schedule-list">
            {upcoming.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </div>
        ) : (
          <EmptyState anyConnected={anyConnected} kind="upcoming" />
        )}
      </Bubble>

      <Bubble title="Results">
        {past.length > 0 ? (
          <div className="ff-schedule-list">
            {past.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </div>
        ) : (
          <EmptyState anyConnected={anyConnected} kind="past" />
        )}
      </Bubble>
    </div>
  );
}

const STATUS_LABEL: Record<ScheduleStatus, string> = {
  scheduled: "Scheduled",
  live: "Live",
  finished: "Final",
  cancelled: "Cancelled",
};

function EntryRow({ entry }: { entry: ScheduleEntry }) {
  const meta: string[] = [formatWhen(entry.scheduledAt)];
  if (entry.opponent) meta.push(`vs ${entry.opponent}`);
  if (entry.status !== "scheduled") meta.push(STATUS_LABEL[entry.status]);

  const label = entry.round
    ? `${SCHEDULE_PROVIDER_LABELS[entry.provider]} · ${entry.round}`
    : SCHEDULE_PROVIDER_LABELS[entry.provider];

  // Internal (Commons) entries carry an `href` into our branded view; external
  // ones carry a `url` out to the native site. Either way the WHOLE row is the
  // link, so every entry behaves the same on click — the button is just the
  // (non-interactive) affordance.
  const external = !entry.href && Boolean(entry.url);
  const linkHref = entry.href ?? entry.url ?? null;

  const row = (
    <BubbleRow
      label={label}
      value={entry.title}
      note={meta.join(" · ")}
      action={
        linkHref ? (
          <span className="ff-btn ff-btn--soft ff-btn--sm" aria-hidden="true">
            {external ? "Open" : "View"}
          </span>
        ) : undefined
      }
    />
  );

  if (!linkHref) return row;
  return (
    <a
      className="ff-schedule-entry"
      href={linkHref}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
    >
      {row}
    </a>
  );
}

function EmptyState({
  anyConnected,
  kind,
}: {
  anyConnected: boolean;
  kind: "upcoming" | "past";
}) {
  if (!anyConnected) {
    return (
      <div className="ff-bubble__wip">
        Connect your FACEIT, start.gg, or Challonge account under{" "}
        <a className="ff-link" href="/account/">
          Integrations
        </a>{" "}
        to see your matches here.
      </div>
    );
  }
  return (
    <div className="ff-bubble__wip">
      {kind === "upcoming"
        ? "No upcoming matches on your connected accounts."
        : "No recent results yet."}
    </div>
  );
}

/** Compact date+time for an entry, or a placeholder when the provider gives no
    time. Formatted on the server (Worker TZ) — same tradeoff as the tournament
    list; a per-viewer local time would need a client component. */
function formatWhen(ms: number | null): string {
  if (ms == null) return "Time TBD";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
