"use client";

import Link from "next/link";
import { DiscoveryRail } from "./DiscoveryRail";
import { DiscoveryFilters } from "./DiscoveryFilters";
import { EMPTY_FILTERS, matchesDiscovery, discoveryScore } from "@/lib/discovery-shared";
import { CorrectionDialog } from "./DiscoveryActions";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { GameLogo } from "@/components/brand/GameLogo";
import { SourceLogo, sourceKey } from "@/components/brand/SourceLogo";
import {
  TOURNAMENT_LAYOUT_COOKIE,
  TOURNAMENT_LAYOUT_COOKIE_MAX_AGE,
  TOURNAMENT_FORMAT_LABELS,
  TOURNAMENT_STATUS_LABELS,
  type TournamentLayout,
  type TournamentFormat,
  type TournamentStatus,
} from "@/lib/tournaments-shared";

export type TournamentListEntry = {
  academicVerificationRequired?: boolean;
  description?: string | null;
  organizer?: string | null;
  organizerUrl?: string | null;
  endsAt?: number | null;
  sourceStartsAt?: number | null;
  country?: string | null;
  city?: string | null;
  registrationClosesAt?: number | null;
  prizePool?: string | null;
  discovery?: import("@/lib/discovery-shared").DiscoveryMetadata;
  id: string;
  name: string;
  format: string;
  status: string;
  entrantCount: number;
  maxParticipants: number | null;
  startsAt: number | null;
  bannerUrl: string | null;
  /** At most one is featured — the hero at the top of the tab. */
  featured: boolean;
  /** Game shown as the bottom-right mark: name for the monogram fallback,
      logoUrl for real art (see components/brand/GameLogo). */
  game?: string | null;
  gameLogoUrl?: string | null;
  // External (cen-sql) tournaments carry a source; internal Commons ones leave
  // these unset. `externalUrl` is the native-site link the card opens for now.
  source?: string | null; // 'startgg' | 'faceit'
  externalUrl?: string | null;
  // The provider tournament id, shared across a multi-game tournament's per-game
  // rows. `${source}:${sourceTournamentId}` groups those cards into one series.
  sourceTournamentId?: string | null;
};

/** All is the complete catalog; Active remains the default working view and
    Concluded is the archive. */
const VIEWS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "concluded", label: "Concluded" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

/** Per-page choices; 0 means "All" (no pagination). */
const PAGE_SIZE_OPTIONS = [12, 24, 48, 0] as const;
const DEFAULT_PAGE_SIZE = 12;

/** A compact page-number window: first, last, and the pages around the current
    one, with "…" gaps. */
function pageWindow(current: number, total: number): (number | "…")[] {
  const out: (number | "…")[] = [];
  for (let i = 1; i <= total; i += 1) {
    if (i === 1 || i === total || (i >= current - 1 && i <= current + 1)) {
      out.push(i);
    } else if (out[out.length - 1] !== "…") {
      out.push("…");
    }
  }
  return out;
}

/** completed/cancelled are the "concluded" states; everything else is active. */
function isConcluded(status: string): boolean {
  return status === "completed" || status === "cancelled";
}

/** Midnight this morning, local time — the boundary between "upcoming" tiles and
    the "Past tournaments" archive. */
function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Upcoming = dated today-or-later, or undated (TBD sorts in with upcoming). */
function isUpcoming(entry: TournamentListEntry, today: number): boolean {
  return entry.startsAt == null || entry.startsAt >= today;
}

/** Soonest first; undated last. */
function byStartAsc(a: TournamentListEntry, b: TournamentListEntry): number {
  if (a.startsAt == null) return 1;
  if (b.startsAt == null) return -1;
  return a.startsAt - b.startsAt;
}

/** Most recent first; undated last. */
function byStartDesc(a: TournamentListEntry, b: TournamentListEntry): number {
  if (a.startsAt == null) return 1;
  if (b.startsAt == null) return -1;
  return b.startsAt - a.startsAt;
}

/** Upcoming first (soonest to latest), then past (newest to oldest). */
function byTimeline(today: number) {
  return (a: TournamentListEntry, b: TournamentListEntry): number => {
    const aUpcoming = isUpcoming(a, today);
    const bUpcoming = isUpcoming(b, today);
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    return aUpcoming ? byStartAsc(a, b) : byStartDesc(a, b);
  };
}

/**
 * The member's tournament list. **Active** (default) shows a featured hero — the
 * admin-set featured tournament, else the soonest upcoming — then tiles for
 * tournaments starting today or later (soonest first), with older still-running
 * ones tucked into a "Past tournaments" disclosure. **Concluded** is the archive,
 * most-recent first. Two layouts (modern card grid / compact table) toggle
 * top-right and persist in a cookie so the server can render the saved layout on
 * first paint. All filtering is client-side: the server hands down every visible
 * tournament once (the list is small and bounded).
 */
export function TournamentList({
  tournaments,
  initialLayout,
  follows = [],
}: {
  tournaments: TournamentListEntry[];
  initialLayout: TournamentLayout;
  follows?: string[];
}) {
  const [filters, setFilters] = useState({...EMPTY_FILTERS});
  const [view, setView] = useState<ViewKey>("active");
  const [layout, setLayout] = useState<TournamentLayout>(initialLayout);
  const [showPast, setShowPast] = useState(true);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  // One shared correction dialog for the whole list — the "?" on any card/hero
  // opens it with that tournament.
  const [correcting, setCorrecting] = useState<TournamentListEntry | null>(null);
  // Which games to show; empty = no filter (every game shows). Kept as
  // in-memory state and applied with a plain .filter() below — same
  // client-side approach as the rest of this list, so toggling a game never
  // costs a request or Worker CPU.
  const [selectedGames, setSelectedGames] = useState<Set<string>>(new Set());

  function chooseLayout(next: TournamentLayout) {
    setLayout(next);
    document.cookie = `${TOURNAMENT_LAYOUT_COOKIE}=${next}; path=/; max-age=${TOURNAMENT_LAYOUT_COOKIE_MAX_AGE}; samesite=lax`;
  }

  const availableGames = useMemo(() => {
    const games = new Set<string>();
    for (const t of tournaments) {
      if (t.game) games.add(t.game);
    }
    return Array.from(games).sort((a, b) => a.localeCompare(b));
  }, [tournaments]);

  function toggleGame(game: string) {
    setSelectedGames((prev) => {
      const next = new Set(prev);
      if (next.has(game)) {
        next.delete(game);
      } else {
        next.add(game);
      }
      return next;
    });
  }

  const visibleTournaments = useMemo(() => {
    return tournaments.filter(t => (selectedGames.size === 0 || (t.game != null && selectedGames.has(t.game))) && matchesDiscovery(t, filters, follows, Date.now()));
  }, [tournaments, selectedGames, filters, follows]);

  const { featured, upcoming, past, concluded, all } = useMemo(() => {
    const today = startOfTodayMs();
    const active = visibleTournaments.filter((t) => !isConcluded(t.status));
    const done = visibleTournaments
      .filter((t) => isConcluded(t.status))
      .sort(byStartDesc);

    // The hero: the admin-featured one, else the soonest upcoming, else the most
    // recent active tournament (so the slot is never empty when anything active
    // exists).
    const flagged = [...active].sort((a,b) => discoveryScore(b, today) - discoveryScore(a,today) || byStartAsc(a,b))[0];
    const soonest = active
      .filter((t) => t.startsAt != null && t.startsAt >= today)
      .sort(byStartAsc)[0];
    const hero =
      flagged ?? soonest ?? [...active].sort(byStartDesc)[0] ?? null;

    const rest = hero ? active.filter((t) => t.id !== hero.id) : active;
    return {
      featured: hero,
      upcoming: rest.filter((t) => isUpcoming(t, today)).sort(byStartAsc),
      past: rest.filter((t) => !isUpcoming(t, today)).sort(byStartDesc),
      concluded: done,
      all: visibleTournaments
        .filter((t) => t.id !== hero?.id)
        .sort(byTimeline(today)),
    };
  }, [visibleTournaments]);

  const activeEmpty = !featured && upcoming.length === 0 && past.length === 0;
  const allEmpty = !featured && all.length === 0;

  // The list that paginates for the current view. Active keeps its "Past
  // tournaments" archive separate (a toggle below), so in card view its primary
  // list is just `upcoming`; the compact table folds past in.
  const primary =
    view === "all"
      ? all
      : view === "concluded"
        ? concluded
        : layout === "compact"
          ? [...upcoming, ...past]
          : upcoming;

  const totalPages =
    pageSize > 0 ? Math.max(1, Math.ceil(primary.length / pageSize)) : 1;
  // Clamp so a shrinking list (filtering, a smaller page size) never strands the
  // viewer on an empty page.
  const currentPage = Math.min(page, totalPages);
  const pageItems =
    pageSize > 0
      ? primary.slice((currentPage - 1) * pageSize, currentPage * pageSize)
      : primary;

  // Back to page 1 whenever the view, layout, filters, or page size change.
  useEffect(() => {
    setPage(1);
  }, [view, layout, selectedGames, filters, pageSize]);

  const showFeatured = view !== "concluded";
  const isEmpty =
    view === "all"
      ? allEmpty
      : view === "concluded"
        ? concluded.length === 0
        : activeEmpty;
  const emptyMessage =
    view === "all"
      ? "No tournaments yet."
      : view === "concluded"
        ? "No concluded tournaments yet."
        : "Nothing here right now.";

  return (
    <>
      <div className="ff-list-head">
        <div className="ff-list-head__controls">
          <div className="ff-ticket-views">
            {VIEWS.map((option) => (
              <button
                key={option.key}
                className="ff-ticket-view"
                type="button"
                aria-current={view === option.key ? "page" : undefined}
                onClick={() => setView(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className="ff-list-head__divider" aria-hidden="true" />
          <DiscoveryFilters
            value={filters}
            onChange={setFilters}
            countries={[...new Set(tournaments.map((t) => t.country).filter((c): c is string => Boolean(c)))].sort()}
            games={availableGames}
            selectedGames={selectedGames}
            onToggleGame={toggleGame}
            onClearGames={() => setSelectedGames(new Set())}
          />
        </div>

        <input
          className="ff-list-search"
          type="search"
          value={filters.query}
          onChange={(e) => setFilters({ ...filters, query: e.target.value })}
          placeholder="Search tournaments, organizers or games"
          aria-label="Search tournaments"
        />

        <div className="ff-viewtoggle" role="group" aria-label="View style">
          <button
            className="ff-viewtoggle__btn"
            type="button"
            aria-pressed={layout === "modern"}
            title="Card view"
            onClick={() => chooseLayout("modern")}
          >
            <GridIcon />
            <span className="screen-reader-text">Card view</span>
          </button>
          <button
            className="ff-viewtoggle__btn"
            type="button"
            aria-pressed={layout === "compact"}
            title="Compact view"
            onClick={() => chooseLayout("compact")}
          >
            <RowsIcon />
            <span className="screen-reader-text">Compact view</span>
          </button>
        </div>
      </div>

      {view !== "concluded" ? (
        <DiscoveryRail tournaments={visibleTournaments} />
      ) : null}
      <p className="ff-list-count" aria-live="polite">
        {view === "concluded"
          ? concluded.length
          : view === "all"
            ? all.length + (featured ? 1 : 0)
            : upcoming.length + past.length + (featured ? 1 : 0)}{" "}
        matching tournaments
      </p>
      {isEmpty ? (
        <p className="ff-ticket-empty">{Object.values(filters).some(Boolean) || selectedGames.size ? "No tournaments match these filters. Try clearing a filter or choosing All." : emptyMessage}</p>
      ) : (
        <>
          {showFeatured && featured ? (
            <div className="ff-tcard-wrap ff-tcard-wrap--hero">
              <FeaturedHero tournament={featured} />
              <div className="ff-tcard__corner">
                <BrandMarks t={featured} />
                <CorrectButton onClick={() => setCorrecting(featured)} />
              </div>
            </div>
          ) : null}

          {pageItems.length > 0 ? (
            layout === "modern" ? (
              <CardGrid tournaments={pageItems} onCorrect={setCorrecting} />
            ) : (
              <CompactTable tournaments={pageItems} onCorrect={setCorrecting} />
            )
          ) : null}

          {/* Active card view keeps still-running older tournaments behind a
              toggle, separate from the paginated upcoming grid. */}
          {view === "active" && layout === "modern" && past.length > 0 ? (
            <div className="ff-tpast">
              <button
                className="ff-tpast__toggle"
                type="button"
                aria-expanded={showPast}
                onClick={() => setShowPast((v) => !v)}
              >
                <Chevron open={showPast} />
                Ongoing tournaments ({past.length})
              </button>
              {showPast ? (
                <CardGrid tournaments={past} onCorrect={setCorrecting} />
              ) : null}
            </div>
          ) : null}

          <PaginationBar
            total={primary.length}
            totalPages={totalPages}
            page={currentPage}
            pageSize={pageSize}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        </>
      )}
      <CorrectionDialog
        tournament={correcting}
        onClose={() => setCorrecting(null)}
      />
    </>
  );
}

/** Page numbers + a per-page dropdown, below the list. Hidden entirely when the
    list is empty; the page numbers appear only when there's more than one page,
    but the dropdown always shows so the viewer can change the page size. */
function PaginationBar({
  total,
  totalPages,
  page,
  pageSize,
  onPage,
  onPageSize,
}: {
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="ff-pager">
      {totalPages > 1 ? (
        <nav className="ff-pager__pages" aria-label="Pagination">
          <button
            className="ff-pager__btn"
            type="button"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            aria-label="Previous page"
          >
            ‹
          </button>
          {pageWindow(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="ff-pager__gap" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={p}
                className="ff-pager__btn"
                type="button"
                aria-current={p === page ? "page" : undefined}
                onClick={() => onPage(p)}
              >
                {p}
              </button>
            ),
          )}
          <button
            className="ff-pager__btn"
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
            aria-label="Next page"
          >
            ›
          </button>
        </nav>
      ) : (
        <span className="ff-pager__summary">
          {total} {total === 1 ? "tournament" : "tournaments"}
        </span>
      )}
      <label className="ff-pager__size">
        <span>Per page</span>
        <select
          className="ff-pager__select"
          value={pageSize}
          onChange={(event) => onPageSize(Number(event.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n === 0 ? "All" : n}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Where a card/hero links — always the branded Commons view now, for both
    internal and external tournaments. External ids carry a `source:` prefix, so
    they're encoded for the path (the internal 6-digit ids are unaffected); the
    detail page branches on the id and, for external ones, keeps a "View on
    start.gg/FACEIT" out-link. */
function hrefFor(t: TournamentListEntry): string {
  return `/tournaments/${encodeURIComponent(t.id)}/`;
}

function TournamentLink({
  tournament,
  className,
  children,
}: {
  tournament: TournamentListEntry;
  className: string;
  children: ReactNode;
}) {
  return (
    <Link
      className={className}
      href={hrefFor(tournament)}
      prefetch={false}
      data-status={tournament.status}
    >
      {children}
    </Link>
  );
}

function metaFor(t: TournamentListEntry): string {
  if (t.source) {
    return t.entrantCount ? `${t.entrantCount} entrants` : "";
  }
  const teams = `${t.entrantCount}${
    t.maxParticipants ? ` / ${t.maxParticipants}` : ""
  } ${t.entrantCount === 1 ? "team" : "teams"}`;
  const format = TOURNAMENT_FORMAT_LABELS[t.format as TournamentFormat];
  return format ? `${format} · ${teams}` : teams;
}

/** Whether a timestamp carries a meaningful time-of-day (not local midnight,
    which is how a date-only value lands). */
function hasTime(d: Date): boolean {
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

function formatDate(ms: number | null): string {
  if (!ms) return "Date TBD";
  const d = new Date(ms);
  const date = d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  if (!hasTime(d)) return date;
  return `${date} · ${d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/** Compact "Starts" cell: date, plus the time when the data has one. */
function formatDateShort(ms: number | null): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  if (!hasTime(d)) return date;
  return `${date}, ${d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/** The banner overlay shared by the hero and the regular card: the status pill
    top-right. (The source + game marks moved down into the bottom-right corner
    cluster beside the "?" — see BrandMarks / .ff-tcard__corner.) */
function BannerChrome({ t }: { t: TournamentListEntry }) {
  const live = t.status === "registration" || t.status === "active";
  return (
    <span className={`ff-tcard__status${live ? " ff-tcard__status--live" : ""}`}>
      {TOURNAMENT_STATUS_LABELS[t.status as TournamentStatus] ?? t.status}
    </span>
  );
}

/** Source + game marks, shown in the card's bottom-right corner cluster (left of
    the "?") and in the compact table's brand column. */
function BrandMarks({ t }: { t: TournamentListEntry }) {
  return (
    <span className="ff-tcard__marks">
      <SourceLogo source={sourceKey(t.source)} />
      <span className="ff-tcard__brandsep" aria-hidden="true" />
      <GameLogo name={t.game} logoUrl={t.gameLogoUrl} />
    </span>
  );
}

function BannerImage({
  url,
  eager = false,
}: {
  url: string | null;
  eager?: boolean;
}) {
  if (!url) return null;
  return (
    <img
      className="ff-tcard__banner-img"
      src={url}
      alt=""
      width={1280}
      height={720}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
    />
  );
}

function FeaturedHero({ tournament: t }: { tournament: TournamentListEntry }) {
  return (
    <TournamentLink tournament={t} className="ff-tcard ff-tcard--hero">
      <div className="ff-tcard__banner">
        <BannerImage url={t.bannerUrl} eager />
        <BannerChrome t={t} />
      </div>
      <div className="ff-tcard__body">
        <span className="ff-tcard__date">{formatDate(t.startsAt)}</span>
        <h2 className="ff-tcard__title">{t.name}</h2>
        <span className="ff-tcard__meta">{metaFor(t) || "—"}</span>
      </div>
    </TournamentLink>
  );
}

function TournamentCard({ tournament: t }: { tournament: TournamentListEntry }) {
  return (
    <TournamentLink tournament={t} className="ff-tcard">
      <div className="ff-tcard__banner">
        <BannerImage url={t.bannerUrl} />
        <BannerChrome t={t} />
      </div>
      <div className="ff-tcard__body">
        <span className="ff-tcard__date">{formatDate(t.startsAt)}</span>
        <h3 className="ff-tcard__title">{t.name}</h3>
        <span className="ff-tcard__meta">{metaFor(t) || "—"}</span>
      </div>
    </TournamentLink>
  );
}

/** The small "?" affordance in a card's corner (or inline in a compact row) that
    opens the correction dialog. It sits OUTSIDE the card's `<a>` — an anchor can't
    hold a button — so the wrapper `.ff-tcard-wrap` is what positions it. */
function CorrectButton({
  onClick,
  inline = false,
}: {
  onClick: () => void;
  inline?: boolean;
}) {
  return (
    <button
      type="button"
      className={`ff-tcard__correct${inline ? " ff-tcard__correct--inline" : ""}`}
      title="Suggest a correction"
      aria-label="Suggest a correction"
      onClick={onClick}
    >
      ?
    </button>
  );
}

/** The card grid, each card wrapped so its "?" can float in the corner. Shared by
    the list's paginated/past grids and the standalone `TournamentCards`. */
function CardGrid({
  tournaments,
  onCorrect,
}: {
  tournaments: TournamentListEntry[];
  onCorrect: (t: TournamentListEntry) => void;
}) {
  return (
    <div className="ff-tcard-grid">
      {tournaments.map((t) => (
        <div className="ff-tcard-wrap" key={t.id}>
          <TournamentCard tournament={t} />
          <div className="ff-tcard__corner">
            <BrandMarks t={t} />
            <CorrectButton onClick={() => onCorrect(t)} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A self-contained card grid with its own correction dialog — for surfaces that
    want the tournament bubbles without the whole list chrome (the series page). */
export function TournamentCards({
  tournaments,
  empty = "No tournaments recorded yet.",
}: {
  tournaments: TournamentListEntry[];
  empty?: string;
}) {
  const [correcting, setCorrecting] = useState<TournamentListEntry | null>(null);
  if (tournaments.length === 0)
    return <p className="ff-ticket-empty">{empty}</p>;
  return (
    <>
      <CardGrid tournaments={tournaments} onCorrect={setCorrecting} />
      <CorrectionDialog
        tournament={correcting}
        onClose={() => setCorrecting(null)}
      />
    </>
  );
}

function CompactTable({
  tournaments,
  onCorrect,
}: {
  tournaments: TournamentListEntry[];
  onCorrect: (t: TournamentListEntry) => void;
}) {
  return (
    <div className="ff-ticket-table-wrap">
      <table className="ff-ticket-table">
        <thead>
          <tr>
            <th scope="col">Tournament</th>
            <th scope="col">Format</th>
            <th scope="col">Entrants</th>
            <th scope="col">Starts</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {tournaments.map((t) => {
            const external = Boolean(t.source);
            return (
              <tr key={t.id}>
                <td>
                  <span className="ff-ticket-row">
                    <CorrectButton onClick={() => onCorrect(t)} inline />
                    <span className="ff-ticket-brand">
                      <SourceLogo source={sourceKey(t.source)} />
                      <span className="ff-tcard__brandsep" aria-hidden="true" />
                      <GameLogo name={t.game} logoUrl={t.gameLogoUrl} />
                    </span>
                    <Link
                      className="ff-ticket-subject"
                      href={hrefFor(t)}
                      prefetch={false}
                    >
                      {t.name}
                    </Link>
                  </span>
                </td>
                <td>
                  {external
                    ? (t.game ?? "—")
                    : (TOURNAMENT_FORMAT_LABELS[t.format as TournamentFormat] ??
                      t.format)}
                </td>
                <td>
                  {t.entrantCount}
                  {!external && t.maxParticipants ? ` / ${t.maxParticipants}` : ""}
                </td>
                <td>{formatDateShort(t.startsAt)}</td>
                <td>
                  {t.status === "registration" || t.status === "active" ? (
                    <span className="ff-ticket-status ff-ticket-status--open">
                      {TOURNAMENT_STATUS_LABELS[t.status as TournamentStatus]}
                    </span>
                  ) : (
                    <span className="ff-badge">
                      {TOURNAMENT_STATUS_LABELS[t.status as TournamentStatus] ??
                        t.status}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
      style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform .15s" }}
    >
      <path d="M6 4l4 4-4 4" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" width="16" height="16">
      <rect x="1" y="1" width="6" height="6" rx="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function RowsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" width="16" height="16">
      <rect x="1" y="2" width="14" height="3" rx="1.5" />
      <rect x="1" y="7" width="14" height="3" rx="1.5" />
      <rect x="1" y="12" width="14" height="3" rx="1.5" />
    </svg>
  );
}
