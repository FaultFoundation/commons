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
  name,
  tag,
  role,
  logoUrl,
  color,
  gameName,
  gameLogoUrl,
  collegeName,
  memberCount,
  avgSr,
  tournamentCount,
  discordInviteUrl,
}: {
  name: string;
  tag: string | null;
  role: TeamRole;
  logoUrl: string | null;
  color: string | null;
  gameName: string | null;
  gameLogoUrl: string | null;
  collegeName: string | null;
  memberCount: number;
  avgSr: number | null;
  tournamentCount: number;
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
        <div className="ff-stat">
          <span className="ff-stat__label">Avg SR</span>
          <span className="ff-stat__value ff-stat__value--hi">
            {avgSr ?? "—"}
          </span>
        </div>
        <div className="ff-stat">
          <span className="ff-stat__label">Tournaments</span>
          <span className="ff-stat__value">{tournamentCount}</span>
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
