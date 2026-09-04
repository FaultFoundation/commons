"use client";

import Link from "next/link";
import { useState } from "react";
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";

import { reorderMyTeams } from "@/app/teams/actions";
import { GameLogo } from "@/components/brand/GameLogo";
import {
  ChallongeMark,
  FaceitMark,
  StartggMark,
} from "@/components/brand/ProviderMark";
import { Avatar } from "@/components/dashboard/Avatar";
import { DragGrip } from "@/components/dashboard/bubbles/DragGrip";
import { useReorderableGrid } from "@/components/dashboard/bubbles/useReorderableGrid";
import { CopyInviteButton } from "@/components/dashboard/teams/CopyInviteButton";
import {
  PD_PROVIDER_LABELS,
  type ExternalTeamSummary,
  type PdProvider,
} from "@/lib/player-data-shared";
import type { MyTeam } from "@/lib/teams";
import { TEAM_ROLE_LABELS, teamColor } from "@/lib/teams-shared";

/**
 * The member's teams, in their own order, rearrangeable. Each card is a dark
 * bubble accented with the team's chosen colour (a top stripe + a ring on the
 * logo), the game's mark in the corner, and a tight stat row (roster · avg SR ·
 * tournaments) — colour without a full banner.
 *
 * The server page still does every read and hands down plain `MyTeam[]`; this
 * owns only the order (via the shared useReorderableGrid template). The first
 * card spans the grid (the universal top-bubble rule), which makes "drag a team
 * to the front" double as "feature this team". A drag starts only from the grip
 * in each card's bottom-right; the Move up / Move down buttons are the keyboard
 * and screen-reader path, and both drive the same reorder.
 *
 * External teams (synced from FACEIT / start.gg via lib/player-data.ts) render
 * inline after the internal cards, marked with the provider's glyph where an
 * internal card carries the game mark. They aren't reorderable — their order is
 * the provider's — and they open the branded /teams/<source:id>/ detail view.
 */
export function TeamCardGrid({
  teams: initial,
  external = [],
}: {
  teams: MyTeam[];
  external?: ExternalTeamSummary[];
}) {
  const { order, error, bubbleProps, handleProps } =
    useReorderableGrid({
      items: initial,
      getId: (team) => team.id,
      onReorder: (ids) => reorderMyTeams(ids),
    });
  const [collapsed, setCollapsed] = useState(false);
  const total = order.length + external.length;

  return (
    <>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {/* A collapsible group header sits over the card grid — the tab has no
          page title, so this labels and counts the member's teams and lets them
          fold the grid away. One group today (every active team); the header is
          the seam a future "Archived" group would hang off. */}
      <section className="ff-teams-section">
        <button
          type="button"
          className="ff-teams-section__head"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
        >
          <Chevron up={!collapsed} />
          <span className="ff-teams-section__title">Active Teams</span>
          <span className="ff-teams-section__count">{total}</span>
        </button>

        <div className="ff-bubble-grid" hidden={collapsed}>
          {order.map((team, index) => {
            const bp = bubbleProps(index);
            return (
              <TeamCard
                key={team.id}
                team={team}
                {...bp}
                controls={
                  <DragGrip {...handleProps(index)} label={`Move ${team.name}`} />
                }
              />
          );
        })}
          {external.map((team) => (
            <ExternalTeamCard key={team.id} team={team} />
          ))}
        </div>
      </section>
    </>
  );
}

/**
 * One member team card. Extracted from the grid so the Teams tab (reorderable,
 * `controls` supplied) and the Home board's My Teams panel (read-only, no
 * `controls`) render the SAME markup — the card is the unit that gets reused,
 * not a condensed copy of it.
 */
export function TeamCard({
  team,
  feature = false,
  controls,
  className,
  ...rest
}: {
  team: MyTeam;
  /** The universal top-bubble rule: the first card spans the grid. */
  feature?: boolean;
  /** Drag grip, when the host is a reorderable grid. */
  controls?: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<"article">, "className">) {
  return (
    <article
      {...rest}
      className={`ff-team-card${feature ? " ff-team-card--feature" : ""}${
        className ? ` ${className}` : ""
      }`}
      style={{ "--team-accent": teamColor(team.color) } as CSSProperties}
    >
      <span className="ff-team-card__gamechip">
        <GameLogo name={team.gameName} logoUrl={team.gameLogoUrl} />
      </span>
      <div className="ff-team-card__head">
        <span className="ff-team-card__logo">
          <Avatar src={team.logoUrl} name={team.name} shape="team" size="lg" />
        </span>
        <div className="ff-team-card__identity">
          {/* Name + role on one line; the name is the link that opens the team
              (the explicit Manage button was dropped). */}
          <div className="ff-team-card__nameline">
            <h3 className="ff-team-card__name">
              <Link
                className="ff-team-card__namelink"
                href={`/teams/${team.id}/`}
                prefetch={false}
              >
                {team.tag ? `${team.name} [${team.tag}]` : team.name}
              </Link>
            </h3>
            <span className={`ff-badge ff-badge--${team.role}`}>
              {TEAM_ROLE_LABELS[team.role]}
            </span>
          </div>
          {team.collegeName || team.schools.length ? (
            <span className="ff-team-card__sub">
              {team.collegeName ?? team.schools.join(", ")}
            </span>
          ) : null}
        </div>
      </div>

      <div className="ff-team-card__stats">
        <div className="ff-stat">
          <span className="ff-stat__label">Avg SR</span>
          <span className="ff-stat__value ff-stat__value--hi">
            {team.avgSr ?? "\u2014"}
          </span>
        </div>
        <div className="ff-stat">
          <span className="ff-stat__label">Roster</span>
          <span className="ff-stat__value">{team.memberCount}</span>
        </div>
      </div>

      {team.tournaments.length ? (
        <p className="ff-team-card__events">{team.tournaments.join(" \u00b7 ")}</p>
      ) : null}

      <div className="ff-team-card__foot">
        <span className="ff-team-card__actions">
          {/* The team colour as a small swatch beside the invite control —
              echoing the logo ring, so the accent reads even at a glance. */}
          <span className="ff-team-card__swatch" aria-hidden="true" />
          {team.inviteToken ? (
            <CopyInviteButton token={team.inviteToken} small />
          ) : null}
        </span>
        {controls ? (
          <span className="ff-team-card__handle">{controls}</span>
        ) : null}
      </div>
    </article>
  );
}

/** The provider's square glyph, sitting where internal cards show the game. */
function ProviderChip({ provider }: { provider: PdProvider }) {
  return (
    <span
      className="ff-team-card__gamechip ff-team-card__gamechip--provider"
      title={PD_PROVIDER_LABELS[provider]}
      aria-label={PD_PROVIDER_LABELS[provider]}
    >
      {provider === "faceit" ? (
        <FaceitMark />
      ) : provider === "startgg" ? (
        <StartggMark />
      ) : (
        <ChallongeMark />
      )}
    </span>
  );
}

export function ExternalTeamCard({ team }: { team: ExternalTeamSummary }) {
  return (
    <article className="ff-team-card ff-team-card--external">
      <ProviderChip provider={team.provider} />
      <div className="ff-team-card__head">
        <span className="ff-team-card__logo">
          <Avatar src={team.logoUrl} name={team.name} shape="team" size="lg" />
        </span>
        <div className="ff-team-card__identity">
          <div className="ff-team-card__nameline">
            <h3 className="ff-team-card__name">
              <Link
                className="ff-team-card__namelink"
                href={`/teams/${encodeURIComponent(team.id)}/`}
                prefetch={false}
              >
                {team.name}
              </Link>
            </h3>
            <span className="ff-badge ff-badge--player">
              {PD_PROVIDER_LABELS[team.provider]}
            </span>
          </div>
          {team.game ? (
            <span className="ff-team-card__sub">{team.game}</span>
          ) : null}
        </div>
      </div>

      <div className="ff-team-card__stats">
        <div className="ff-stat">
          <span className="ff-stat__label">Roster</span>
          <span className="ff-stat__value">{team.memberCount || "\u2014"}</span>
        </div>
        <div className="ff-stat">
          <span className="ff-stat__label">Source</span>
          <span className="ff-stat__value">
            {PD_PROVIDER_LABELS[team.provider]}
          </span>
        </div>
      </div>
    </article>
  );
}

function Chevron({ up }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true">
      <path
        d={up ? "M1.5 8L6 4L10.5 8" : "M1.5 4L6 8L10.5 4"}
        strokeWidth="1.5"
      />
    </svg>
  );
}
