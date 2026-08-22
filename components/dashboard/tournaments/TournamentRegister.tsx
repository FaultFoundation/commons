"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { enterTournament, withdrawFromTournament } from "@/app/teams/actions";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";

export type RegisterTeam = {
  id: string;
  name: string;
  tag: string | null;
  entered: boolean;
  memberCount: number;
  unverifiedCount: number;
};

/**
 * The team-registration control on a tournament page. Lists the teams the
 * viewer manages in this program; each can Enter (or Withdraw). When academic
 * verification is required, a team with unverified members can't enter and the
 * row says how many need verifying — the same rule the server re-checks in
 * enterTournament, surfaced up front so the button isn't a dead end.
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
  const [selected, setSelected] = useState<string>(teams[0]?.id ?? "");

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

  const label = (t: RegisterTeam) => (t.tag ? `${t.name} [${t.tag}]` : t.name);

  if (teams.length === 0) {
    return (
      <p className="ff-auth__hint">
        You don&apos;t manage a team in this program yet. Create or join one on
        the <a href="/teams/">Teams</a> tab, then register here.
      </p>
    );
  }

  const enteredTeams = teams.filter((t) => t.entered);
  const available = teams.filter((t) => !t.entered);
  const selectable = available.filter(
    (t) => !academicVerificationRequired || t.unverifiedCount === 0,
  );

  return (
    <>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      {/* Teams already in. */}
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
              onClick={() => run(() => withdrawFromTournament(t.id, tournamentId))}
            >
              Withdraw
            </button>
          }
        />
      ))}

      {/* Teams blocked by unverified members. */}
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

      {/* The register control. */}
      {!registrationOpen ? (
        <p className="ff-auth__hint">Registration isn&apos;t open right now.</p>
      ) : selectable.length === 0 ? (
        available.length ? null : (
          <p className="ff-auth__hint">
            All your teams are entered. Nothing more to register.
          </p>
        )
      ) : (
        <BubbleRow
          label="Register a team"
          field={
            <select
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
          }
          action={
            <button
              className="ff-btn ff-btn--soft ff-btn--sm"
              type="button"
              disabled={pending || !selected}
              onClick={() =>
                run(() => enterTournament(selected, tournamentId))
              }
            >
              {pending ? "Registering…" : "Register"}
            </button>
          }
        />
      )}
    </>
  );
}
