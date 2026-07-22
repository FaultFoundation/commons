"use client";

import { useState } from "react";

import { CreateTeamForm } from "@/components/dashboard/teams/CreateTeamForm";

type Panel = "create" | "lft" | "lfm";

/**
 * The Teams tab's action row. One panel expands at a time beneath the
 * buttons, so the tab opens on the member's teams rather than on three cards
 * of things they might do.
 *
 * Find a Team / Looking for Players are the LFG surfaces: the tables
 * (lfg_profiles, team_listings, lfg_connections) shipped, the screens haven't,
 * so for now they say so instead of pretending to be missing.
 */
export function TeamsActions({ verified }: { verified: boolean }) {
  const [open, setOpen] = useState<Panel | null>(null);

  function toggle(panel: Panel) {
    setOpen((current) => (current === panel ? null : panel));
  }

  const button = (panel: Panel, label: string) => (
    <button
      className={open === panel ? "ff-btn" : "ff-btn ff-btn--outline"}
      type="button"
      aria-expanded={open === panel}
      onClick={() => toggle(panel)}
    >
      {label}
    </button>
  );

  return (
    <div className="ff-actions">
      <div className="ff-actions__row">
        {button("create", "Start a Team")}
        {button("lft", "Find a Team")}
        {button("lfm", "Looking for Players")}
      </div>

      {open === "create" ? (
        <div className="ff-card ff-actions__panel">
          {verified ? (
            <CreateTeamForm compact />
          ) : (
            <>
              <p className="ff-auth__hint">
                Teams are for verified members — verify your academic email and
                this takes about a minute.
              </p>
              <div className="ff-row__buttons">
                <a className="ff-btn ff-btn--sm" href="/account/setup/">
                  Verify My Email
                </a>
              </div>
            </>
          )}
        </div>
      ) : null}

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
