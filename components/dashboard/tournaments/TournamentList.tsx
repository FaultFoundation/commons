"use client";

import { useMemo, useState } from "react";

import {
  TOURNAMENT_FORMAT_LABELS,
  TOURNAMENT_STATUS_LABELS,
  tournamentPath,
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
};

/** The filter chips, in the order a member actually looks for things. */
const VIEWS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "live", label: "Live" },
  { key: "done", label: "Finished" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

/**
 * The member's tournament list. Filtering is entirely client-side — the server
 * hands down every visible tournament once and the chips just narrow what's
 * rendered. The list is small and bounded, and a round trip per chip would be a
 * billed request for work a `filter()` already does.
 */
export function TournamentList({
  tournaments,
}: {
  tournaments: TournamentListEntry[];
}) {
  const [view, setView] = useState<ViewKey>("all");

  const visible = useMemo(() => {
    switch (view) {
      case "open":
        return tournaments.filter((t) => t.status === "registration");
      case "live":
        return tournaments.filter(
          (t) => t.status === "active" || t.status === "seeding",
        );
      case "done":
        return tournaments.filter(
          (t) => t.status === "completed" || t.status === "cancelled",
        );
      default:
        return tournaments;
    }
  }, [tournaments, view]);

  return (
    <>
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

      {visible.length === 0 ? (
        <p className="ff-ticket-empty">Nothing here right now.</p>
      ) : (
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
              {visible.map((t) => (
                <tr key={t.id}>
                  <td>
                    <a
                      className="ff-ticket-subject"
                      href={tournamentPath(t.id, t.name)}
                    >
                      {t.name}
                    </a>
                  </td>
                  <td>
                    {TOURNAMENT_FORMAT_LABELS[t.format as TournamentFormat] ??
                      t.format}
                  </td>
                  <td>
                    {t.entrantCount}
                    {t.maxParticipants ? ` / ${t.maxParticipants}` : ""}
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
