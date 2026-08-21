"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateTournamentSettings } from "@/app/admin/tournaments/actions";
import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { FieldRow } from "@/components/dashboard/bubbles/FieldRow";
import {
  MAX_PARTICIPANTS,
  RULES_URL_MAX,
  SWISS_ROUNDS_MAX,
  SWISS_ROUNDS_MIN,
  TOURNAMENT_FORMATS,
  TOURNAMENT_FORMAT_LABELS,
  TOURNAMENT_NAME_MAX,
  type TournamentFormat,
} from "@/lib/tournaments-shared";

type Patch = Parameters<typeof updateTournamentSettings>[1];

/**
 * A tournament's configuration, grouped the way Challonge's own form groups it:
 * Basic Info, Game Info (format + what follows from it), Schedule. Only the
 * fields Challonge actually honors are here — bracket generation, seeding and
 * scoring all live on Challonge, so there is nothing self-hosted to configure.
 *
 * Rendering several bubbles from one client component (rather than composing
 * them in the page) keeps every control on the same `apply` path and the same
 * error banner. Format locks once the bracket is started, since changing it
 * would invalidate the Challonge bracket.
 */
export function TournamentSettings({
  tournamentId,
  name,
  publicUrl,
  format,
  bestOf,
  maxParticipants,
  swissRounds,
  thirdPlaceMatch,
  rulesUrl,
  startsAt,
  endsAt,
  registrationOpensAt,
  registrationClosesAt,
  rosterLockAt,
  formatLocked,
}: {
  tournamentId: string;
  name: string;
  publicUrl: string;
  format: TournamentFormat;
  bestOf: number;
  maxParticipants: number | null;
  swissRounds: number | null;
  thirdPlaceMatch: boolean;
  rulesUrl: string | null;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  rosterLockAt: string;
  formatLocked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /** One save path for every control, so error handling can't drift. */
  function apply(patch: Patch) {
    setError(null);
    startTransition(async () => {
      const result = await updateTournamentSettings(tournamentId, patch);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const saveField =
    (field: keyof Patch) =>
    async (value: string): Promise<string | null> => {
      const result = await updateTournamentSettings(tournamentId, {
        [field]: value,
      } as Patch);
      if (!result.ok) return result.error;
      router.refresh();
      return null;
    };

  const saveNumber =
    (field: keyof Patch) =>
    async (value: string): Promise<string | null> => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return "Enter a number.";
      const result = await updateTournamentSettings(tournamentId, {
        [field]: parsed,
      } as Patch);
      if (!result.ok) return result.error;
      router.refresh();
      return null;
    };

  /** A datetime-local row. Saves on blur — a date picker has no "done" event. */
  const dateRow = (label: string, field: keyof Patch, value: string) => (
    <BubbleRow
      label={label}
      field={
        <input
          className="ff-auth__input"
          type="datetime-local"
          defaultValue={value}
          disabled={pending}
          onBlur={(e) => apply({ [field]: e.target.value } as Patch)}
        />
      }
    />
  );

  return (
    <>
      {error ? (
        <div className="ff-auth__error ff-bubble-columns__span" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <Bubble title="Basic Info">
        <FieldRow
          label="Name"
          value={name}
          inputLabel="Tournament name"
          maxLength={TOURNAMENT_NAME_MAX}
          onSave={saveField("name")}
        />
        <BubbleRow
          label="Tournament ID"
          value={tournamentId}
          locked
          lockTitle="Assigned on creation and permanent"
        />
        <BubbleRow label="Public URL" value={publicUrl} />
      </Bubble>

      <Bubble title="Game Info">
        {formatLocked ? (
          <BubbleRow
            label="Format"
            value={TOURNAMENT_FORMAT_LABELS[format] ?? format}
            locked
            lockTitle="Reset the bracket to change format"
            note="Locked — reset the bracket to change format."
          />
        ) : (
          <BubbleRow
            label="Format"
            field={
              <select
                className="ff-auth__input"
                value={format}
                disabled={pending}
                onChange={(e) => apply({ format: e.target.value })}
              >
                {TOURNAMENT_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {TOURNAMENT_FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            }
          />
        )}

        {format === "swiss" ? (
          <FieldRow
            label="Swiss Rounds"
            value={swissRounds ? String(swissRounds) : ""}
            inputLabel="Number of rounds"
            inputType="number"
            required={false}
            note={`${SWISS_ROUNDS_MIN}–${SWISS_ROUNDS_MAX}, or blank to derive from the field size.`}
            onSave={saveNumber("swissRounds")}
          />
        ) : null}

        {format === "single_elim" ? (
          <BubbleRow
            label="Third-Place Match"
            value={thirdPlaceMatch ? "On" : "Off"}
            action={
              <button
                className="ff-btn ff-btn--outline ff-btn--sm"
                type="button"
                disabled={pending || formatLocked}
                onClick={() => apply({ thirdPlaceMatch: !thirdPlaceMatch })}
              >
                {thirdPlaceMatch ? "Turn off" : "Turn on"}
              </button>
            }
          />
        ) : null}

        <FieldRow
          label="Best Of"
          value={String(bestOf)}
          inputLabel="Games per series"
          inputType="number"
          note="Odd, 1–9. Shown on the bracket; scores are entered as sets."
          onSave={saveNumber("bestOf")}
        />

        <FieldRow
          label="Max Entrants"
          value={maxParticipants ? String(maxParticipants) : ""}
          inputLabel="Maximum entrants"
          inputType="number"
          required={false}
          note={`Up to ${MAX_PARTICIPANTS}.`}
          onSave={saveNumber("maxParticipants")}
        />
      </Bubble>

      <Bubble title="Schedule">
        {dateRow("Starts", "startsAt", startsAt)}
        {dateRow("Ends", "endsAt", endsAt)}
        {dateRow("Registration Opens", "registrationOpensAt", registrationOpensAt)}
        {dateRow(
          "Registration Closes",
          "registrationClosesAt",
          registrationClosesAt,
        )}
        {dateRow("Roster Lock", "rosterLockAt", rosterLockAt)}
        <FieldRow
          label="Rules Link"
          value={rulesUrl ?? ""}
          inputLabel="Rules URL"
          inputType="url"
          maxLength={RULES_URL_MAX}
          required={false}
          placeholder="https://…"
          onSave={saveField("rulesUrl")}
        />
      </Bubble>
    </>
  );
}
