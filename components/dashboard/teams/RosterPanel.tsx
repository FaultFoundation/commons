"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  changeMemberRole,
  removeMember,
  setMemberSkillRating,
} from "@/app/teams/actions";
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
  skillRating: number | null;
  /** Reporter's user id — compare to `userId` for self- vs manager-reported. */
  skillRatingBy: string | null;
  skillRatingAt: number | null;
};

/**
 * The roster, with in-place role changes for anyone who may manage it, and an
 * Overwatch SR per player. SR is editable by the player themselves (self-report)
 * or by anyone who may manage the roster; the info tag next to a value says which
 * — never by comparing a role name here, always by capability + reporter id.
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
  // The membership whose SR editor is open, and its draft value.
  const [srEditing, setSrEditing] = useState<string | null>(null);
  const [srDraft, setSrDraft] = useState("");

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

  function openSr(entry: RosterEntry) {
    setError(null);
    setSrEditing(entry.membershipId);
    setSrDraft(entry.skillRating != null ? String(entry.skillRating) : "");
  }

  function saveSr(entry: RosterEntry) {
    setError(null);
    startTransition(async () => {
      const result = await setMemberSkillRating(
        teamId,
        entry.membershipId,
        srDraft,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSrEditing(null);
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
        const canEditSr = manages || entry.userId === viewerUserId;
        const editingSr = srEditing === entry.membershipId;

        const meta = [entry.position, entry.discordHandle]
          .filter(Boolean)
          .join(" · ");

        return (
          <BubbleRow
            key={entry.membershipId}
            label={entry.name}
            media={<Avatar src={entry.image} name={entry.name} size="sm" />}
            value={
              <span className="ff-roster__value">
                <span className={`ff-badge ff-badge--${entry.role}`}>
                  {TEAM_ROLE_LABELS[entry.role]}
                </span>
                <SkillTag entry={entry} />
              </span>
            }
            note={meta || undefined}
            action={
              editable || canEditSr ? (
                <div className="ff-roster__controls">
                  {editable ? (
                    <>
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
                        onChange={(event) =>
                          onRoleChange(entry, event.target.value)
                        }
                      >
                        {options.map((role) => (
                          <option
                            key={role}
                            value={role}
                            title={TEAM_ROLE_HINTS[role]}
                          >
                            {TEAM_ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}
                  {canEditSr ? (
                    <button
                      className="ff-btn ff-btn--outline ff-btn--sm"
                      type="button"
                      disabled={pending}
                      aria-expanded={editingSr}
                      onClick={() =>
                        editingSr ? setSrEditing(null) : openSr(entry)
                      }
                    >
                      {entry.skillRating != null ? "Edit SR" : "Add SR"}
                    </button>
                  ) : null}
                  {editable ? (
                    <button
                      className="ff-btn ff-btn--outline ff-btn--sm"
                      type="button"
                      disabled={pending}
                      onClick={() => setRemoving(entry)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ) : undefined
            }
          >
            {editingSr ? (
              <form
                className="ff-sr-editor"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveSr(entry);
                }}
              >
                <label
                  className="screen-reader-text"
                  htmlFor={`sr-${entry.membershipId}`}
                >
                  Skill rating for {entry.name}
                </label>
                <input
                  id={`sr-${entry.membershipId}`}
                  className="ff-auth__input ff-sr-editor__input"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={5000}
                  step={1}
                  value={srDraft}
                  placeholder="e.g. 3200"
                  disabled={pending}
                  autoFocus
                  onChange={(event) => setSrDraft(event.target.value)}
                />
                <button
                  className="ff-btn ff-btn--sm"
                  type="submit"
                  disabled={pending}
                >
                  {pending ? "Saving…" : "Save"}
                </button>
                <button
                  className="ff-btn ff-btn--outline ff-btn--sm"
                  type="button"
                  disabled={pending}
                  onClick={() => setSrEditing(null)}
                >
                  Cancel
                </button>
                <span className="ff-sr-editor__hint">
                  {entry.userId === viewerUserId
                    ? "Self-reported. Leave blank to clear."
                    : "Reported for this player. Leave blank to clear."}
                </span>
              </form>
            ) : undefined}
          </BubbleRow>
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

/** The SR value plus an info tag saying who reported it (self vs a manager). */
function SkillTag({ entry }: { entry: RosterEntry }) {
  if (entry.skillRating == null) {
    return <span className="ff-sr ff-sr--empty">No SR</span>;
  }
  const self = entry.skillRatingBy != null && entry.skillRatingBy === entry.userId;
  const source = self ? "Self-reported" : "Reported by a manager";
  const when = entry.skillRatingAt
    ? ` · ${new Date(entry.skillRatingAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })}`
    : "";
  return (
    <span className="ff-sr" title={`${source}${when}`}>
      <span className="ff-sr__val">{entry.skillRating} SR</span>
      <span className={`ff-sr__by ff-sr__by--${self ? "self" : "manager"}`}>
        {self ? "self" : "manager"}
      </span>
    </span>
  );
}
