"use client";

import { useState } from "react";

import { StartTeamDialog } from "@/components/dashboard/teams/StartTeamDialog";
import type { GameOption } from "@/lib/games-shared";

type Panel = "lft" | "lfm";

/**
 * The Teams tab's action row. "Start a Team" opens a modal (create → invite, see
 * StartTeamDialog); Find a Team / Looking for Players expand an inline panel
 * beneath the buttons, one at a time, so the tab opens on the member's teams
 * rather than on three cards of things they might do.
 *
 * Find a Team / Looking for Players are the LFG surfaces: the tables
 * (lfg_profiles, team_listings, lfg_connections) shipped, the screens haven't,
 * so for now they say so instead of pretending to be missing.
 */
export function TeamsActions({
  verified,
  games,
}: {
  verified: boolean;
  games: GameOption[];
}) {
  const [open, setOpen] = useState<Panel | null>(null);
  const [startOpen, setStartOpen] = useState(false);

  function toggle(panel: Panel) {
    setOpen((current) => (current === panel ? null : panel));
  }

  const button = (panel: Panel, label: string) => (
    <button
      className="ff-btn ff-btn--outline"
      type="button"
      aria-expanded={open === panel}
      aria-pressed={open === panel}
      onClick={() => toggle(panel)}
    >
      {label}
    </button>
  );

  return (
    <div className="ff-actions">
      <div className="ff-actions__row">
        {/* Blue = commits a change (creates a team); the other two only expand
            an inline panel, so they stay outline. */}
        <button
          className="ff-btn"
          type="button"
          onClick={() => setStartOpen(true)}
        >
          Start a Team
        </button>
        {button("lft", "Find a Team")}
        {button("lfm", "Looking for Players")}
      </div>

      <StartTeamDialog
        open={startOpen}
        verified={verified}
        games={games}
        onClose={() => setStartOpen(false)}
      />

      {open === "lft" ? (
        <div className="ff-card ff-actions__panel">
          <p className="ff-auth__hint">
            The free-agent pool is coming soon: set your rank, roles, and
            availability, and see every team recruiting someone like you. For
            now, ask around on Discord — or paste an invite link from a captain.
          </p>
        </div>
      ) : null}

      {open === "lfm" ? (
        <div className="ff-card ff-actions__panel">
          <p className="ff-auth__hint">
            Recruiting is coming soon: post the roles and skill range your team
            needs and free agents will find you. Until then, share your team&rsquo;s
            invite link.
          </p>
        </div>
      ) : null}
    </div>
  );
}
