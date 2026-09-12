"use client";

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useMemo, type ReactNode } from "react";

import { GameLogo } from "@/components/brand/GameLogo";
import { SourceLogo, sourceKey } from "@/components/brand/SourceLogo";
import { TournamentBannerImage } from "@/components/dashboard/tournaments/TournamentBannerImage";
import { CardRow } from "@/components/dashboard/series/CardRow";

/** Everything the persistent hero + strip need for one member tournament. A
    deliberately small projection of TournamentListEntry: the chrome is a client
    component, so this crosses the server/client boundary on every series open. */
export type StripTournament = {
  id: string;
  href: string;
  name: string;
  bannerUrl: string | null;
  status: string;
  statusLabel: string;
  /** Compact pill for the strip card ("Live" / "Open"), null when not running. */
  badge: string | null;
  live: boolean;
  dateLabel: string | null;
  game: string | null;
  gameLogoUrl: string | null;
  source: string | null;
};

/**
 * The series profile shell: a hero that stays put and a horizontal strip of the
 * series' tournaments, with the selected tournament's page rendered beneath.
 *
 * The point of the whole surface is that moving between a season's tournaments
 * is one click with no page-level disruption, so two things are load-bearing:
 *
 * - **This component lives in the route LAYOUT, the tournament in the child
 *   page.** A Next layout is not remounted when a sibling child segment
 *   changes, so the hero and the strip survive navigation untouched — only the
 *   panel below them is replaced (behind `[tid]/loading.tsx`). Putting the hero
 *   in the page instead would rebuild it on every click and flash the banner.
 * - **The hero's content comes from the strip data, not the child page.** A
 *   layout can't read a child segment's params, but it CAN read which child is
 *   active (`useSelectedLayoutSegment`), and it already holds every member
 *   tournament. So the banner/title/status swap the instant a card is clicked —
 *   client-side, ahead of the server render landing.
 *
 * The series identity never leaves the hero: it's the eyebrow line above the
 * title, and the first strip card returns to the series overview.
 */
export function SeriesChrome({
  profileName,
  kindLabel,
  isLeague,
  seriesStatusLabel,
  seriesStatusLive,
  seriesBannerUrl,
  overviewHref,
  defaultSelectedId,
  tournaments,
  children,
}: {
  profileName: string;
  kindLabel: string;
  isLeague: boolean;
  seriesStatusLabel: string;
  seriesStatusLive: boolean;
  seriesBannerUrl: string | null;
  overviewHref: string;
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
    // The overview segment is the one place that shows the series itself.
    if (segment === "series") return null;
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

  // Only the overview segment itself is "the series"; the index is a tournament.
  const onOverview = segment === "series";
  const showingSeries = selected == null;
  const heroBanner = selected?.bannerUrl ?? seriesBannerUrl;
  const heroTitle = selected?.name ?? profileName;
  const heroStatus = selected?.statusLabel ?? seriesStatusLabel;
  const heroLive = selected ? selected.live : seriesStatusLive;

  return (
    <div className="ff-tview ff-sview">
      <section className="ff-thero ff-sview__hero">
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
              {showingSeries ? (
                <span className="ff-sview__crumb ff-sview__crumb--here">
                  {profileName}
                </span>
              ) : (
                <Link className="ff-sview__crumb" href={overviewHref}>
                  {profileName}
                </Link>
              )}
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
      </section>

      {tournaments.length > 0 ? (
        <nav className="ff-tstrip" aria-label={`Tournaments in ${profileName}`}>
          <CardRow label="tournaments" activeKey={selected?.id ?? "series"}>
            <Link
              className={`ff-tstrip__card ff-tstrip__card--series${onOverview ? " ff-tstrip__card--active" : ""}`}
              href={overviewHref}
              data-active={onOverview ? "true" : undefined}
              aria-current={onOverview ? "page" : undefined}
              prefetch={false}
            >
              <span className="ff-tstrip__thumb ff-tstrip__thumb--series" aria-hidden="true">
                <SeriesGlyph />
              </span>
              <span className="ff-tstrip__text">
                <span className="ff-tstrip__name">{kindLabel} overview</span>
                <span className="ff-tstrip__meta">
                  {tournaments.length}{" "}
                  {tournaments.length === 1 ? "tournament" : "tournaments"}
                </span>
              </span>
            </Link>

            {tournaments.map((t) => {
              const active = selected?.id === t.id;
              const source = t.source ? sourceKey(t.source) : null;
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
                  {source && source !== "commons" ? (
                    <span className="ff-tstrip__source">
                      <SourceLogo source={source} />
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

/** A stacked-cards mark for the "series overview" strip entry — inline SVG, in
    keeping with TrophyIcon and the rest of the tournament view. */
function SeriesGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor">
      <rect x="2.5" y="6.5" width="15" height="11" rx="2" strokeWidth="1.5" />
      <path d="M5 4h10M6.5 1.75h7" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
