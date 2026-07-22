"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type DragEvent } from "react";

import { reorderMyTeams } from "@/app/teams/actions";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { CopyInviteButton } from "@/components/dashboard/teams/CopyInviteButton";
import type { MyTeam } from "@/lib/teams";
import { TEAM_ROLE_LABELS } from "@/lib/teams-shared";

/** Pure move-one-item helper, so drag and the arrow buttons share the logic. */
function move(teams: MyTeam[], from: number, to: number): MyTeam[] {
  if (from === to || to < 0 || to >= teams.length) return teams;
  const next = [...teams];
  const [card] = next.splice(from, 1);
  next.splice(to, 0, card);
  return next;
}

/**
 * The member's teams, in their own order, rearrangeable.
 *
 * The server page still does every read and hands down plain `MyTeam[]`; this
 * component owns nothing but the order. The first card always spans the grid
 * (the universal top-bubble rule), which makes "drag a team to the front"
 * double as "feature this team".
 *
 * Pointer drag is the fast path, but drag events are pointer-only — the Move
 * up / Move down buttons in each header are the keyboard and screen-reader
 * path, and both drive the same reorder.
 */
export function TeamCardGrid({ teams: initial }: { teams: MyTeam[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [teams, setTeams] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Optimistic: the grid rearranges now, and rolls back only if D1 refuses. */
  function commit(next: MyTeam[]) {
    if (next === teams) return;
    const previous = teams;
    setTeams(next);
    setError(null);

    startTransition(async () => {
      const result = await reorderMyTeams(next.map((team) => team.id));
      if (!result.ok) {
        setTeams(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function reorder(from: number, to: number) {
    commit(move(teams, from, to));
  }

  function onDrop(event: DragEvent, index: number) {
    event.preventDefault();
    const from = teams.findIndex((team) => team.id === dragging);
    setDragging(null);
    setOver(null);
    if (from !== -1) reorder(from, index);
  }

  return (
    <>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <div className="ff-bubble-grid">
        {teams.map((team, index) => {
          const classes = ["ff-bubble--draggable"];
          if (team.id === dragging) classes.push("ff-bubble--dragging");
          if (team.id === over && team.id !== dragging) {
            classes.push("ff-bubble--dropzone");
          }

          return (
            <Bubble
              key={team.id}
              // The universal top-bubble rule, applied to whatever the member
              // dragged into first place.
              span={index === 0 ? "full" : undefined}
              className={classes.join(" ")}
              title={team.tag ? `${team.name} [${team.tag}]` : team.name}
              draggable
              onDragStart={() => setDragging(team.id)}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDragOver={(event: DragEvent) => {
                // Without preventDefault the browser refuses the drop.
                event.preventDefault();
                setOver(team.id);
              }}
              onDragLeave={() => setOver((id) => (id === team.id ? null : id))}
              onDrop={(event: DragEvent) => onDrop(event, index)}
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
                      <span className="screen-reader-text">
                        Move {team.name} up
                      </span>
                      <Chevron up />
                    </button>
                    <button
                      className="ff-reorder__btn"
                      type="button"
                      disabled={index === teams.length - 1}
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
                  // A card-wide drag would otherwise start from the link.
                  draggable={false}
                >
                  {team.inviteToken ? "Manage" : "Open"}
                </a>
              </div>
            </Bubble>
          );
        })}
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
