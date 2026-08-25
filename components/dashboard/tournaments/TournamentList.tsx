"use client";

import { useEffect, useMemo, useState } from "react";

import { GameLogo } from "@/components/brand/GameLogo";
import { SourceLogo, sourceKey } from "@/components/brand/SourceLogo";
import {
  TOURNAMENT_FORMAT_LABELS,
  TOURNAMENT_STATUS_LABELS,
  type TournamentFormat,
  type TournamentStatus,
} from "@/lib/tournaments-shared";

export type TournamentListEntry = {
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
};

/** The two filters, in the order a member looks for things. "Active" is
    everything that isn't finished; "Concluded" is the archive. */
const VIEWS = [
  { key: "active", label: "Active" },
  { key: "concluded", label: "Concluded" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];
type Layout = "modern" | "compact";

const LAYOUT_KEY = "ff-tournaments-layout";

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

/**
 * The member's tournament list. **Active** (default) shows a featured hero — the
 * admin-set featured tournament, else the soonest upcoming — then tiles for
 * tournaments starting today or later (soonest first), with older still-running
 * ones tucked into a "Past tournaments" disclosure. **Concluded** is the archive,
 * most-recent first. Two layouts (modern card grid / compact table) toggle
 * top-right and persist in localStorage. All filtering is client-side: the server
 * hands down every visible tournament once (the list is small and bounded).
 */
export function TournamentList({
  tournaments,
}: {
  tournaments: TournamentListEntry[];
}) {
  const [view, setView] = useState<ViewKey>("active");
  const [layout, setLayout] = useState<Layout>("modern");
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(LAYOUT_KEY);
    if (saved === "modern" || saved === "compact") setLayout(saved);
  }, []);

  function chooseLayout(next: Layout) {
    setLayout(next);
    window.localStorage.setItem(LAYOUT_KEY, next);
  }

  const { featured, upcoming, past, concluded } = useMemo(() => {
    const today = startOfTodayMs();
    const active = tournaments.filter((t) => !isConcluded(t.status));
    const done = tournaments.filter((t) => isConcluded(t.status)).sort(byStartDesc);

    // The hero: the admin-featured one, else the soonest upcoming, else the most
    // recent active tournament (so the slot is never empty when anything active
    // exists).
    const flagged = active.find((t) => t.featured);
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
    };
  }, [tournaments]);

  const activeEmpty = !featured && upcoming.length === 0 && past.length === 0;

  return (
    <>
      <div className="ff-list-head">
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

      {view === "concluded" ? (
        concluded.length === 0 ? (
          <p className="ff-ticket-empty">No concluded tournaments yet.</p>
        ) : layout === "modern" ? (
          <div className="ff-tcard-grid">
            {concluded.map((t) => (
              <TournamentCard key={t.id} tournament={t} />
            ))}
          </div>
        ) : (
          <CompactTable tournaments={concluded} />
        )
      ) : activeEmpty ? (
        <p className="ff-ticket-empty">Nothing here right now.</p>
      ) : layout === "modern" ? (
        <>
          {featured ? <FeaturedHero tournament={featured} /> : null}
          {upcoming.length > 0 ? (
            <div className="ff-tcard-grid">
              {upcoming.map((t) => (
                <TournamentCard key={t.id} tournament={t} />
              ))}
            </div>
          ) : null}
          {past.length > 0 ? (
            <div className="ff-tpast">
              <button
                className="ff-tpast__toggle"
                type="button"
                aria-expanded={showPast}
                onClick={() => setShowPast((v) => !v)}
              >
                <Chevron open={showPast} />
                Past tournaments ({past.length})
              </button>
              {showPast ? (
                <div className="ff-tcard-grid">
                  {past.map((t) => (
                    <TournamentCard key={t.id} tournament={t} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <>
          {featured ? <FeaturedHero tournament={featured} /> : null}
          <CompactTable tournaments={[...upcoming, ...past]} />
        </>
      )}
    </>
  );
}

/** Where a card/hero links: internal → branded Commons view; external → out. */
function hrefFor(t: TournamentListEntry): string {
  return t.source ? (t.externalUrl ?? "#") : `/tournaments/${t.id}/`;
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

function formatDate(ms: number | null): string {
  return ms
    ? new Date(ms).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Date TBD";
}

/** The banner overlay shared by the hero and the regular card: source mark
    top-left, status pill top-right, game mark bottom-right. */
function BannerChrome({ t }: { t: TournamentListEntry }) {
  const live = t.status === "registration" || t.status === "active";
  return (
    <>
      <SourceLogo source={sourceKey(t.source)} />
      <span
        className={`ff-tcard__status${live ? " ff-tcard__status--live" : ""}`}
      >
        {TOURNAMENT_STATUS_LABELS[t.status as TournamentStatus] ?? t.status}
      </span>
      <GameLogo name={t.game} logoUrl={t.gameLogoUrl} />
    </>
  );
}

function FeaturedHero({ tournament: t }: { tournament: TournamentListEntry }) {
  const external = Boolean(t.source);
  return (
    <a
      className="ff-tcard ff-tcard--hero"
      href={hrefFor(t)}
      data-status={t.status}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
    >
      <div
        className="ff-tcard__banner"
        style={t.bannerUrl ? { backgroundImage: `url(${t.bannerUrl})` } : undefined}
      >
        <span className="ff-tcard__ribbon">Featured</span>
        <BannerChrome t={t} />
      </div>
      <div className="ff-tcard__body">
        <span className="ff-tcard__date">{formatDate(t.startsAt)}</span>
        <h2 className="ff-tcard__title">{t.name}</h2>
        <span className="ff-tcard__meta">{metaFor(t) || "—"}</span>
      </div>
    </a>
  );
}

function TournamentCard({ tournament: t }: { tournament: TournamentListEntry }) {
  const external = Boolean(t.source);
  return (
    <a
      className="ff-tcard"
      href={hrefFor(t)}
      data-status={t.status}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
    >
      <div
        className="ff-tcard__banner"
        style={t.bannerUrl ? { backgroundImage: `url(${t.bannerUrl})` } : undefined}
      >
        <BannerChrome t={t} />
      </div>
      <div className="ff-tcard__body">
        <span className="ff-tcard__date">{formatDate(t.startsAt)}</span>
        <h3 className="ff-tcard__title">{t.name}</h3>
        <span className="ff-tcard__meta">{metaFor(t) || "—"}</span>
      </div>
    </a>
  );
}

function CompactTable({
  tournaments,
}: {
  tournaments: TournamentListEntry[];
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
                  <a
                    className="ff-ticket-subject"
                    href={hrefFor(t)}
                    {...(external
                      ? { target: "_blank", rel: "noreferrer noopener" }
                      : {})}
                  >
                    {t.name}
                  </a>
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
                <td>
                  {t.startsAt
                    ? new Date(t.startsAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                    : "—"}
                </td>
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
