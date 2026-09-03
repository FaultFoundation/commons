import {
  ChallongeMark,
  FaceitMark,
  StartggMark,
} from "@/components/brand/ProviderMark";
import { Avatar } from "@/components/dashboard/Avatar";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { MatchList } from "@/components/dashboard/statistics/MatchList";
import {
  PlayerDataAutoRefresh,
  PlayerDataRefreshButton,
} from "@/components/dashboard/teams/PlayerDataRefresh";
import type { ExternalTeamDetail } from "@/lib/player-data";
import { PD_PROVIDER_LABELS } from "@/lib/player-data-shared";

// The branded view of an EXTERNAL team (FACEIT / start.gg), reached from the
// Teams tab exactly like an internal team — /teams/<source:id>/ — but rendering
// the provider's data: identity, the provider's roster (provider handles, not
// Commons members), and the team's synced match history, with an out-link to
// the native page. Deliberately simple for now (a design pass comes later);
// the shape mirrors ExternalTournamentView's "reuse the internal template,
// link out for the native experience" rule.

const ROLE_LABELS: Record<string, string> = {
  leader: "Leader",
  captain: "Captain",
  member: "Member",
};

export function ExternalTeamView({ detail }: { detail: ExternalTeamDetail }) {
  const { team, roster, matches } = detail;
  const providerLabel = PD_PROVIDER_LABELS[team.provider];

  return (
    <div className="ff-bubble-grid ff-bubble-grid--single">
      <Bubble
        title={team.name}
        span="full"
        media={
          <Avatar src={team.logoUrl} name={team.name} shape="team" size="md" />
        }
        actions={
          <span className="ff-pd-toolbar">
            <PlayerDataAutoRefresh />
            <PlayerDataRefreshButton />
            {team.url ? (
              <a
                className="ff-btn ff-btn--outline ff-btn--sm"
                href={team.url}
                target="_blank"
                rel="noreferrer"
              >
                View on {providerLabel}
              </a>
            ) : null}
          </span>
        }
      >
        <p className="ff-bubble__lede">
          <span className="ff-pdmatch__mark" title={providerLabel}>
            {team.provider === "faceit" ? (
              <FaceitMark />
            ) : team.provider === "startgg" ? (
              <StartggMark />
            ) : (
              <ChallongeMark />
            )}
          </span>{" "}
          {providerLabel} team{team.game ? ` · ${team.game}` : ""}
        </p>
        <p className="ff-bubble__note">
          Synced from {providerLabel} — roster and results update automatically,
          or use the refresh control above.
        </p>
      </Bubble>

      <Bubble
        title="Roster"
        actions={<span className="ff-row__note">{roster.length}</span>}
      >
        {roster.length ? (
          roster.map((m, i) => (
            <BubbleRow
              key={`${m.handle ?? "member"}-${i}`}
              label={m.handle ?? "Unknown player"}
              media={
                <Avatar src={m.avatarUrl} name={m.handle ?? "?"} size="sm" />
              }
              value={
                m.role ? (
                  <span className="ff-badge ff-badge--player">
                    {ROLE_LABELS[m.role] ?? m.role}
                  </span>
                ) : undefined
              }
            />
          ))
        ) : (
          <p className="ff-bubble__note">
            No roster synced yet — it fills in on the next refresh.
          </p>
        )}
      </Bubble>

      <Bubble
        title="Matches"
        actions={<span className="ff-row__note">{matches.length}</span>}
      >
        <MatchList matches={matches} />
      </Bubble>
    </div>
  );
}
