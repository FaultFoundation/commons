import { GameLogo } from "@/components/brand/GameLogo";
import { Avatar } from "@/components/dashboard/Avatar";
import { gameGradient } from "@/lib/games-shared";
import { TEAM_ROLE_LABELS, type TeamRole } from "@/lib/teams-shared";

/**
 * The team page's hero — the same game-tinted banner + stat strip the Teams tab
 * cards use, blown up to a full-width header so a team reads with the colour and
 * graphics of the tournament menu instead of a plain settings list. Server
 * component (static): the page does the reads and hands down plain data.
 */
export function TeamHero({
  name,
  tag,
  role,
  logoUrl,
  gameId,
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
  gameId: string | null;
  gameName: string | null;
  gameLogoUrl: string | null;
  collegeName: string | null;
  memberCount: number;
  avgSr: number | null;
  tournamentCount: number;
  discordInviteUrl: string | null;
}) {
  return (
    <section className="ff-team-card ff-team-hero ff-bubble--full">
      <div
        className="ff-team-card__banner ff-team-hero__banner"
        style={{ background: gameGradient(gameId) }}
      >
        <div className="ff-team-card__top">
          <Avatar src={logoUrl} name={name} shape="team" size="lg" />
          <span className={`ff-badge ff-badge--${role}`}>
            {TEAM_ROLE_LABELS[role]}
          </span>
        </div>
        <div className="ff-team-card__identity">
          <h2 className="ff-team-card__name">
            {tag ? `${name} [${tag}]` : name}
          </h2>
          {collegeName ? (
            <span className="ff-team-card__sub">{collegeName}</span>
          ) : null}
        </div>
        <span className="ff-team-card__game">
          <GameLogo name={gameName} logoUrl={gameLogoUrl} />
        </span>
      </div>

      <div className="ff-team-card__body">
        <div className="ff-thero__stats">
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
      </div>
    </section>
  );
}
