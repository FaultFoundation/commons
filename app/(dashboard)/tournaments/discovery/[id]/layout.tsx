import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import {
  SeriesChrome,
  type StripTournament,
} from "@/components/dashboard/series/SeriesChrome";
import { getSessionCached } from "@/lib/session";
import {
  getSeriesProfile,
  preferredTournament,
  seriesOverviewPath,
  seriesTournamentPath,
} from "@/lib/series-profile";
import { TOURNAMENT_STATUS_LABELS } from "@/lib/tournaments-shared";

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
 * The series profile route's persistent shell.
 *
 * It owns the hero and the tournament strip so that clicking between a series'
 * tournaments replaces ONLY the panel underneath (see SeriesChrome for why the
 * split falls here). Every read it does is React-`cache`d and shared with the
 * child page in the same request, so the layout costs nothing the page wasn't
 * already paying.
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

  // The strip badge is a compact form of the status: "Registration Open" is
  // wider than the card it has to share with a name and a date.
  const stripBadge = (status: string): string | null =>
    status === "active" ? "Live" : status === "registration" ? "Open" : null;

  const strip: StripTournament[] = tournaments.map((t) => ({
    id: t.id,
    href: seriesTournamentPath(profile.id, t.id),
    name: t.name,
    bannerUrl: t.bannerUrl,
    status: t.status,
    statusLabel: statusLabel(t.status),
    badge: stripBadge(t.status),
    live: t.status === "active" || t.status === "registration",
    dateLabel: stripDate(t.startsAt),
    game: t.game ?? null,
    gameLogoUrl: t.gameLogoUrl ?? null,
    source: t.source ?? null,
  }));

  return (
    <SeriesChrome
      profileName={profile.name}
      kindLabel={kindLabel}
      isLeague={isLeague}
      seriesStatusLabel={lifecycle.status}
      seriesStatusLive={lifecycle.statusLive}
      seriesBannerUrl={tournaments.find((t) => t.bannerUrl)?.bannerUrl ?? null}
      overviewHref={seriesOverviewPath(profile.id)}
      defaultSelectedId={preferredTournament(tournaments)?.id ?? null}
      tournaments={strip}
    >
      {children}
    </SeriesChrome>
  );
}
