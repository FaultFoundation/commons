import Link from "next/link";
import { profilePath, seriesName } from "@/lib/discovery-shared";
import type { TournamentListEntry } from "@/components/dashboard/tournaments/TournamentList";

const CONCLUDED = new Set(["completed", "cancelled"]);

/** A stable gradient per series, seeded off its id — real banners aren't
    projected for series, so the thumbnail is a deterministic swatch. */
function swatch(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h} 55% 42%), hsl(${(h + 40) % 360} 60% 30%))`;
}

function dateRange(events: TournamentListEntry[]): string | null {
  const starts = events
    .map((t) => t.startsAt)
    .filter((n): n is number => n != null);
  const ends = events
    .map((t) => t.endsAt ?? t.startsAt)
    .filter((n): n is number => n != null);
  if (!starts.length) return null;
  const fmt = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    });
  const lo = fmt(Math.min(...starts));
  const hi = fmt(Math.max(...ends.length ? ends : starts));
  return lo === hi ? lo : `${lo} – ${hi}`;
}

/**
 * "Series & Leagues" — the Series tab's grouped-tournament list. A group only
 * appears when **more than one** tournament belongs to it (a lone tournament is
 * just a card, not a series), and only while at least one of its tournaments is
 * still active or upcoming. Each row links to the series page.
 *
 * This was the rail above the /tournaments/ list. It is now the Series tab's
 * own content, which changes two things: there is no 8-row cap (the page IS the
 * list), and an empty result renders a message rather than nothing — a blank
 * tab reads as broken where a missing rail read as "no series right now".
 */
export function SeriesList({
  tournaments,
}: {
  tournaments: TournamentListEntry[];
}) {
  const groups = new Map<
    string,
    { id: string; name: string; events: TournamentListEntry[] }
  >();
  for (const t of tournaments) {
    const id = t.discovery?.seriesId;
    if (!id) continue;
    const group =
      groups.get(id) ??
      (() => {
        const g = {
          id,
          name: t.discovery?.seriesName ?? seriesName(t.name),
          events: [] as TournamentListEntry[],
        };
        groups.set(id, g);
        return g;
      })();
    group.events.push(t);
  }

  const series = [...groups.values()]
    // Only surface a group that actually gathers several shown tournaments.
    .filter((g) => g.events.length > 1)
    .filter((g) => g.events.some((t) => !CONCLUDED.has(t.status)))
    .sort(
      (a, b) =>
        Number(
          b.events.some((t) => t.discovery?.audience === "collegiate"),
        ) -
          Number(
            a.events.some((t) => t.discovery?.audience === "collegiate"),
          ) || a.name.localeCompare(b.name),
    );

  return (
    <section className="ff-serieslist">
      {/* The same head shape as the tournaments grid (.ff-list-heading): name
          left, dim count on the baseline beside it. One class, so the two
          sections cannot drift apart. */}
      <div className="ff-list-heading">
        <h2>Series &amp; Leagues</h2>
        <span className="ff-list-count">{series.length} running now</span>
      </div>
      {series.length === 0 ? (
        <p className="ff-ticket-empty">
          No series or leagues are running right now. A group appears here once
          more than one recorded tournament belongs to it.
        </p>
      ) : null}
      <div className="ff-serieslist__rows">
        {series.map((g) => {
          const done = g.events.filter((t) => CONCLUDED.has(t.status)).length;
          const isLeague = g.events.some(
            (t) => t.discovery?.competition === "league",
          );
          const live = g.events.some((t) => t.status === "active");
          const registering = g.events.some(
            (t) => t.status === "registration",
          );
          const status = live
            ? "Live"
            : registering
              ? "Registration open"
              : "Upcoming";
          const range = dateRange(g.events);
          const gamesLabel = [
            ...new Set(g.events.map((t) => t.game).filter(Boolean)),
          ].join(" · ");
          return (
            <Link
              className="ff-serieslist__row"
              href={profilePath(g.id)}
              key={g.id}
            >
              <span
                className="ff-serieslist__thumb"
                style={{ background: swatch(g.id) }}
                aria-hidden="true"
              />
              <span className="ff-serieslist__main">
                <span className="ff-serieslist__badges">
                  <span
                    className={`ff-serieslist__kind${isLeague ? " ff-serieslist__kind--league" : ""}`}
                  >
                    {isLeague ? "League" : "Series"}
                  </span>
                  <span
                    className={`ff-serieslist__status${live ? " ff-serieslist__status--live" : ""}`}
                  >
                    {status}
                  </span>
                </span>
                <strong className="ff-serieslist__name">{g.name}</strong>
                <span className="ff-serieslist__meta">
                  {[gamesLabel, `${g.events.length} tournaments`, range]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="ff-serieslist__progress">
                <span className="ff-serieslist__progresslabel">
                  {done} / {g.events.length} concluded
                </span>
                <progress max={g.events.length} value={done} />
              </span>
              <span className="ff-serieslist__open">Open →</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
