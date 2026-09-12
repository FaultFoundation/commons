import { notFound, redirect } from "next/navigation";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { LeagueCompetitions } from "@/components/dashboard/series/LeagueCompetitions";
import { ProfileActions } from "@/components/dashboard/tournaments/DiscoveryActions";
import { TournamentCards } from "@/components/dashboard/tournaments/TournamentList";
import { discoveryFollowIds } from "@/lib/discovery";
import { safeWebsite } from "@/lib/discovery-shared";
import { getSeriesProfile } from "@/lib/series-profile";
import { getSessionCached } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Series",
  robots: { index: false },
};

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The series overview panel — the series itself rather than one of its
 * tournaments: description, the structured facts, follow/edit, and the full
 * catalog.
 *
 * It is a sibling of `[tid]`, not the index, because the index auto-selects a
 * tournament; the strip's first card and the hero eyebrow lead here. A static
 * segment outranks the dynamic `[tid]` in Next's matcher, and no tournament id
 * is the bare word "series" (internal ids are 6 digits, external ones carry a
 * `source:` prefix), so the two can't collide.
 *
 * For a LeagueOS league the catalog keeps its season/program/game accordions
 * (LeagueCompetitions): the strip is a flat navigation control, and this is
 * where the league's real structure stays browsable.
 */
export default async function SeriesOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionCached();
  if (!session) redirect("/login/");

  const { id: routeId } = await params;
  const series = await getSeriesProfile(routeId);
  if (!series) notFound();

  const { profile, tournaments, lifecycle, kindLabel } = series;
  const follows = await discoveryFollowIds(session.user.id);

  const games = [...new Set(tournaments.map((t) => t.game).filter(Boolean))];
  const sources = [...new Set(tournaments.map((t) => t.source ?? "challonge"))];
  const entrantTotal = tournaments.reduce((n, t) => n + (t.entrantCount || 0), 0);
  const starts = tournaments
    .map((t) => t.startsAt)
    .filter((n): n is number => n != null);
  const ends = tournaments
    .map((t) => t.endsAt ?? t.startsAt)
    .filter((n): n is number => n != null);
  const range =
    starts.length > 0
      ? (() => {
          const lo = fmtDate(Math.min(...starts));
          const hi = fmtDate(Math.max(...(ends.length ? ends : starts)));
          return lo === hi ? lo : `${lo} – ${hi}`;
        })()
      : null;
  const website = safeWebsite(profile.website);

  const facts: [string, string][] = [
    [profile.kind === "organization" ? "Type" : "Format", kindLabel],
    ["Games", games.length ? games.join(" · ") : "Not specified"],
    [
      "Tournaments",
      `${tournaments.length} recorded · ${lifecycle.done} concluded`,
    ],
    ...(entrantTotal
      ? ([["Entrants", String(entrantTotal)]] as [string, string][])
      : []),
    ...(range ? ([["Dates", range]] as [string, string][]) : []),
    ["Source", sources.join(" · ")],
  ];

  return (
    <div className="ff-tpanel">
      <h1 className="screen-reader-text">{profile.name}</h1>
      <Bubble title="About" span="full">
        {profile.description ? (
          <p className="ff-ext-about">{profile.description}</p>
        ) : (
          <p className="ff-auth__hint">
            No description has been recorded for this {kindLabel.toLowerCase()}.
          </p>
        )}
        <dl className="ff-seriesfacts">
          {facts.map(([label, val]) => (
            <div className="ff-seriesfacts__item" key={label}>
              <dt>{label}</dt>
              <dd>{val}</dd>
            </div>
          ))}
        </dl>
        <div className="ff-seriesfacts__actions">
          <ProfileActions
            profile={profile}
            following={follows.includes(profile.id)}
            canEdit={profile.ownerId === session.user.id}
          />
          {website ? (
            <a
              className="ff-btn ff-btn--outline ff-btn--sm"
              href={website}
              target="_blank"
              rel="noopener noreferrer"
            >
              Website ↗
            </a>
          ) : null}
        </div>
        {!profile.ownerId ? (
          <p className="ff-seriesfacts__note">
            Grouping may be inferred from source data; corrections are welcome.
          </p>
        ) : null}
      </Bubble>

      <Bubble
        title={
          profile.kind === "organization"
            ? "Tournaments"
            : "Tournaments in this series"
        }
        span="full"
      >
        {profile.id.startsWith("series:leagueos:") ? (
          <LeagueCompetitions tournaments={tournaments} seriesId={profile.id} />
        ) : (
          <TournamentCards
            tournaments={tournaments}
            seriesId={profile.id}
            empty="No tournaments recorded here yet."
          />
        )}
      </Bubble>
    </div>
  );
}
