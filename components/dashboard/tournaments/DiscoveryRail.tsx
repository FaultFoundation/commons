import Link from "next/link";
import { profilePath, type DiscoveryProfile } from "@/lib/discovery-shared";
import type { TournamentListEntry } from "./TournamentList";
export function DiscoveryRail({
  tournaments,
  profiles,
  allTournaments = tournaments,
}: {
  tournaments: TournamentListEntry[];
  profiles?: DiscoveryProfile[];
  allTournaments?: TournamentListEntry[];
}) {
  const catalog = profiles ?? [
    ...new Map(
      tournaments
        .filter((t) => t.discovery?.seriesId)
        .map((t) => [
          t.discovery!.seriesId!,
          {
            id: t.discovery!.seriesId!,
            kind: "series" as const,
            name: t.discovery!.seriesName ?? t.name,
          },
        ]),
    ).values(),
  ];
  const series = catalog
    .filter((p) => p.kind === "series")
    .map((p) => ({
      p,
      events: allTournaments.filter((t) => t.discovery?.seriesId === p.id),
    }))
    .filter((g) =>
      g.events.some((t) => !["completed", "cancelled"].includes(t.status)),
    )
    .sort(
      (a, b) =>
        Number(b.events.some((t) => t.discovery?.audience === "collegiate")) -
          Number(
            a.events.some((t) => t.discovery?.audience === "collegiate"),
          ) || a.p.name.localeCompare(b.p.name),
    );
  if (!series.length) return null;
  return (
    <section className="ff-discovery-rail">
      <h2>Active & Upcoming Series</h2>
      <div>
        {series.slice(0, 8).map(({ p, events }) => {
          const done = events.filter((t) =>
            ["completed", "cancelled"].includes(t.status),
          ).length;
          return (
            <Link
              className="ff-discovery-series"
              href={profilePath(p.id)}
              key={p.id}
            >
              <strong>{p.name}</strong>
              <span>
                {events.length} recorded tournaments · {done} concluded
              </span>
              <progress
                aria-label={`${done} of ${events.length} recorded tournaments concluded`}
                max={events.length}
                value={done}
              />
              <span>
                {[...new Set(events.map((t) => t.game).filter(Boolean))].join(
                  " · ",
                )}
              </span>
              <span>Open series →</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
