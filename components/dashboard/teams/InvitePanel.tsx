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

/** Enough of the token to tell two links apart, not enough to retype from a
    screenshot or a stream. The clipboard always gets the real URL. */
function maskedUrl(token: string): string {
  const url = inviteUrl(token);
  const visible = token.slice(0, 4);
  return url.replace(token, `${visible}${"•".repeat(Math.max(token.length - 4, 0))}`);
}

/** Link display with a reveal toggle — masked by default, readable when
    someone actually has to dictate it. */
function InviteLink({ token }: { token: string }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span className="ff-copy__mask">
      <code className="ff-copy__url">
        {revealed ? inviteUrl(token) : maskedUrl(token)}
      </code>
      <button
        className="ff-copy__reveal"
        type="button"
        aria-pressed={revealed}
        title={revealed ? "Hide the link" : "Show the link"}
        onClick={() => setRevealed((current) => !current)}
      >
        <span className="screen-reader-text">
          {revealed ? "Hide the invite link" : "Show the invite link"}
        </span>
        <EyeIcon off={revealed} />
      </button>
    </span>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8Z" />
      <circle cx="8" cy="8" r="2" />
      {off ? <path d="M2.5 2.5l11 11" /> : null}
    </svg>
  );
}

/**
 * Everything to do with getting people onto the roster, in one disclosure:
 * the team's shareable link (masked, copyable, resettable) and single-use
 * invites that land someone directly as a captain, coach, or manager.
 *
 * Lives inside the team header bubble, and opens itself right after the team
 * is created (`?invited=1`) so "create a team" and "invite your players" stay
 * two clicks apart.
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
    <Disclosure
      label="Invite Players"
      note="Share the team link, or invite someone as staff."
      defaultOpen={defaultOpen}
    >
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <BubbleRow
        label="Invite link"
        value={linkToken ? <InviteLink token={linkToken} /> : "No active link"}
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

      {targeted.map((invite) => (
        <BubbleRow
          key={invite.id}
          label={invite.note ?? TEAM_ROLE_LABELS[invite.role]}
          value={<InviteLink token={invite.token} />}
          note={`${TEAM_ROLE_LABELS[invite.role]} · single use · ${
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

      {minted ? (
        <BubbleRow
          label="New invite"
          value={<InviteLink token={minted} />}
          note="Single use, expires in 7 days."
          action={<CopyInviteButton token={minted} label="Copy" small />}
        />
      ) : null}

      <div className="ff-invite__form">
        <label className="ff-auth__field">
          <span className="ff-auth__label">Invite as</span>
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
      </div>
    </Disclosure>
  );
}
