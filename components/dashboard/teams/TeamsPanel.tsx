import Link from "next/link";

import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import {
  mergeChrome,
  type PanelChrome,
} from "@/components/dashboard/bubbles/PanelChrome";
import {
  ExternalTeamCard,
  TeamCard,
} from "@/components/dashboard/teams/TeamCardGrid";
import type { ExternalTeamSummary } from "@/lib/player-data-shared";
import type { MyTeam } from "@/lib/teams";

/**
 * The member's teams as a single pinnable bubble, for the Home board.
 *
 * The Teams TAB is a bare grid of draggable cards (they're reorderable, and the
 * order is the member's), so it has no bubble to lift. Home wraps the same
 * `TeamCard` / `ExternalTeamCard` components in one bubble instead — read-only,
 * because a reorderable grid nested inside the reorderable BOARD would leave
 * two drag surfaces fighting over the same pointer. Reordering stays on the
 * tab; Home shows the result of it.
 */
export function TeamsPanel({
  teams,
  external = [],
  chrome,
}: {
  teams: MyTeam[];
  external?: ExternalTeamSummary[];
  chrome?: PanelChrome;
}) {
  const empty = teams.length === 0 && external.length === 0;

  return (
    <Bubble
      title="My Teams"
      {...mergeChrome(chrome, {
        span: "full",
        actions: (
          <Link className="ff-btn ff-btn--outline ff-btn--sm" href="/teams/">
            All Teams
          </Link>
        ),
      })}
    >
      {empty ? (
        <p className="ff-bubble__lede">
          You&rsquo;re not on a team yet.{" "}
          <Link href="/teams/" prefetch={false}>
            Start one or join with an invite link
          </Link>
          .
        </p>
      ) : (
        <div className="ff-team-cards">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} />
          ))}
          {external.map((team) => (
            <ExternalTeamCard key={team.id} team={team} />
          ))}
        </div>
      )}
    </Bubble>
  );
}
