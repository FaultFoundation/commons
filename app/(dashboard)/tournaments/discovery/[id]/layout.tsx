import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import {
  SeriesChrome,
  type StripTournament,
} from "@/components/dashboard/series/SeriesChrome";
import type { TournamentListEntry } from "@/components/dashboard/tournaments/TournamentList";
import {
  SOURCE_LABELS,
  formatDateRange,
} from "@/components/dashboard/tournaments/tournament-view-shared";
import { sourceKey } from "@/components/brand/SourceLogo";
import { discoveryFollowIds } from "@/lib/discovery";
import { getSessionCached } from "@/lib/session";
import {
  getSeriesProfile,
  preferredTournament,
  seriesTournamentPath,
} from "@/lib/series-profile";
import { getTournament, listRegisterableTeams } from "@/lib/tournaments";
import {
  TOURNAMENT_FORMAT_LABELS,
  TOURNAMENT_STATUS_LABELS,
  isRegistrationOpen,
  isTournamentId,
  tournamentShareText,
  type TournamentFormat,
} from "@/lib/tournaments-shared";

export const dynamic = "force-dynamic";

/** Short, unambiguous date for a strip card ("Mar 14, 2026"). Rendered in UTC
    to match the rest of the profile's date copy. */
function stripDate(startsAt: number | null | undefined): string | null {
  if (startsAt == null) return null;
  return new Date(startsAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function statusLabel(status: string): string {
  return (
    TOURNAMENT_STATUS_LABELS[status as keyof typeof TOURNAMENT_STATUS_LABELS] ??
    status
  );
}

/**
 * The hero's stat row, the same pairs each tournament view puts under its own
 * banner — external: Game / Entrants / Dates / Source; internal: Format /
 * Entrants / Starts / Verification.
 *
 * Built here from the LIST projection rather than read from the tournament
 * detail, because the hero lives in the layout (see SeriesChrome) and the
 * layout cannot know which tournament the child segment selected. Every value
 * it needs is already on the entry, so this costs no extra query.
 */
function heroStats(t: TournamentListEntry): { label: string; value: string; hi?: boolean }[] {
  if (t.source) {
    const range = formatDateRange(
      t.startsAt != null ? new Date(t.startsAt) : null,
      t.endsAt != null ? new Date(t.endsAt) : null,
    );
    return [
      ...(t.game ? [{ label: "Game", value: t.game }] : []),
      { label: "Entrants", value: String(t.entrantCount || "—"), hi: true },
      ...(range ? [{ label: "Dates", value: range }] : []),
      {
        label: "Source",
        value: SOURCE_LABELS[sourceKey(t.source)] ?? t.source,
      },
    ];
  }
  const starts = t.startsAt
    ? new Date(t.startsAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  return [
    {
      label: "Format",
      value: TOURNAMENT_FORMAT_LABELS[t.format as TournamentFormat] ?? t.format,
    },
    {
      label: "Entrants",
      value: `${t.entrantCount}${t.maxParticipants ? ` / ${t.maxParticipants}` : ""}`,
      hi: true,
    },
    ...(starts ? [{ label: "Starts", value: starts }] : []),
    {
      label: "Verification",
      value: t.academicVerificationRequired ? "Required" : "Open",
    },
  ];
}

/**
 * The series profile route's persistent shell.
 *
 * It owns the WHOLE hero — banner, title, status and the stat/action bar
 * attached beneath it, exactly as a standalone tournament page renders it — plus
 * the tournament strip. The child segment renders only the tabs and panels, so
 * clicking along the strip replaces just those and the header never moves (see
 * SeriesChrome for why the split falls here).
 *
 * Every read is React-`cache`d and shared with the child in the same request,
 * so the layout costs nothing the page wasn't already paying. The one exception
 * is the register payload below, which is deliberately bounded.
 */
export default async function SeriesProfileLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: ReactNode;
}) {
  const session = await getSessionCached();
  if (!session) redirect("/login/");

  const { id: routeId } = await params;
  const series = await getSeriesProfile(routeId);
  if (!series) notFound();

  const { profile, tournaments, lifecycle, isLeague, kindLabel } = series;
  const host = (await headers()).get("host") ?? "commons.fault.foundation";

  // The register control needs the tournament ROW and the member's eligible
  // teams, which the list projection doesn't carry. Only INTERNAL (Challonge)
  // tournaments have one at all, and they never acquire an organizer identity,
  // so in practice a series holds none — this resolves to an empty array. It is
  // a `Promise.all` over that handful rather than a per-strip-card query.
  const internal = tournaments.filter((t) => isTournamentId(t.id));
  const registerById = new Map(
    (
      await Promise.all(
        internal.map(async (entry) => {
          const row = await getTournament(entry.id);
          if (!row) return null;
          const teams = await listRegisterableTeams(session.user.id, row);
          return [
            entry.id,
            {
              registrationOpen: isRegistrationOpen(
                row.status,
                row.registrationOpensAt?.getTime() ?? null,
                row.registrationClosesAt?.getTime() ?? null,
              ),
              started: Boolean(row.bracketGeneratedAt),
              academicVerificationRequired: row.academicVerificationRequired,
              teams: teams.map((t) => ({
                id: t.id,
                name: t.name,
                tag: t.tag,
                entered: t.entered,
                memberCount: t.memberCount,
                unverifiedCount: t.unverifiedCount,
              })),
            },
          ] as const;
        }),
      )
    ).filter((x): x is NonNullable<typeof x> => x != null),
  );

  // The strip badge is a compact form of the status: "Registration Open" is
  // wider than the card it has to share with a name and a date.
  const stripBadge = (status: string): string | null =>
    status === "active" ? "Live" : status === "registration" ? "Open" : null;

  const strip: StripTournament[] = tournaments.map((t) => {
    const source = t.source ? sourceKey(t.source) : null;
    return {
      id: t.id,
      href: seriesTournamentPath(profile.id, t.id),
      name: t.name,
      bannerUrl: t.bannerUrl,
      statusLabel: statusLabel(t.status),
      badge: stripBadge(t.status),
      live: t.status === "active" || t.status === "registration",
      dateLabel: stripDate(t.startsAt),
      game: t.game ?? null,
      gameLogoUrl: t.gameLogoUrl ?? null,
      source,
      stats: heroStats(t),
      externalUrl: t.source ? (t.externalUrl ?? null) : null,
      sourceLabel: source ? (SOURCE_LABELS[source] ?? source) : null,
      isExternal: Boolean(t.source),
      shareUrl: `https://${host}/tournaments/${encodeURIComponent(t.id)}/`,
      shareMessage: tournamentShareText(t.name),
      register: registerById.get(t.id) ?? null,
    };
  });

  const follows = await discoveryFollowIds(session.user.id);

  return (
    <SeriesChrome
      profile={profile}
      kindLabel={kindLabel}
      isLeague={isLeague}
      seriesStatusLabel={lifecycle.status}
      seriesStatusLive={lifecycle.statusLive}
      seriesBannerUrl={tournaments.find((t) => t.bannerUrl)?.bannerUrl ?? null}
      following={follows.includes(profile.id)}
      canEdit={profile.ownerId === session.user.id}
      defaultSelectedId={preferredTournament(tournaments)?.id ?? null}
      tournaments={strip}
    >
      {children}
    </SeriesChrome>
  );
}
