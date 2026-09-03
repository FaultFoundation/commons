"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

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
  const { order, error, reorder, bubbleProps, handleProps } =
    useReorderableGrid({
      items: initial,
      getId: (team) => team.id,
      onReorder: (ids) => reorderMyTeams(ids),
    });

  return (
    <>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <div className="ff-bubble-grid">
        {order.map((team, index) => {
          const bp = bubbleProps(index);
          const feature = index === 0;
          return (
            <article
              key={team.id}
              {...bp}
              className={`ff-team-card ${bp.className}${feature ? " ff-team-card--feature" : ""}`}
              style={{ "--team-accent": teamColor(team.color) } as CSSProperties}
            >
              <span className="ff-team-card__gamechip">
                <GameLogo name={team.gameName} logoUrl={team.gameLogoUrl} />
              </span>
              <div className="ff-team-card__head">
                <span className="ff-team-card__logo">
                  <Avatar
                    src={team.logoUrl}
                    name={team.name}
                    shape="team"
                    size="md"
                  />
                </span>
                <div className="ff-team-card__identity">
                  <h3 className="ff-team-card__name">
                    {team.tag ? `${team.name} [${team.tag}]` : team.name}
                  </h3>
                  <div className="ff-team-card__badges">
                    <span className={`ff-badge ff-badge--${team.role}`}>
                      {TEAM_ROLE_LABELS[team.role]}
                    </span>
                    {team.collegeName || team.schools.length ? (
                      <span className="ff-team-card__sub">
                        {team.collegeName ?? team.schools.join(", ")}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="ff-team-card__stats">
                <div className="ff-stat">
                  <span className="ff-stat__label">Roster</span>
                  <span className="ff-stat__value">{team.memberCount}</span>
                </div>
                <div className="ff-stat">
                  <span className="ff-stat__label">Avg SR</span>
                  <span className="ff-stat__value ff-stat__value--hi">
                    {team.avgSr ?? "—"}
                  </span>
                </div>
                <div className="ff-stat">
                  <span className="ff-stat__label">Tournaments</span>
                  <span className="ff-stat__value">
                    {team.tournaments.length}
                  </span>
                </div>
              </div>

              {team.tournaments.length ? (
                <p className="ff-team-card__events">
                  {team.tournaments.join(" · ")}
                </p>
              ) : null}

              <div className="ff-team-card__foot">
                  <span className="ff-team-card__actions">
                    {team.inviteToken ? (
                      <CopyInviteButton token={team.inviteToken} small />
                    ) : null}
                    <Link
                      className="ff-btn ff-btn--outline ff-btn--sm"
                      href={`/teams/${team.id}/`}
                      prefetch={false}
                    >
                      {team.inviteToken ? "Manage" : "Open"}
                    </Link>
                  </span>
                  <span className="ff-team-card__handle">
                    <span
                      className="ff-reorder"
                      role="group"
                      aria-label="Reorder"
                    >
                      <button
                        className="ff-reorder__btn"
                        type="button"
                        disabled={index === 0}
                        title="Move up"
                        onClick={() => reorder(index, index - 1)}
                      >
                        <span className="screen-reader-text">
                          Move {team.name} up
                        </span>
                        <Chevron up />
                      </button>
                      <button
                        className="ff-reorder__btn"
                        type="button"
                        disabled={index === order.length - 1}
                        title="Move down"
                        onClick={() => reorder(index, index + 1)}
                      >
                        <span className="screen-reader-text">
                          Move {team.name} down
                        </span>
                        <Chevron />
                      </button>
                    </span>
                    <DragGrip {...handleProps(index)} label={`Move ${team.name}`} />
                  </span>
                </div>
            </article>
          );
        })}
        {external.map((team) => (
          <ExternalTeamCard key={team.id} team={team} />
        ))}
      </div>
    </>
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

function ExternalTeamCard({ team }: { team: ExternalTeamSummary }) {
  return (
    <article className="ff-team-card ff-team-card--external">
      <ProviderChip provider={team.provider} />
      <div className="ff-team-card__head">
        <span className="ff-team-card__logo">
          <Avatar src={team.logoUrl} name={team.name} shape="team" size="md" />
        </span>
        <div className="ff-team-card__identity">
          <h3 className="ff-team-card__name">{team.name}</h3>
          <div className="ff-team-card__badges">
            <span className="ff-badge ff-badge--player">
              {PD_PROVIDER_LABELS[team.provider]}
            </span>
            {team.game ? (
              <span className="ff-team-card__sub">{team.game}</span>
            ) : null}
          </div>
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

      <div className="ff-team-card__foot">
        <span className="ff-team-card__actions">
          <Link
            className="ff-btn ff-btn--outline ff-btn--sm"
            href={`/teams/${encodeURIComponent(team.id)}/`}
            prefetch={false}
          >
            Open
          </Link>
        </span>
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
