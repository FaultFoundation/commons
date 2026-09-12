"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useMemo, type ReactNode } from "react";

import { GameLogo } from "@/components/brand/GameLogo";
import { SourceLogo, type TournamentSource } from "@/components/brand/SourceLogo";
import { TournamentBannerImage } from "@/components/dashboard/tournaments/TournamentBannerImage";
import { CardRow } from "@/components/dashboard/series/CardRow";
import { ExternalTournamentRefresh } from "@/components/dashboard/tournaments/ExternalTournamentRefresh";
import { ProfileActions } from "@/components/dashboard/tournaments/DiscoveryActions";
import { ShareBar } from "@/components/dashboard/tournaments/ShareBar";
import {
  TournamentRegister,
  type RegisterTeam,
} from "@/components/dashboard/tournaments/TournamentRegister";
import type { DiscoveryProfile } from "@/lib/discovery-shared";

/** Everything the persistent hero + strip need for one member tournament. A
    deliberately small projection of TournamentListEntry: the chrome is a client
    component, so this crosses the server/client boundary on every series open. */
export type StripTournament = {
  id: string;
  href: string;
  name: string;
  bannerUrl: string | null;
  statusLabel: string;
  /** Compact pill for the strip card ("Live" / "Open"), null when not running. */
  badge: string | null;
  live: boolean;
  dateLabel: string | null;
  game: string | null;
  gameLogoUrl: string | null;
  source: TournamentSource | null;
  /** The hero's stat pairs, built server-side (see the layout's `heroStats`). */
  stats: { label: string; value: string; hi?: boolean }[];
  externalUrl: string | null;
  sourceLabel: string | null;
  isExternal: boolean;
  shareUrl: string;
  shareMessage: string;
  /** Internal (Challonge) tournaments only; null for everything else. */
  register: {
    registrationOpen: boolean;
    started: boolean;
    academicVerificationRequired: boolean;
    teams: RegisterTeam[];
  } | null;
};

/**
 * The series profile shell: the tournament hero, a horizontal strip of the
 * series' tournaments, and the selected tournament's tabs rendered beneath.
 *
 * The point of the whole surface is that moving between a season's tournaments
 * is one click with no page-level disruption, so three things are load-bearing:
 *
 * - **This component lives in the route LAYOUT, the tabs and panels in the child
 *   page.** A Next layout is not remounted when a sibling child segment
 *   changes, so the hero and the strip survive navigation untouched — only the
 *   panels below them are replaced (behind `[tid]/loading.tsx`). Putting the
 *   hero in the page instead would rebuild it on every click and flash the
 *   banner.
 * - **The hero's content comes from the strip data, not the child page.** A
 *   layout can't read a child segment's params, but it CAN read which child is
 *   active (`useSelectedLayoutSegment`), and it already holds every member
 *   tournament. So the banner/title/status/stats swap the instant a card is
 *   clicked — client-side, ahead of the server render landing.
 * - **The hero is the WHOLE hero, stat bar included.** The stat/action row is
 *   attached to the banner in one `.ff-thero` card, exactly as a standalone
 *   tournament page renders it; the strip sits under that card. Splitting the
 *   two across layout and page (the banner here, the stats in the panel) put
 *   the strip between them and left the stats reading as a loose slab.
 *
 * The series identity stays in the hero's eyebrow, above the tournament's title,
 * with Follow / claim / edit in the action row beside the tournament's own.
 */
export function SeriesChrome({
  profile,
  kindLabel,
  isLeague,
  seriesStatusLabel,
  seriesStatusLive,
  seriesBannerUrl,
  following,
  canEdit,
  defaultSelectedId,
  tournaments,
  children,
}: {
  profile: DiscoveryProfile;
  kindLabel: string;
  isLeague: boolean;
  seriesStatusLabel: string;
  seriesStatusLive: boolean;
  seriesBannerUrl: string | null;
  following: boolean;
  canEdit: boolean;
  /** Which tournament the profile INDEX renders (it shows what's current rather
      than redirecting). With no child segment active, that is the selection the
      hero and strip must agree with. */
  defaultSelectedId: string | null;
  tournaments: StripTournament[];
  children: ReactNode;
}) {
  // The active child segment is the tournament id as it appears in the URL.
  // External ids carry `source:` prefixes and are percent-encoded in the link,
  // so match on both spellings rather than assuming which one comes back.
  const segment = useSelectedLayoutSegment();
  const selected = useMemo(() => {
    // No child segment: the index panel, which renders `defaultSelectedId`.
    const wanted = segment ?? defaultSelectedId;
    if (!wanted) return null;
    let decoded = wanted;
    try {
      decoded = decodeURIComponent(wanted);
    } catch {
      /* Malformed sequence: fall through to the raw comparison. */
    }
    return (
      tournaments.find(
        (t) => t.id === wanted || t.id === decoded || encodeURIComponent(t.id) === wanted,
      ) ?? null
    );
  }, [segment, defaultSelectedId, tournaments]);

  // With no tournament resolved (an empty series, or an id that isn't a member)
  // the hero falls back to describing the series itself.
  const heroBanner = selected?.bannerUrl ?? seriesBannerUrl;
  const heroTitle = selected?.name ?? profile.name;
  const heroStatus = selected?.statusLabel ?? seriesStatusLabel;
  const heroLive = selected ? selected.live : seriesStatusLive;

  return (
    <div className="ff-tview ff-sview">
      <section className="ff-thero">
        {/* Keyed on the selection so the artwork re-mounts and fades in rather
            than snapping — the one bit of motion in an otherwise fixed hero. */}
        <div className="ff-thero__banner" key={selected?.id ?? "series"}>
          <TournamentBannerImage
            url={heroBanner}
            className="ff-thero__banner-img ff-sview__banner-img"
            eager
          />
          <div className="ff-thero__head">
            <div className="ff-sview__eyebrow">
              <Link className="ff-sview__crumb" href="/series/">
                Series &amp; Leagues
              </Link>
              <span aria-hidden="true">/</span>
              <span className="ff-sview__crumb ff-sview__crumb--here">
                {profile.name}
              </span>
              <span
                className={`ff-serieslist__kind${isLeague ? " ff-serieslist__kind--league" : ""}`}
              >
                {kindLabel}
              </span>
            </div>
            <span
              className={`ff-thero__status${heroLive ? " ff-thero__status--live" : ""}`}
            >
              {heroStatus}
            </span>
            <h2 className="ff-thero__title">{heroTitle}</h2>
          </div>
        </div>
        <div className="ff-thero__body">
          {selected ? (
            <div className="ff-thero__meta">
              <div className="ff-thero__stats">
                {selected.stats.map((stat) => (
                  <div className="ff-stat" key={stat.label}>
                    <span className="ff-stat__label">{stat.label}</span>
                    <span
                      className={`ff-stat__value${stat.hi ? " ff-stat__value--hi" : ""}`}
                    >
                      {stat.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="ff-thero__actions">
            {selected?.register ? (
              <TournamentRegister
                tournamentId={selected.id}
                registrationOpen={selected.register.registrationOpen}
                started={selected.register.started}
                academicVerificationRequired={
                  selected.register.academicVerificationRequired
                }
                teams={selected.register.teams}
              />
            ) : null}
            {selected?.externalUrl ? (
              <a
                className="ff-btn ff-btn--outline ff-btn--sm"
                href={selected.externalUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                View on {selected.sourceLabel}
              </a>
            ) : null}
            {selected?.isExternal ? (
              <ExternalTournamentRefresh id={selected.id} />
            ) : null}
            {selected ? (
              <ShareBar
                url={selected.shareUrl}
                title={selected.name}
                message={selected.shareMessage}
              />
            ) : null}
            {/* Series-level, so it sits in the same row and never changes as the
                member moves along the strip. */}
            <ProfileActions
              profile={profile}
              following={following}
              canEdit={canEdit}
            />
          </div>
        </div>
      </section>

      {tournaments.length > 0 ? (
        <nav className="ff-tstrip" aria-label={`Tournaments in ${profile.name}`}>
          <CardRow label="tournaments" activeKey={selected?.id ?? null}>
            {tournaments.map((t) => {
              const active = selected?.id === t.id;
              return (
                <Link
                  key={t.id}
                  className={`ff-tstrip__card${active ? " ff-tstrip__card--active" : ""}`}
                  href={t.href}
                  data-active={active ? "true" : undefined}
                  aria-current={active ? "page" : undefined}
                  prefetch={false}
                >
                  <span className="ff-tstrip__thumb">
                    <TournamentBannerImage
                      url={t.bannerUrl}
                      className="ff-tstrip__thumb-img"
                    />
                    {t.game ? (
                      <GameLogo name={t.game} logoUrl={t.gameLogoUrl} />
                    ) : null}
                  </span>
                  <span className="ff-tstrip__text">
                    <span className="ff-tstrip__name">{t.name}</span>
                    <span className="ff-tstrip__meta">
                      {t.badge ? (
                        <span className="ff-tstrip__live">{t.badge}</span>
                      ) : null}
                      {t.dateLabel ?? (t.badge ? null : t.statusLabel)}
                    </span>
                  </span>
                  {t.source && t.source !== "commons" ? (
                    <span className="ff-tstrip__source">
                      <SourceLogo source={t.source} />
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </CardRow>
        </nav>
      ) : null}

      {children}
    </div>
  );
}
