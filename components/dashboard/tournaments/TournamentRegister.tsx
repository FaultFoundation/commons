"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { enterTournament, withdrawFromTournament } from "@/app/teams/actions";

export type RegisterTeam = {
  id: string;
  name: string;
  tag: string | null;
  entered: boolean;
  memberCount: number;
  unverifiedCount: number;
};

/**
 * The tournament's entry control: a blue button that lives in the hero and
 * opens a popup to register or withdraw a team. Kept out of the page flow so the
 * hero stays clean — everything (eligible teams, entered teams, teams blocked on
 * academic verification) happens in the modal. The server re-checks the entry
 * rules in enterTournament regardless.
 */
export function TournamentRegister({
  tournamentId,
  registrationOpen,
  started,
  academicVerificationRequired,
  teams,
}: {
  tournamentId: string;
  registrationOpen: boolean;
  /** The bracket has been generated — withdrawing now disqualifies the team. */
  started: boolean;
  academicVerificationRequired: boolean;
  teams: RegisterTeam[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // The team whose withdrawal is awaiting confirmation.
  const [confirming, setConfirming] = useState<string | null>(null);

  const label = (t: RegisterTeam) => (t.tag ? `${t.name} [${t.tag}]` : t.name);
  const entered = teams.filter((t) => t.entered);
  const available = teams.filter((t) => !t.entered);
  const selectable = available.filter(
    (t) => !academicVerificationRequired || t.unverifiedCount === 0,
  );
  const blocked = academicVerificationRequired
    ? available.filter((t) => t.unverifiedCount > 0)
    : [];
  const [selected, setSelected] = useState<string>(selectable[0]?.id ?? "");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

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

  const buttonLabel = entered.length ? "Manage Entry" : "Register";

  return (
    <>
      <button
        className="ff-btn ff-btn--sm"
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {buttonLabel}
      </button>

      <dialog
        ref={dialogRef}
        className="ff-dialog"
        onClose={() => setOpen(false)}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <h2 className="ff-dialog__title">Tournament Entry</h2>

        {error ? (
          <div className="ff-auth__error" role="alert">
            <p>{error}</p>
          </div>
        ) : null}

        {teams.length === 0 ? (
          <p className="ff-dialog__text">
            You don&apos;t manage a team in this program yet. Create or join one
            on the <a href="/teams/">Teams</a> tab, then register here.
          </p>
        ) : (
          <div className="ff-entry">
            {entered.map((t) =>
              confirming === t.id ? (
                <div className="ff-entry__warn" key={t.id}>
                  <p className="ff-entry__warn-text">
                    {started
                      ? "This will disqualify your team from the tournament and you will be unable to rejoin."
                      : `Withdraw ${label(t)} from this tournament? You can re-register while registration is open.`}
                  </p>
                  <div className="ff-row__buttons">
                    <button
                      className="ff-btn ff-btn--danger ff-btn--sm"
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() => withdrawFromTournament(t.id, tournamentId))
                      }
                    >
                      {pending ? "Withdrawing…" : "Withdraw"}
                    </button>
                    <button
                      className="ff-btn ff-btn--outline ff-btn--sm"
                      type="button"
                      disabled={pending}
                      onClick={() => setConfirming(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="ff-entry__row" key={t.id}>
                  <span className="ff-entry__name">{label(t)}</span>
                  <span className="ff-entry__tag ff-entry__tag--in">Entered</span>
                  <button
                    className="ff-btn ff-btn--outline ff-btn--sm"
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setError(null);
                      setConfirming(t.id);
                    }}
                  >
                    Withdraw
                  </button>
                </div>
              ),
            )}

            {blocked.map((t) => (
              <div className="ff-entry__row" key={t.id}>
                <span className="ff-entry__name">{label(t)}</span>
                <span className="ff-entry__tag">
                  {t.unverifiedCount} unverified
                </span>
              </div>
            ))}

            {!registrationOpen ? (
              <p className="ff-dialog__text">Registration isn&apos;t open right now.</p>
            ) : selectable.length ? (
              <div className="ff-entry__row">
                <label className="screen-reader-text" htmlFor="ff-register-team">
                  Team to enter
                </label>
                <select
                  id="ff-register-team"
                  className="ff-auth__input"
                  value={selected}
                  disabled={pending}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {selectable.map((t) => (
                    <option key={t.id} value={t.id}>
                      {label(t)}
                    </option>
                  ))}
                </select>
                <button
                  className="ff-btn ff-btn--sm"
                  type="button"
                  disabled={pending || !selected}
                  onClick={() =>
                    run(() => enterTournament(selected, tournamentId))
                  }
                >
                  {pending ? "…" : "Register"}
                </button>
              </div>
            ) : available.length ? null : (
              <p className="ff-dialog__text">All your teams are entered.</p>
            )}

            {blocked.length ? (
              <p className="ff-dialog__hint">
                A blocked team needs every member academically verified before it
                can enter.
              </p>
            ) : null}
          </div>
        )}

        <div className="ff-dialog__actions">
          <button
            type="button"
            className="ff-btn ff-btn--outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Close
          </button>
        </div>
      </dialog>
    </>
  );
}
