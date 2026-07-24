"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { addStaffRole, removeStaffRole } from "@/app/admin/staff/actions";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { ConfirmDialog } from "@/components/dashboard/bubbles/ConfirmDialog";
import {
  STAFF_ROLE_HINTS,
  STAFF_ROLE_LABELS,
  type StaffRole,
} from "@/lib/staff-shared";

type StaffGrant = {
  role: StaffRole;
  grantedVia: string | null;
  grantedAt: number;
};
type StaffMember = {
  userId: string;
  name: string;
  email: string;
  roles: StaffGrant[];
};

/**
 * The staff-management panel: grant roles by email, and revoke the roles a
 * member holds. Everything it can offer is decided by `assignableRoles` — the
 * union of what the viewer's own roles let them hand out — so an admin never
 * sees controls to touch owners, and Discord-synced grants are shown but not
 * removable here (the sync would re-add them).
 */
export function StaffPanel({
  members,
  assignableRoles,
  viewerUserId,
}: {
  members: StaffMember[];
  assignableRoles: StaffRole[];
  viewerUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [email, setEmail] = useState("");
  const [addRole, setAddRole] = useState<StaffRole | "">(
    assignableRoles[0] ?? "",
  );
  const [addError, setAddError] = useState<string | null>(null);

  const [removing, setRemoving] = useState<{
    member: StaffMember;
    role: StaffRole;
  } | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !addRole || !email.trim()) return;
    setAddError(null);
    startTransition(async () => {
      const result = await addStaffRole({ email: email.trim(), role: addRole });
      if (!result.ok) {
        setAddError(result.error);
        return;
      }
      setEmail("");
      router.refresh();
    });
  }

  function onRemove() {
    if (!removing) return;
    setRemoveError(null);
    startTransition(async () => {
      const result = await removeStaffRole({
        userId: removing.member.userId,
        role: removing.role,
      });
      if (!result.ok) {
        setRemoveError(result.error);
        return;
      }
      setRemoving(null);
      router.refresh();
    });
  }

  return (
    <>
      {assignableRoles.length > 0 ? (
        <Bubble title="Add Staff" span="full">
          <form className="ff-auth" onSubmit={onAdd} autoComplete="off">
            {addError ? (
              <div className="ff-auth__error" role="alert">
                <p>{addError}</p>
              </div>
            ) : null}
            <label className="ff-auth__field">
              <span className="ff-auth__label">Email</span>
              <input
                className="ff-auth__input"
                type="email"
                value={email}
                required
                placeholder="person@example.com"
                autoComplete="off"
                disabled={pending}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setAddError(null);
                }}
              />
            </label>
            <label className="ff-auth__field">
              <span className="ff-auth__label">Role</span>
              <select
                className="ff-auth__input"
                value={addRole}
                disabled={pending}
                onChange={(event) => setAddRole(event.target.value as StaffRole)}
              >
                {assignableRoles.map((role) => (
                  <option key={role} value={role} title={STAFF_ROLE_HINTS[role]}>
                    {STAFF_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </label>
            <div className="ff-row__buttons">
              <button
                className="ff-btn ff-btn--sm"
                type="submit"
                disabled={pending || !email.trim() || !addRole}
              >
                {pending ? "Adding…" : "Add staff"}
              </button>
            </div>
            <p className="ff-row__note">
              They need a website account already — have them sign in once, then
              grant access here.
            </p>
          </form>
        </Bubble>
      ) : null}

      <Bubble
        title="Staff"
        span="full"
        actions={<span className="ff-row__note">{members.length}</span>}
      >
        {members.length === 0 ? (
          <p className="ff-row__note">No staff yet.</p>
        ) : (
          members.map((member) => {
            const removable = member.roles.filter(
              (grant) =>
                assignableRoles.includes(grant.role) &&
                grant.grantedVia !== "discord",
            );
            return (
              <BubbleRow
                key={member.userId}
                label={
                  member.userId === viewerUserId
                    ? `${member.name} (you)`
                    : member.name
                }
                note={member.email}
                value={
                  <span className="ff-staff__roles">
                    {member.roles.map((grant) => (
                      <span
                        key={grant.role}
                        className={`ff-badge ff-badge--${grant.role}`}
                        title={
                          grant.grantedVia === "discord"
                            ? "Synced from Discord"
                            : STAFF_ROLE_HINTS[grant.role]
                        }
                      >
                        {STAFF_ROLE_LABELS[grant.role]}
                        {grant.grantedVia === "discord" ? " · Discord" : ""}
                      </span>
                    ))}
                  </span>
                }
                action={
                  removable.length ? (
                    <div className="ff-staff__controls">
                      {removable.map((grant) => (
                        <button
                          key={grant.role}
                          className="ff-btn ff-btn--outline ff-btn--sm"
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            setRemoveError(null);
                            setRemoving({ member, role: grant.role });
                          }}
                        >
                          Remove {STAFF_ROLE_LABELS[grant.role]}
                        </button>
                      ))}
                    </div>
                  ) : undefined
                }
              />
            );
          })
        )}
      </Bubble>

      <ConfirmDialog
        open={removing !== null}
        title="Remove Staff Role"
        description={
          removing
            ? `${removing.member.name} loses the ${STAFF_ROLE_LABELS[removing.role]} role and everything it grants.`
            : undefined
        }
        confirmLabel="Remove"
        danger
        busy={pending}
        error={removeError}
        onConfirm={onRemove}
        onClose={() => {
          if (!pending) setRemoving(null);
        }}
      />
    </>
  );
}
