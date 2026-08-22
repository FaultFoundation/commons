"use client";

import { reorderMyTeams } from "@/app/teams/actions";
import { Avatar } from "@/components/dashboard/Avatar";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { DragGrip } from "@/components/dashboard/bubbles/DragGrip";
import { useReorderableGrid } from "@/components/dashboard/bubbles/useReorderableGrid";
import { CopyInviteButton } from "@/components/dashboard/teams/CopyInviteButton";
import type { MyTeam } from "@/lib/teams";
import { TEAM_ROLE_LABELS } from "@/lib/teams-shared";

/**
 * The member's teams, in their own order, rearrangeable.
 *
 * The server page still does every read and hands down plain `MyTeam[]`; this
 * component owns nothing but the order (via the shared useReorderableGrid
 * template). The first card always spans the grid (the universal top-bubble
 * rule), which makes "drag a team to the front" double as "feature this team".
 *
 * A drag starts only from the grip in each card's bottom-right; the Move up /
 * Move down buttons in the header are the keyboard and screen-reader path, and
 * both drive the same reorder.
 */
export function TeamCardGrid({ teams: initial }: { teams: MyTeam[] }) {
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
        {order.map((team, index) => (
          <Bubble
            key={team.id}
            // The universal top-bubble rule, applied to whatever the member
            // dragged into first place.
            span={index === 0 ? "full" : undefined}
            title={team.tag ? `${team.name} [${team.tag}]` : team.name}
            media={
              <Avatar src={team.logoUrl} name={team.name} shape="team" size="md" />
            }
            dragHandle={
              <DragGrip {...handleProps(index)} label={`Move ${team.name}`} />
            }
            {...bubbleProps(index)}
            actions={
              <>
                <span className="ff-reorder" role="group" aria-label="Reorder">
                  <button
                    className="ff-reorder__btn"
                    type="button"
                    disabled={index === 0}
                    title="Move up"
                    onClick={() => reorder(index, index - 1)}
                  >
                    <span className="screen-reader-text">Move {team.name} up</span>
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
                <span className={`ff-badge ff-badge--${team.role}`}>
                  {TEAM_ROLE_LABELS[team.role]}
                </span>
              </>
            }
          >
            <BubbleRow
              label="Roster"
              value={`${team.memberCount} ${team.memberCount === 1 ? "member" : "members"}`}
              note={team.collegeName ?? undefined}
            />
            <BubbleRow
              label="Tournaments"
              value={
                team.tournaments.length
                  ? team.tournaments.join(", ")
                  : "Not entered"
              }
            />
            <div className="ff-row__buttons">
              {team.inviteToken ? (
                <CopyInviteButton token={team.inviteToken} small />
              ) : null}
              <a
                className="ff-btn ff-btn--outline ff-btn--sm"
                href={`/teams/${team.id}/`}
              >
                {team.inviteToken ? "Manage" : "Open"}
              </a>
            </div>
          </Bubble>
        ))}
      </div>
    </>
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
