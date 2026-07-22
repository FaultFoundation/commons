"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { changeMemberRole, removeMember } from "@/app/teams/actions";
import { Avatar } from "@/components/dashboard/Avatar";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { ConfirmDialog } from "@/components/dashboard/bubbles/ConfirmDialog";
import {
  TEAM_ROLE_HINTS,
  TEAM_ROLE_LABELS,
  assignableRoles,
  can,
  outranks,
  type TeamRole,
} from "@/lib/teams-shared";

export type RosterEntry = {
  membershipId: string;
  userId: string;
  name: string;
  image: string | null;
  role: TeamRole;
  position: string | null;
  discordHandle: string | null;
};

/**
 * The roster, with in-place role changes for anyone who may manage it.
 * Everything it renders is decided by the capability map in
 * lib/teams-shared.ts — never by comparing role names here.
 */
export function RosterPanel({
  teamId,
  roster,
  viewerRole,
  viewerUserId,
}: {
  teamId: string;
  roster: RosterEntry[];
  viewerRole: TeamRole;
  viewerUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<RosterEntry | null>(null);

  const manages = can(viewerRole, "manageRoster");
  const options = assignableRoles(viewerRole);

  function onRoleChange(entry: RosterEntry, role: string) {
    setError(null);
    startTransition(async () => {
      const result = await changeMemberRole(teamId, entry.membershipId, role);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function onRemove() {
    if (!removing) return;
    setError(null);
    startTransition(async () => {
      const result = await removeMember(teamId, removing.membershipId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRemoving(null);
      router.refresh();
    });
  }

  return (
    <>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {roster.map((entry) => {
        // You can never act on someone above your own tier.
        const locked = outranks(entry.role, viewerRole);
        const editable = manages && !locked && entry.userId !== viewerUserId;
        return (
          <BubbleRow
            key={entry.membershipId}
            label={entry.name}
            media={<Avatar src={entry.image} name={entry.name} size="sm" />}
            value={
              <span className={`ff-badge ff-badge--${entry.role}`}>
                {TEAM_ROLE_LABELS[entry.role]}
              </span>
            }
            note={
              [entry.position, entry.discordHandle]
                .filter(Boolean)
                .join(" · ") || undefined
            }
            action={
              editable ? (
                <div className="ff-roster__controls">
                  <label className="screen-reader-text" htmlFor={`role-${entry.membershipId}`}>
                    Role for {entry.name}
                  </label>
                  <select
                    id={`role-${entry.membershipId}`}
                    className="ff-auth__input ff-roster__select"
                    value={entry.role}
                    disabled={pending}
                    onChange={(event) => onRoleChange(entry, event.target.value)}
                  >
                    {options.map((role) => (
                      <option key={role} value={role} title={TEAM_ROLE_HINTS[role]}>
                        {TEAM_ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                  <button
                    className="ff-btn ff-btn--outline ff-btn--sm"
                    type="button"
                    disabled={pending}
                    onClick={() => setRemoving(entry)}
                  >
                    Remove
                  </button>
                </div>
              ) : undefined
            }
          />
        );
      })}

      <ConfirmDialog
        open={removing !== null}
        title="Remove From Team"
        description={
          removing
            ? `${removing.name} loses access to this team's stats, schedule, and score reporting. They can rejoin with a new invite.`
            : undefined
        }
        confirmLabel="Remove"
        danger
        busy={pending}
        error={error}
        onConfirm={onRemove}
        onClose={() => {
          if (!pending) setRemoving(null);
        }}
      />
    </>
  );
}
