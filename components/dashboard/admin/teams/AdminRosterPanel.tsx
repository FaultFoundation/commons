"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  adminChangeMemberRole,
  adminRemoveMember,
} from "@/app/admin/teams/actions";
import { Avatar } from "@/components/dashboard/Avatar";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { ConfirmDialog } from "@/components/dashboard/bubbles/ConfirmDialog";
import {
  TEAM_ROLES,
  TEAM_ROLE_HINTS,
  TEAM_ROLE_LABELS,
  type TeamRole,
} from "@/lib/teams-shared";

type AdminRosterEntry = {
  membershipId: string;
  userId: string;
  name: string;
  image: string | null;
  role: TeamRole;
  position: string | null;
  discordHandle: string | null;
};

/**
 * The roster from the staff admin panel. Unlike the member RosterPanel, a staff
 * member with `manageTeams` may set any role and remove anyone — the actions
 * still keep the last-manager guard, so a team can't be left leaderless. Renders
 * read-only when `editable` is false (a moderator's view).
 */
export function AdminRosterPanel({
  teamId,
  roster,
  editable,
}: {
  teamId: string;
  roster: AdminRosterEntry[];
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<AdminRosterEntry | null>(null);

  function onRoleChange(entry: AdminRosterEntry, role: string) {
    setError(null);
    startTransition(async () => {
      const result = await adminChangeMemberRole(
        teamId,
        entry.membershipId,
        role,
      );
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
      const result = await adminRemoveMember(teamId, removing.membershipId);
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

      {roster.map((entry) => (
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
            [entry.position, entry.discordHandle].filter(Boolean).join(" · ") ||
            undefined
          }
          action={
            editable ? (
              <div className="ff-roster__controls">
                <label
                  className="screen-reader-text"
                  htmlFor={`role-${entry.membershipId}`}
                >
                  Role for {entry.name}
                </label>
                <select
                  id={`role-${entry.membershipId}`}
                  className="ff-auth__input ff-roster__select"
                  value={entry.role}
                  disabled={pending}
                  onChange={(event) => onRoleChange(entry, event.target.value)}
                >
                  {TEAM_ROLES.map((role) => (
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
      ))}

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
