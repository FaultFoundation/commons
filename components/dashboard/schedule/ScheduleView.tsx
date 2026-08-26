"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

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
 * / Challonge accounts (lib/schedule.ts), plus the public scraped calendar.
 * Client state owns the month and All/Your scope; data is still loaded once by
 * the server page and there is no browser polling.
 */
export function ScheduleView({
  allUpcoming,
  upcoming,
  past,
  anyConnected,
}: {
  allUpcoming: ScheduleEntry[];
  upcoming: ScheduleEntry[];
  past: ScheduleEntry[];
  anyConnected: boolean;
}) {
  const [scope, setScope] = useState<"all" | "mine">("all");
  const entries = scope === "all" ? allUpcoming : upcoming;

  return (
    <div className="ff-bubble-grid">
      <Bubble
        title="Calendar"
        span="full"
        className="ff-schedule-calendar"
        actions={
          <div className="ff-segment ff-schedule-scope" role="group" aria-label="Matches shown">
            <button
              className="ff-segment__btn"
              type="button"
              aria-pressed={scope === "all"}
              onClick={() => setScope("all")}
            >
              All Matches
            </button>
            <button
              className="ff-segment__btn"
              type="button"
              aria-pressed={scope === "mine"}
              onClick={() => setScope("mine")}
            >
              Your Matches
            </button>
          </div>
        }
      >
        <MonthCalendar
          entries={entries}
          scope={scope}
          anyConnected={anyConnected}
        />
      </Bubble>

      <Bubble title="Your Results">
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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthStartFor(entries: ScheduleEntry[]): number {
  const dated = entries.find((entry) => entry.scheduledAt != null)?.scheduledAt;
  const date = new Date(dated ?? Date.now());
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function dateKey(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function MonthCalendar({
  entries,
  scope,
  anyConnected,
}: {
  entries: ScheduleEntry[];
  scope: "all" | "mine";
  anyConnected: boolean;
}) {
  const [month, setMonth] = useState(() => monthStartFor(entries));
  const previousScope = useRef(scope);

  useEffect(() => {
    if (previousScope.current === scope) return;
    previousScope.current = scope;
    const visible = new Date(month);
    const hasVisibleEntry = entries.some((entry) => {
      if (entry.scheduledAt == null) return false;
      const date = new Date(entry.scheduledAt);
      return (
        date.getFullYear() === visible.getFullYear() &&
        date.getMonth() === visible.getMonth()
      );
    });
    if (!hasVisibleEntry) setMonth(monthStartFor(entries));
  }, [entries, month, scope]);

  const { weeks, entriesByDay, label } = useMemo(() => {
    const start = new Date(month);
    const year = start.getFullYear();
    const monthIndex = start.getMonth();
    const leading = new Date(year, monthIndex, 1).getDay();
    const days = new Date(year, monthIndex + 1, 0).getDate();
    const cellCount = Math.ceil((leading + days) / 7) * 7;
    const calendarCells = Array.from({ length: cellCount }, (_, index) => {
      const day = index - leading + 1;
      return day >= 1 && day <= days ? new Date(year, monthIndex, day) : null;
    });
    const calendarWeeks = Array.from(
      { length: calendarCells.length / 7 },
      (_, index) => calendarCells.slice(index * 7, index * 7 + 7),
    );
    const grouped = new Map<string, ScheduleEntry[]>();
    for (const entry of entries) {
      if (entry.scheduledAt == null) continue;
      const key = dateKey(entry.scheduledAt);
      const list = grouped.get(key) ?? [];
      list.push(entry);
      grouped.set(key, list);
    }
    return {
      weeks: calendarWeeks,
      entriesByDay: grouped,
      label: start.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      }),
    };
  }, [entries, month]);

  const undated = entries.filter((entry) => entry.scheduledAt == null);
  const today = dateKey(Date.now());

  function moveMonth(offset: number) {
    const current = new Date(month);
    setMonth(
      new Date(current.getFullYear(), current.getMonth() + offset, 1).getTime(),
    );
  }

  return (
    <>
      <div className="ff-calendar__toolbar">
        <button
          className="ff-calendar__nav"
          type="button"
          title="Previous month"
          aria-label="Previous month"
          onClick={() => moveMonth(-1)}
        >
          <MonthChevron />
        </button>
        <time className="ff-calendar__month" dateTime={new Date(month).toISOString()}>
          {label}
        </time>
        <button
          className="ff-calendar__nav"
          type="button"
          title="Next month"
          aria-label="Next month"
          onClick={() => moveMonth(1)}
        >
          <MonthChevron next />
        </button>
      </div>

      {entries.length === 0 ? (
        <CalendarEmpty scope={scope} anyConnected={anyConnected} />
      ) : (
        <div className="ff-calendar__viewport">
          <div className="ff-calendar" role="table" aria-label={label}>
            <div className="ff-calendar__row ff-calendar__row--header" role="row">
              {WEEKDAYS.map((day) => (
                <div key={day} className="ff-calendar__weekday" role="columnheader">
                  {day}
                </div>
              ))}
            </div>
            {weeks.map((week, weekIndex) => (
              <div className="ff-calendar__row" role="row" key={`week-${weekIndex}`}>
                {week.map((date, dayIndex) => {
                  if (!date) {
                    return (
                      <div
                        key={`blank-${weekIndex}-${dayIndex}`}
                        className="ff-calendar__day ff-calendar__day--blank"
                        role="cell"
                      />
                    );
                  }
                  const key = dateKey(date.getTime());
                  const dayEntries = entriesByDay.get(key) ?? [];
                  return (
                    <div
                      key={key}
                      className="ff-calendar__day"
                      data-today={key === today || undefined}
                      role="cell"
                    >
                      <time dateTime={date.toISOString()} className="ff-calendar__date">
                        {date.getDate()}
                      </time>
                      <div className="ff-calendar__events">
                        {dayEntries.map((entry) => (
                          <CalendarEntry key={entry.id} entry={entry} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {undated.length > 0 ? (
        <div className="ff-calendar__undated">
          <strong>Date TBD</strong>
          {undated.map((entry) => (
            <CalendarEntry key={entry.id} entry={entry} />
          ))}
        </div>
      ) : null}
    </>
  );
}

function CalendarEntry({ entry }: { entry: ScheduleEntry }) {
  const external = !entry.href && Boolean(entry.url);
  const href = entry.href ?? entry.url;
  const content = (
    <>
      <span className="ff-calendar__event-title">{entry.title}</span>
      <span className="ff-calendar__event-meta">
        {entry.scheduledAt ? formatTime(entry.scheduledAt) : "Time TBD"} ·{" "}
        {SCHEDULE_PROVIDER_LABELS[entry.provider]}
      </span>
    </>
  );

  if (!href) return <span className="ff-calendar__event">{content}</span>;
  return external ? (
    <a
      className="ff-calendar__event"
      href={href}
      target="_blank"
      rel="noreferrer noopener"
    >
      {content}
    </a>
  ) : (
    <Link className="ff-calendar__event" href={href} prefetch={false}>
      {content}
    </Link>
  );
}

function CalendarEmpty({
  scope,
  anyConnected,
}: {
  scope: "all" | "mine";
  anyConnected: boolean;
}) {
  if (scope === "all") {
    return <div className="ff-bubble__wip">No upcoming public matches found.</div>;
  }
  return <EmptyState anyConnected={anyConnected} kind="upcoming" />;
}

function MonthChevron({ next }: { next?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={next ? "M6 3.5 10.5 8 6 12.5" : "M10 3.5 5.5 8l4.5 4.5"}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
          <span className="ff-btn ff-btn--outline ff-btn--sm" aria-hidden="true">
            {external ? "Open" : "View"}
          </span>
        ) : undefined
      }
    />
  );

  if (!linkHref) return row;
  return external ? (
    <a
      className="ff-schedule-entry"
      href={linkHref}
      target="_blank"
      rel="noreferrer noopener"
    >
      {row}
    </a>
  ) : (
    <Link
      className="ff-schedule-entry"
      href={linkHref}
      prefetch={false}
    >
      {row}
    </Link>
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
        <Link className="ff-link" href="/account/" prefetch={false}>
          Integrations
        </Link>{" "}
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

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
