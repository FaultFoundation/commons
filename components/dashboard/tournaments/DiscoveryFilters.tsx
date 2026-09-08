"use client";
import { useEffect, useRef, useState } from "react";
import {
  DISCOVERY_SOURCE_FILTERS,
  EMPTY_FILTERS,
  type DiscoveryFilters as Filters,
} from "@/lib/discovery-shared";
import { Segmented } from "./DiscoveryActions";

/**
 * The Filter button + its dropdown. It sits after a divider to the right of the
 * view pills (see `.ff-list-head`) and opens a popover of pill switches — the
 * same `.ff-segment` control as the density row — instead of the old stack of
 * `<select>` dropdowns. Search moved out to the head bar; games, which used to be
 * a separate popover, are folded in here so the head carries one filter surface.
 */
export function DiscoveryFilters({
  value,
  onChange,
  countries,
  games,
  selectedGames,
  onToggleGame,
  onClearGames,
}: {
  value: Filters;
  onChange: (v: Filters) => void;
  countries: string[];
  games: string[];
  selectedGames: Set<string>;
  onToggleGame: (game: string) => void;
  onClearGames: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const facetCount =
    [
      value.audience,
      value.venue,
      value.competition,
      value.source,
      value.country,
      value.days,
      value.registration,
    ].filter(Boolean).length +
    (value.following ? 1 : 0) +
    selectedGames.size;

  function clearAll() {
    onChange({ ...EMPTY_FILTERS, query: value.query });
    onClearGames();
  }

  return (
    <div className="ff-filter" ref={rootRef}>
      <button
        className="ff-ticket-view ff-filter__toggle"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Filter
        {facetCount > 0 ? (
          <span className="ff-filter__count">{facetCount}</span>
        ) : null}
        <Chevron open={open} />
      </button>
      {open ? (
        <div className="ff-filter__panel ff-filtermenu" role="dialog" aria-label="Filters">
          {games.length > 0 ? (
            <div className="ff-discovery-field">
              <span className="ff-discovery-field__label">Games</span>
              <div className="ff-segment ff-segment--wrap">
                {games.map((game) => (
                  <button
                    key={game}
                    type="button"
                    className="ff-segment__btn"
                    aria-pressed={selectedGames.has(game)}
                    onClick={() => onToggleGame(game)}
                  >
                    {game}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <Segmented
            label="Type"
            value={value.competition}
            options={[
              { value: "", label: "Any" },
              { value: "tournament", label: "Tournament" },
              { value: "league", label: "League" },
            ]}
            onChange={(competition) => onChange({ ...value, competition })}
          />
          <Segmented
            label="Audience"
            value={value.audience}
            options={[
              { value: "", label: "Any" },
              { value: "collegiate", label: "Collegiate" },
              { value: "open", label: "Open" },
            ]}
            onChange={(audience) => onChange({ ...value, audience })}
          />
          <Segmented
            label="Venue"
            value={value.venue}
            options={[
              { value: "", label: "Any" },
              { value: "in-person", label: "In-person" },
              { value: "online", label: "Online" },
              { value: "hybrid", label: "Hybrid" },
            ]}
            onChange={(venue) => onChange({ ...value, venue })}
          />
          <Segmented
            label="Platform"
            value={value.source}
            options={[
              { value: "", label: "Any" },
              ...DISCOVERY_SOURCE_FILTERS,
            ]}
            onChange={(source) => onChange({ ...value, source })}
          />
          <Segmented
            label="Starts within"
            value={value.days}
            options={[
              { value: "", label: "Any" },
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
            ]}
            onChange={(days) => onChange({ ...value, days })}
          />
          {countries.length > 0 ? (
            <Segmented
              label="Region"
              value={value.country}
              options={[
                { value: "", label: "Any" },
                ...countries.map((c) => ({ value: c, label: c })),
              ]}
              onChange={(country) => onChange({ ...value, country })}
            />
          ) : null}

          <div className="ff-discovery-field">
            <span className="ff-discovery-field__label">More</span>
            <div className="ff-segment ff-segment--wrap">
              <button
                type="button"
                className="ff-segment__btn"
                aria-pressed={value.registration === "closing"}
                onClick={() =>
                  onChange({
                    ...value,
                    registration:
                      value.registration === "closing" ? "" : "closing",
                  })
                }
              >
                Closing soon
              </button>
              <button
                type="button"
                className="ff-segment__btn"
                aria-pressed={value.following}
                onClick={() =>
                  onChange({ ...value, following: !value.following })
                }
              >
                Only followed
              </button>
            </div>
          </div>

          <div className="ff-filtermenu__foot">
            <button
              type="button"
              className="ff-btn ff-btn--outline ff-btn--sm"
              onClick={clearAll}
              disabled={facetCount === 0}
            >
              Clear filters
            </button>
            <button
              type="button"
              className="ff-btn ff-btn--sm"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
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
