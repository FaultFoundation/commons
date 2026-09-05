import type { CSSProperties } from "react";

import { GameLogo } from "@/components/brand/GameLogo";
import { Avatar } from "@/components/dashboard/Avatar";
import { TEAM_ROLE_LABELS, teamColor, type TeamRole } from "@/lib/teams-shared";

/**
 * The team page's hero — a normal dark bubble with the team's chosen colour as
 * the accent (a top stripe + a ring on the logo), the game's mark in the corner,
 * and a stat strip. No full-bleed banner: the colour reads as an accent, not a
 * background. Server component (static): the page does the reads.
 */
export function TeamHero({
  teamId,
  name,
  tag,
  role,
  logoUrl,
  color,
  gameName,
  gameLogoUrl,
  collegeName,
  memberCount,
  discordInviteUrl,
}: {
  teamId?: string;
  name: string;
  tag: string | null;
  role: TeamRole;
  logoUrl: string | null;
  color: string | null;
  gameName: string | null;
  gameLogoUrl: string | null;
  collegeName: string | null;
  memberCount: number;
  discordInviteUrl: string | null;
}) {
  const accent = teamColor(color);
  return (
    <section
      className="ff-team-card ff-team-hero ff-bubble--full"
      style={{ "--team-accent": accent } as CSSProperties}
    >
      <span className="ff-team-card__gamechip">
        <GameLogo name={gameName} logoUrl={gameLogoUrl} />
      </span>
      <div className="ff-team-card__head">
        <span className="ff-team-card__logo">
          <Avatar src={logoUrl} name={name} shape="team" size="lg" />
        </span>
        <div className="ff-team-card__identity">
          <h2 className="ff-team-card__name">{tag ? `${name} [${tag}]` : name}</h2>
          <div className="ff-team-card__badges">
            <span className={`ff-badge ff-badge--${role}`}>
              {TEAM_ROLE_LABELS[role]}
            </span>
            {collegeName ? (
              <span className="ff-team-card__sub">{collegeName}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="ff-team-card__stats">
        <div className="ff-stat">
          <span className="ff-stat__label">Roster</span>
          <span className="ff-stat__value">{memberCount}</span>
        </div>
        {gameName ? (
          <div className="ff-stat">
            <span className="ff-stat__label">Game</span>
            <span className="ff-stat__value">{gameName}</span>
          </div>
        ) : null}
      </div>

      <div className="ff-row__buttons">
        <a className="ff-btn ff-btn--outline ff-btn--sm" href="/teams/">
          All Teams
        </a>
        <a className="ff-btn ff-btn--outline ff-btn--sm" href={`/statistics/?tab=team${teamId ? `&team=${encodeURIComponent(teamId)}` : ""}`}>View Statistics</a>
        {discordInviteUrl ? (
          <a
            className="ff-btn ff-btn--sm"
            href={discordInviteUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            Team Discord
          </a>
        ) : null}
      </div>
    </section>
  );
}
