"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createTargetedInvite,
  revokeInvite,
  rotateInviteLink,
} from "@/app/teams/actions";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { Disclosure } from "@/components/dashboard/bubbles/Disclosure";
import {
  CopyInviteButton,
  inviteUrl,
} from "@/components/dashboard/teams/CopyInviteButton";
import {
  TEAM_ROLE_HINTS,
  TEAM_ROLE_LABELS,
  assignableRoles,
  type TeamRole,
} from "@/lib/teams-shared";

export type InviteEntry = {
  id: string;
  token: string;
  kind: string;
  role: TeamRole;
  note: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: number | null;
};

/**
 * The team's shareable link plus any targeted invites. The link is the
 * headline: it exists from the moment the team is created, so inviting people
 * is one click from the Teams tab.
 */
export function InvitePanel({
  teamId,
  linkToken,
  invites,
  viewerRole,
  defaultOpen,
}: {
  teamId: string;
  linkToken: string | null;
  invites: InviteEntry[];
  viewerRole: TeamRole;
  /** Expanded straight after team creation (`/teams/<id>/?invited=1`). */
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<TeamRole>("player");
  const [note, setNote] = useState("");
  const [minted, setMinted] = useState<string | null>(null);

  const targeted = invites.filter((invite) => invite.kind === "targeted");
  const roles = assignableRoles(viewerRole);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
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

      <BubbleRow
        label="Invite link"
        value={
          linkToken ? (
            <code className="ff-copy__url">{inviteUrl(linkToken)}</code>
          ) : (
            "No active link"
          )
        }
        note={
          linkToken
            ? "Anyone with this link joins as a player."
            : "Create a link to let players join themselves."
        }
        action={
          <div className="ff-row__buttons">
            {linkToken ? <CopyInviteButton token={linkToken} small /> : null}
            <button
              className="ff-btn ff-btn--outline ff-btn--sm"
              type="button"
              disabled={pending}
              onClick={() => run(() => rotateInviteLink(teamId))}
            >
              {linkToken ? "Reset" : "Create Link"}
            </button>
          </div>
        }
      />

      <Disclosure
        label="Invite Someone as Staff"
        note="A single-use link that lands them as a captain, coach, or manager."
      >
        {minted ? (
          <BubbleRow
            label="New invite"
            value={<code className="ff-copy__url">{inviteUrl(minted)}</code>}
            note="Single use, expires in 7 days."
            action={<CopyInviteButton token={minted} label="Copy" small />}
          />
        ) : null}
        <label className="ff-auth__field">
          <span className="ff-auth__label">Role</span>
          <select
            className="ff-auth__input"
            value={role}
            onChange={(event) => setRole(event.target.value as TeamRole)}
          >
            {roles.map((option) => (
              <option key={option} value={option}>
                {TEAM_ROLE_LABELS[option]}
              </option>
            ))}
          </select>
          <span className="ff-row__note">{TEAM_ROLE_HINTS[role]}</span>
        </label>
        <label className="ff-auth__field">
          <span className="ff-auth__label">Who it&rsquo;s for (optional)</span>
          <input
            className="ff-auth__input"
            type="text"
            value={note}
            maxLength={80}
            placeholder="Coach Sam"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <div className="ff-row__buttons">
          <button
            className="ff-btn ff-btn--sm"
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await createTargetedInvite(teamId, { role, note });
                if (result.ok) {
                  setMinted(result.token);
                  setNote("");
                }
                return result;
              })
            }
          >
            {pending ? "Creating…" : "Create Invite"}
          </button>
        </div>
      </Disclosure>

      {targeted.map((invite) => (
        <BubbleRow
          key={invite.id}
          label={invite.note ?? TEAM_ROLE_LABELS[invite.role]}
          value={<code className="ff-copy__url">{inviteUrl(invite.token)}</code>}
          note={`${TEAM_ROLE_LABELS[invite.role]} · ${
            invite.expiresAt
              ? `expires ${new Date(invite.expiresAt).toLocaleDateString()}`
              : "no expiry"
          }`}
          action={
            <div className="ff-row__buttons">
              <CopyInviteButton token={invite.token} label="Copy" small />
              <button
                className="ff-btn ff-btn--outline ff-btn--sm"
                type="button"
                disabled={pending}
                onClick={() => run(() => revokeInvite(teamId, invite.id))}
              >
                Revoke
              </button>
            </div>
          }
        />
      ))}

      {defaultOpen && linkToken ? (
        <p className="ff-auth__hint">
          Your team is live. Send that link to your players — they join
          themselves, no approval needed.
        </p>
      ) : null}
    </>
  );
}
