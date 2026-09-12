"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GameLogo } from "@/components/brand/GameLogo";
import { SourceLogo, sourceKey, type TournamentSource } from "@/components/brand/SourceLogo";
import { TournamentBannerImage as BannerImage } from "@/components/dashboard/tournaments/TournamentBannerImage";
import { DiscoveryFilters } from "@/components/dashboard/tournaments/DiscoveryFilters";
import {
  DEFAULT_LIST_STATE,
  LIST_STATE_KEY,
  VIEWS,
  reviveListState,
  type ListState,
  type TournamentListEntry,
} from "@/components/dashboard/tournaments/TournamentList";
import {
  matchesDiscovery,
  profilePath,
  seriesName,
} from "@/lib/discovery-shared";
import { usePersistentState } from "@/lib/view-state";
import { seriesStatus } from "@/lib/series-status";
import { leagueosGroup } from "@/lib/leagueos-groups";

/** How many game marks to show in a card's corner before collapsing to "+N". */
const MAX_GAME_MARKS = 3;

/** A stable gradient per series, seeded off its id — the fallback ground behind
    the banner when no member tournament has real artwork. */
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
  const hi = fmt(Math.max(...(ends.length ? ends : starts)));
  return lo === hi ? lo : `${lo} – ${hi}`;
}

/** Distinct games across a series' events, in first-seen order — the "all games
    offering" marks. */
function seriesGames(
  events: TournamentListEntry[],
): { name: string; logoUrl: string | null }[] {
  const out: { name: string; logoUrl: string | null }[] = [];
  const seen = new Set<string>();
  for (const t of events) {
    const name = t.game?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, logoUrl: t.gameLogoUrl ?? null });
  }
  return out;
}

/** Distinct external platforms the series runs on (usually one), in first-seen
    order. The internal "commons" mark is a wide wordmark and says nothing a
    reader needs in this compact corner, so it's skipped — the platform badge is
    about external provenance (start.gg / FACEIT / LeagueOS / …). */
function seriesSources(events: TournamentListEntry[]): TournamentSource[] {
  const out: TournamentSource[] = [];
  const seen = new Set<TournamentSource>();
  for (const t of events) {
    const key = sourceKey(t.source);
    if (key === "commons" || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** One grouped series, with everything a card renders precomputed. */
type SeriesGroup = {
  id: string;
  name: string;
  events: TournamentListEntry[];
  done: number;
  total: number;
  concluded: boolean;
  isLeague: boolean;
  status: string;
  statusLive: boolean;
  range: string | null;
  banner: string | null;
  sources: TournamentSource[];
  games: { name: string; logoUrl: string | null }[];
};

/**
 * The Series & Leagues surface — a single horizontal row of series cards (arrow
 * buttons scroll it), foldable behind its heading, and filtered by the SAME
 * universal filter set as the Tournaments tab (persisted under
 * `tournaments:list`), whose controls appear in the dropdown. A card is the
 * tournament tile shell (banner over body) with the platform/game marks in the
 * usual corner and a stage line + progress bar at the foot.
 */
export function SeriesList({
  tournaments,
  follows = [],
}: {
  tournaments: TournamentListEntry[];
  follows?: string[];
}) {
  // The one universal filter set, shared with the Tournaments tab. Changing a
  // filter here writes it there too (same localStorage key).
  const [list, setList] = usePersistentState<ListState>(
    LIST_STATE_KEY,
    DEFAULT_LIST_STATE,
    reviveListState,
  );
  // The section's own fold state is series-specific, so it keeps its own key.
  const [open, setOpen] = usePersistentState<boolean>(
    "series:open",
    true,
    (s) => (typeof s === "boolean" ? s : undefined),
  );
  const { view, filters } = list;
  const selectedGames = useMemo(() => new Set(list.games), [list.games]);

  /** A filter change reshapes the list, so reset the shared page to 1 (matching
      the Tournaments tab's `refine`); series don't paginate, but the shared
      state is one object. */
  const refine = (next: Partial<ListState>) =>
    setList({ ...list, ...next, page: 1 });

  const availableGames = useMemo(() => {
    const games = new Set<string>();
    for (const t of tournaments) if (t.game) games.add(t.game);
    return [...games].sort((a, b) => a.localeCompare(b));
  }, [tournaments]);

  const countries = useMemo(
    () =>
      [
        ...new Set(
          tournaments.map((t) => t.country).filter((c): c is string => Boolean(c)),
        ),
      ].sort(),
    [tournaments],
  );

  function toggleGame(game: string) {
    refine({
      games: list.games.includes(game)
        ? list.games.filter((g) => g !== game)
        : [...list.games, game],
    });
  }

  // Filters select series through matching members. Classify the complete
  // series so hiding a live game cannot move its season into the archive.
  const series = useMemo<SeriesGroup[]>(() => {
    const now = Date.now();
    const visible = new Set(
      tournaments.filter(
        (t) =>
          (selectedGames.size === 0 ||
            (t.game != null && selectedGames.has(t.game))) &&
          matchesDiscovery(t, filters, follows, now),
      ).map((t) => t.id),
    );

    const groups = new Map<
      string,
      { id: string; name: string; events: TournamentListEntry[] }
    >();
    for (const t of tournaments) {
      const league = leagueosGroup(t);
      const id = league?.id ?? t.discovery?.seriesId;
      if (!id) continue;
      const group =
        groups.get(id) ??
        (() => {
          const g = {
            id,
            name: league?.name ?? t.discovery?.seriesName ?? seriesName(t.name),
            events: [] as TournamentListEntry[],
          };
          groups.set(id, g);
          return g;
        })();
      group.events.push(t);
    }

    return [...groups.values()]
      .filter((g) => g.events.some((t) => visible.has(t.id)))
      // Recurring groups and explicit named seasons qualify as series.
      .filter(
        (g) =>
          g.id.startsWith("series:leagueos:") ||
          g.events.length > 1 ||
          (g.id.startsWith("series:competition:") &&
            g.events.some((t) =>
              /\b(?:20\d{2}|season\s+\w+)\b/i.test(
                t.discovery?.seriesName ?? "",
              ),
            )),
      )
      .map((g) => {
        return {
          ...g,
          ...seriesStatus(g.events, now),
          isLeague:
            g.id.startsWith("series:leagueos:") ||
            g.events.some((t) => t.discovery?.competition === "league"),
          range: dateRange(g.events),
          banner: g.events.find((t) => t.bannerUrl)?.bannerUrl ?? null,
          sources: seriesSources(g.events),
          games: seriesGames(g.events),
        };
      })
      .sort(
        (a, b) =>
          Number(a.concluded) - Number(b.concluded) ||
          Number(
            b.events.some((t) => t.discovery?.audience === "collegiate"),
          ) -
            Number(
              a.events.some((t) => t.discovery?.audience === "collegiate"),
            ) || a.name.localeCompare(b.name),
      );
  }, [tournaments, selectedGames, filters, follows]);

  const filtered = useMemo(() => {
    if (view === "concluded") return series.filter((g) => g.concluded);
    if (view === "active") return series.filter((g) => !g.concluded);
    return series;
  }, [series, view]);

  const concludedCount = series.filter((g) => g.concluded).length;
  const viewCounts = {
    all: series.length,
    active: series.length - concludedCount,
    concluded: concludedCount,
  };

  return (
    <section className="ff-serieslist">
      {/* The head's name is the fold toggle; the count reflects what's shown. */}
      <div className="ff-list-heading ff-serieslist__head">
        <button
          className="ff-serieslist__toggle"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Chevron open={open} />
          <h2>Series &amp; Leagues</h2>
        </button>
        <span className="ff-list-count">
          {filtered.length} leagues &amp; series
        </span>
      </div>

      {open ? (
        <>
          {/* The universal filter controls — the SAME view pills + Filter
              popover the Tournaments tab carries, bound to the shared state. */}
          <div className="ff-serieslist__controls">
            <div className="ff-ticket-views">
              {VIEWS.map((option) => (
                <button
                  key={option.key}
                  className="ff-ticket-view"
                  type="button"
                  aria-current={view === option.key ? "page" : undefined}
                  onClick={() => refine({ view: option.key })}
                >
                  {option.label}
                  {" "}({viewCounts[option.key]})
                </button>
              ))}
            </div>
            <span className="ff-list-head__divider" aria-hidden="true" />
            <DiscoveryFilters
              value={filters}
              onChange={(next) => refine({ filters: next })}
              countries={countries}
              games={availableGames}
              selectedGames={selectedGames}
              onToggleGame={toggleGame}
              onClearGames={() => refine({ games: [] })}
            />
          </div>

          {filtered.length === 0 ? (
            <p className="ff-ticket-empty">
              {series.length === 0
                ? "No leagues or series match these filters."
                : "No leagues or series in this view."}
            </p>
          ) : (
            <SeriesRow key={view} groups={filtered} />
          )}
        </>
      ) : null}
    </section>
  );
}

/** The horizontal scroller: one row of cards with left/right buttons that appear
    only when the row overflows and disable at each end. */
function SeriesRow({ groups }: { groups: SeriesGroup[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [nav, setNav] = useState({ prev: false, next: false });

  const updateNav = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const prev = el.scrollLeft > 4;
    const next = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setNav((n) => (n.prev === prev && n.next === next ? n : { prev, next }));
  }, []);

  useEffect(() => {
    updateNav();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateNav, { passive: true });
    window.addEventListener("resize", updateNav);
    return () => {
      el.removeEventListener("scroll", updateNav);
      window.removeEventListener("resize", updateNav);
    };
  }, [updateNav, groups.length]);

  function scrollBy(dir: number) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({
      left: dir * Math.max(280, el.clientWidth * 0.8),
      behavior: "smooth",
    });
  }

  const overflow = nav.prev || nav.next;
  return (
    <div className="ff-scardrow">
      {overflow ? (
        <button
          type="button"
          className="ff-scardrow__nav ff-scardrow__nav--prev"
          onClick={() => scrollBy(-1)}
          disabled={!nav.prev}
          aria-label="Scroll left"
        >
          ‹
        </button>
      ) : null}
      <div className="ff-scardrow__track" ref={trackRef}>
        {groups.map((g) => (
          <SeriesCard key={g.id} group={g} />
        ))}
      </div>
      {overflow ? (
        <button
          type="button"
          className="ff-scardrow__nav ff-scardrow__nav--next"
          onClick={() => scrollBy(1)}
          disabled={!nav.next}
          aria-label="Scroll right"
        >
          ›
        </button>
      ) : null}
    </div>
  );
}

/** A series card: the tournament tile shell (first tournament's banner, else the
    swatch), the platform/game marks in the usual corner, and a stage line +
    progress bar at the foot. */
function SeriesCard({ group: g }: { group: SeriesGroup }) {
  const shownGames = g.games.slice(0, MAX_GAME_MARKS);
  const extra = g.games.length - shownGames.length;
  const hasMarks = g.sources.length > 0 && shownGames.length > 0;
  return (
    <Link className="ff-tcard ff-scard" href={profilePath(g.id)} prefetch={false}>
      <div className="ff-tcard__banner" style={{ background: swatch(g.id) }}>
        <BannerImage url={g.banner} />
        <span
          className={`ff-scard__kind${g.isLeague ? " ff-scard__kind--league" : ""}`}
        >
          {g.isLeague ? "League" : "Series"}
        </span>
        <span
          className={`ff-tcard__status${g.statusLive ? " ff-tcard__status--live" : ""}`}
        >
          {g.status}
        </span>
      </div>
      <div className="ff-tcard__body">
        {g.range ? <span className="ff-tcard__date">{g.range}</span> : null}
        <h3 className="ff-tcard__title">{g.name}</h3>
        <span className="ff-tcard__meta">
          {g.total} {g.total === 1 ? "tournament" : "tournaments"}
        </span>
        <div className="ff-scard__foot">
          <div className="ff-scard__stage">
            <span className="ff-scard__stagelabel">
              {g.concluded
                ? "All concluded"
                : `${g.done} of ${g.total} concluded`}
            </span>
            {/* Platform + game marks, the same cluster a tournament tile shows. */}
            <span className="ff-tcard__marks ff-scard__marks">
              {g.sources.map((s) => (
                <SourceLogo key={s} source={s} />
              ))}
              {hasMarks ? (
                <span className="ff-tcard__brandsep" aria-hidden="true" />
              ) : null}
              {shownGames.map((game) => (
                <GameLogo
                  key={game.name}
                  name={game.name}
                  logoUrl={game.logoUrl}
                />
              ))}
              {extra > 0 ? (
                <span className="ff-scard__gamemore">+{extra}</span>
              ) : null}
            </span>
          </div>
          <progress
            className="ff-scard__bar"
            max={g.total}
            value={g.done}
            aria-label={`${g.done} of ${g.total} tournaments concluded`}
          />
        </div>
      </div>
    </Link>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
      width="14"
      height="14"
      style={{
        transform: open ? "rotate(90deg)" : undefined,
        transition: "transform .15s",
      }}
    >
      <path
        d="M6 4l4 4-4 4"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
