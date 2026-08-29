"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createTeam } from "@/app/teams/actions";
import {
  CopyInviteButton,
  inviteUrl,
} from "@/components/dashboard/teams/CopyInviteButton";
import { GameSelect } from "@/components/dashboard/teams/GameSelect";
import { TeamColorPicker } from "@/components/dashboard/teams/TeamColorPicker";
import { browserTimezone } from "@/components/dashboard/teams/TimezoneRow";
import type { GameOption } from "@/lib/games-shared";
import {
  DEFAULT_TEAM_COLOR,
  TEAM_NAME_MAX,
  TEAM_TAG_MAX,
} from "@/lib/teams-shared";

/**
 * "Start a Team" as a two-step modal (native <dialog>, like AdminUnlockDialog —
 * Esc + focus trapping come free):
 *
 *   1. create — name + tag; on success the team exists and we have its invite
 *      link token (createTeam returns both).
 *   2. invite — show the invite link with a copy button, so the flow is
 *      "create, then copy the link" without leaving the Teams tab. "Done"
 *      closes and refreshes so the new team appears in the list.
 *
 * Unverified members get the verify prompt instead of the form (teams are
 * verified-only). The parent owns `open`; this owns the step + form state and
 * resets both each time it opens.
 */
export function StartTeamDialog({
  open,
  verified,
  games,
  onClose,
}: {
  open: boolean;
  verified: boolean;
  games: GameOption[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [step, setStep] = useState<"create" | "invite">("create");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [gameId, setGameId] = useState(games[0]?.id ?? "");
  const [color, setColor] = useState(DEFAULT_TEAM_COLOR);
  const [created, setCreated] = useState<{ teamId: string; token: string } | null>(
    null,
  );

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  // Reset to a clean first step whenever the dialog is (re)opened.
  useEffect(() => {
    if (!open) return;
    setStep("create");
    setError(null);
    setName("");
    setTag("");
    setGameId(games[0]?.id ?? "");
    setColor(DEFAULT_TEAM_COLOR);
    setCreated(null);
    setPending(false);
  }, [open, games]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    const result = await createTeam({
      name,
      tag,
      gameId,
      color,
      timezone: browserTimezone(),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCreated({ teamId: result.teamId, token: result.token });
    setStep("invite");
    // The team now exists — refresh so the list behind the dialog shows it.
    router.refresh();
  }

  function finish() {
    onClose();
    router.refresh();
  }

  return (
    <dialog
      ref={ref}
      className="ff-dialog"
      onClose={onClose}
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
    >
      {step === "create" ? (
        verified ? (
          <>
            <h2 className="ff-dialog__title">Start a Team</h2>
            <p className="ff-dialog__text">
              You&rsquo;ll be its manager. Next you&rsquo;ll get an invite link to
              share with your players.
            </p>
            <form onSubmit={onSubmit}>
              <label className="ff-auth__field">
                <span className="ff-auth__label">Team name</span>
                <input
                  className="ff-auth__input"
                  type="text"
                  value={name}
                  maxLength={TEAM_NAME_MAX}
                  placeholder="Fault University Esports"
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </label>
              <label className="ff-auth__field">
                <span className="ff-auth__label">Tag (optional)</span>
                <input
                  className="ff-auth__input"
                  type="text"
                  value={tag}
                  maxLength={TEAM_TAG_MAX}
                  placeholder="FLT"
                  onChange={(event) => setTag(event.target.value)}
                />
              </label>
              {games.length ? (
                <label className="ff-auth__field">
                  <span className="ff-auth__label">Game</span>
                  <GameSelect
                    value={gameId}
                    games={games}
                    disabled={pending}
                    onChange={setGameId}
                  />
                </label>
              ) : null}
              <div className="ff-auth__field">
                <span className="ff-auth__label">Team colour</span>
                <TeamColorPicker
                  value={color}
                  onChange={setColor}
                  disabled={pending}
                />
              </div>
              {error ? (
                <div className="ff-auth__error" role="alert">
                  <p>{error}</p>
                </div>
              ) : null}
              <div className="ff-dialog__actions">
                <button
                  type="button"
                  className="ff-btn ff-btn--outline"
                  onClick={onClose}
                  disabled={pending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ff-btn"
                  disabled={pending || name.trim().length < 2}
                >
                  {pending ? "Creating…" : "Create Team"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h2 className="ff-dialog__title">Verify to start a team</h2>
            <p className="ff-dialog__text">
              Teams are for verified members — verify your academic email and this
              takes about a minute.
            </p>
            <div className="ff-dialog__actions">
              <button
                type="button"
                className="ff-btn ff-btn--outline"
                onClick={onClose}
              >
                Close
              </button>
              <a className="ff-btn" href="/account/setup/">
                Verify My Email
              </a>
            </div>
          </>
        )
      ) : (
        <>
          <h2 className="ff-dialog__title">Invite your players</h2>
          <input
            className="ff-auth__input ff-copy__input"
            type="text"
            readOnly
            value={created ? inviteUrl(created.token) : ""}
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Invite link"
          />
          <div className="ff-dialog__actions ff-team-invite__actions">
            {created ? (
              <a
                className="ff-btn ff-btn--outline"
                href={`/teams/${created.teamId}/`}
              >
                Manage
              </a>
            ) : null}
            {created ? (
              <CopyInviteButton token={created.token} label="Copy" />
            ) : null}
            <button type="button" className="ff-btn" onClick={finish}>
              Done
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
