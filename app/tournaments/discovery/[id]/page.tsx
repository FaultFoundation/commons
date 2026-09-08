import Link from "next/link";
import { notFound } from "next/navigation";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { TournamentCards } from "@/components/dashboard/tournaments/TournamentList";
import { ProfileActions } from "@/components/dashboard/tournaments/DiscoveryActions";
import { loadTournamentEntries } from "@/lib/tournament-entries";
import { discoveryCatalog, discoveryFollowIds } from "@/lib/discovery";
import { getSessionCached } from "@/lib/session";
import { safeWebsite } from "@/lib/discovery-shared";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Tournament Discovery",
  robots: { index: false },
};

const CONCLUDED = new Set(["completed", "cancelled"]);

function swatch(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `linear-gradient(120deg, hsl(${h} 55% 40%), hsl(${(h + 45) % 360} 60% 26%))`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function DiscoveryProfilePage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  const { id: routeId } = await params;
  let id = routeId;
  try {
    id = decodeURIComponent(routeId);
  } catch {
    /* Invalid encoding will 404 below. */
  }
  const entries = await loadTournamentEntries();
  const profiles = await discoveryCatalog(entries);
  const profile =
    profiles.find((p) => p.id === routeId) ?? profiles.find((p) => p.id === id);
  if (!profile) notFound();
  id = profile.id;
  const session = await getSessionCached();
  const follows = session ? await discoveryFollowIds(session.user.id) : [];
  const tournaments = entries.filter((t) =>
    profile.kind === "organization"
      ? t.discovery?.organizationId === id
      : t.discovery?.seriesId === id,
  );

  const isLeague = tournaments.some((t) => t.discovery?.competition === "league");
  const live = tournaments.some((t) => t.status === "active");
  const registering = tournaments.some((t) => t.status === "registration");
  const kindLabel =
    profile.kind === "organization"
      ? "Organization"
      : isLeague
        ? "League"
        : "Series";
  const games = [...new Set(tournaments.map((t) => t.game).filter(Boolean))];
  const sources = [
    ...new Set(tournaments.map((t) => t.source ?? "challonge")),
  ];
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
  const done = tournaments.filter((t) => CONCLUDED.has(t.status)).length;
  const website = safeWebsite(profile.website);

  const facts: [string, string][] = [
    [profile.kind === "organization" ? "Type" : "Format", kindLabel],
    ["Games", games.length ? games.join(" · ") : "Not specified"],
    ["Tournaments", `${tournaments.length} recorded · ${done} concluded`],
    ...(entrantTotal ? ([["Entrants", String(entrantTotal)]] as [string, string][]) : []),
    ...(range ? ([["Dates", range]] as [string, string][]) : []),
    ["Source", sources.join(" · ")],
  ];

  return (
    <div className="ff-bubble-grid">
      <h1 className="screen-reader-text">{profile.name}</h1>
      <section className="ff-serieshero" style={{ gridColumn: "1 / -1" }}>
        <div
          className="ff-serieshero__banner"
          style={{ background: swatch(id) }}
          aria-hidden="true"
        />
        <div className="ff-serieshero__body">
          {/* The Series tab is the only entry point now that the rail has
              left /tournaments/, so back means back to it. */}
          <Link className="ff-serieshero__back" href="/series/">
            ← All series
          </Link>
          <div className="ff-serieshero__badges">
            <span className="ff-serieslist__kind">
              {kindLabel}
              {profile.kind !== "organization"
                ? ` · ${tournaments.length} tournaments`
                : ""}
            </span>
            {live ? (
              <span className="ff-serieslist__status ff-serieslist__status--live">
                Live
              </span>
            ) : registering ? (
              <span className="ff-serieslist__status">Registration open</span>
            ) : null}
          </div>
          <h2 className="ff-serieshero__title">{profile.name}</h2>
          {profile.description ? (
            <p className="ff-serieshero__desc">{profile.description}</p>
          ) : null}
          <dl className="ff-seriesfacts">
            {facts.map(([label, val]) => (
              <div className="ff-seriesfacts__item" key={label}>
                <dt>{label}</dt>
                <dd>{val}</dd>
              </div>
            ))}
          </dl>
          <div className="ff-serieshero__actions">
            <ProfileActions
              profile={profile}
              following={follows.includes(id)}
              canEdit={profile.ownerId === session?.user.id}
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
            <p className="ff-serieshero__note">
              Grouping may be inferred from source data; corrections are welcome.
            </p>
          ) : null}
        </div>
      </section>

      <Bubble
        title={
          profile.kind === "organization"
            ? "Tournaments"
            : "Tournaments in this series"
        }
        span="full"
      >
        <TournamentCards
          tournaments={tournaments}
          empty="No tournaments recorded here yet."
        />
      </Bubble>
    </div>
  );
}
