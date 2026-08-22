"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { enterTournament, withdrawFromTournament } from "@/app/teams/actions";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { ConfirmDialog } from "@/components/dashboard/bubbles/ConfirmDialog";

export type RegisterTeam = {
  id: string;
  name: string;
  tag: string | null;
  entered: boolean;
  memberCount: number;
  unverifiedCount: number;
};

/**
 * The team-registration control on a tournament page. Entered teams (with a
 * Withdraw) sit inline; registering opens a popup to pick a team, so the bubble
 * stays a short status list until you act. When academic verification is
 * required, a team with unverified members can't enter and its row says how many
 * need verifying — the same rule the server re-checks in enterTournament.
 */
export function TournamentRegister({
  tournamentId,
  registrationOpen,
  academicVerificationRequired,
  teams,
}: {
  tournamentId: string;
  registrationOpen: boolean;
  academicVerificationRequired: boolean;
  teams: RegisterTeam[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const label = (t: RegisterTeam) => (t.tag ? `${t.name} [${t.tag}]` : t.name);

  const enteredTeams = teams.filter((t) => t.entered);
  const available = teams.filter((t) => !t.entered);
  const selectable = available.filter(
    (t) => !academicVerificationRequired || t.unverifiedCount === 0,
  );
  const [selected, setSelected] = useState<string>(selectable[0]?.id ?? "");

  function withdraw(teamId: string) {
    setError(null);
    startTransition(async () => {
      const result = await withdrawFromTournament(teamId, tournamentId);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  function register() {
    setError(null);
    startTransition(async () => {
      const result = await enterTournament(selected, tournamentId);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setDialogOpen(false);
      router.refresh();
    });
  }

  if (teams.length === 0) {
    return (
      <p className="ff-auth__hint">
        You don&apos;t manage a team in this program yet. Create or join one on
        the <a href="/teams/">Teams</a> tab, then register here.
      </p>
    );
  }

  return (
    <>
      {error && !dialogOpen ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {enteredTeams.map((t) => (
        <BubbleRow
          key={t.id}
          label={label(t)}
          value="Entered"
          action={
            <button
              className="ff-btn ff-btn--soft ff-btn--sm"
              type="button"
              disabled={pending}
              onClick={() => withdraw(t.id)}
            >
              Withdraw
            </button>
          }
        />
      ))}

      {academicVerificationRequired
        ? available
            .filter((t) => t.unverifiedCount > 0)
            .map((t) => (
              <BubbleRow
                key={t.id}
                label={label(t)}
                value={`${t.unverifiedCount} unverified`}
                note="Every member must complete academic verification before this team can enter."
              />
            ))
        : null}

      {!registrationOpen ? (
        <p className="ff-auth__hint">Registration isn&apos;t open right now.</p>
      ) : selectable.length ? (
        <div className="ff-row__buttons">
          <button
            className="ff-btn ff-btn--soft ff-btn--sm"
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              setSelected((s) => s || selectable[0]?.id || "");
              setDialogOpen(true);
            }}
          >
            Register a team
          </button>
        </div>
      ) : available.length ? null : (
        <p className="ff-auth__hint">
          All your teams are entered. Nothing more to register.
        </p>
      )}

      <ConfirmDialog
        open={dialogOpen}
        title="Register a Team"
        description={
          academicVerificationRequired
            ? "Only teams whose members are all academically verified appear here."
            : "Pick the team to enter this tournament."
        }
        confirmLabel={pending ? "Registering…" : "Register"}
        busy={pending}
        error={dialogOpen ? error : null}
        onConfirm={register}
        onClose={() => {
          if (!pending) setDialogOpen(false);
        }}
      >
        <label className="screen-reader-text" htmlFor="ff-register-team">
          Team
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
      </ConfirmDialog>
    </>
  );
}
