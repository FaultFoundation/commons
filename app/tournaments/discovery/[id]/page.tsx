import Link from "next/link";
import { notFound } from "next/navigation";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { TournamentList } from "@/components/dashboard/tournaments/TournamentList";
import { ProfileActions } from "@/components/dashboard/tournaments/DiscoveryActions";
import { loadTournamentEntries } from "@/lib/tournament-entries";
import { discoveryCatalog, discoveryFollowIds } from "@/lib/discovery";
import { getSessionCached } from "@/lib/session";
import { profilePath, safeWebsite } from "@/lib/discovery-shared";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Tournament Discovery",
  robots: { index: false },
};
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
  const seriesIds = new Set(
    tournaments.map((t) => t.discovery?.seriesId).filter(Boolean),
  );
  const done = tournaments.filter((t) =>
    ["completed", "cancelled"].includes(t.status),
  ).length;
  const startDates = tournaments
    .map((t) => t.startsAt)
    .filter((n): n is number => n != null);
  const endDates = tournaments
    .map((t) => t.endsAt)
    .filter((n): n is number => n != null);
  return (
    <div className="ff-bubble-grid">
      <h1 className="screen-reader-text">{profile.name}</h1>
      <Bubble title={profile.name} span="full">
        <Link href="/tournaments/">← All Tournaments</Link>
        <p>
          {profile.kind === "organization" ? "Organization" : "Series"} ·{" "}
          {profile.ownerId
            ? "Claim verified"
            : "Grouping may be inferred; corrections welcome"}
        </p>
        {profile.description && <p>{profile.description}</p>}
        {safeWebsite(profile.website) && (
          <a
            href={safeWebsite(profile.website)!}
            target="_blank"
            rel="noopener noreferrer"
          >
            Source / website ↗
          </a>
        )}
        <ProfileActions
          profile={profile}
          following={follows.includes(id)}
          canEdit={profile.ownerId === session?.user.id}
        />
        <p>
          {tournaments.length} recorded tournaments · {done} concluded ·{" "}
          {[...new Set(tournaments.map((t) => t.game).filter(Boolean))].join(
            ", ",
          ) || "Game not specified"}
        </p>
        {profile.kind === "series" && tournaments.length > 0 && (
          <div>
            <label htmlFor="series-progress">
              Recorded tournaments concluded: {done} / {tournaments.length}
            </label>
            <progress
              id="series-progress"
              max={tournaments.length}
              value={done}
            />
            <p>
              This reflects imported tournaments; it is not an official
              qualification path or a complete season schedule.
            </p>
            {startDates.length > 0 && (
              <p>
                First recorded start:{" "}
                {new Date(Math.min(...startDates)).toLocaleDateString("en-US", {
                  timeZone: "UTC",
                })}
                {endDates.length === tournaments.length &&
                  ` · Last recorded end: ${new Date(Math.max(...endDates)).toLocaleDateString("en-US", { timeZone: "UTC" })}`}
              </p>
            )}
          </div>
        )}
        {profile.kind === "organization" && seriesIds.size > 0 && (
          <div className="ff-discovery-context">
            {profiles
              .filter((p) => seriesIds.has(p.id))
              .map((p) => (
                <Link href={profilePath(p.id)} key={p.id}>
                  {p.name}
                </Link>
              ))}
          </div>
        )}
      </Bubble>
      <Bubble title="Tournaments" span="full">
        <TournamentList
          tournaments={tournaments}
          initialLayout="modern"
          follows={follows}
          showSeries={false}
        />
      </Bubble>
    </div>
  );
}
