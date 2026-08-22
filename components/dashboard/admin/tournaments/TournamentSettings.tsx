"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { updateTournamentSettings } from "@/app/admin/tournaments/actions";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { Disclosure } from "@/components/dashboard/bubbles/Disclosure";
import { FieldRow } from "@/components/dashboard/bubbles/FieldRow";
import { Switch } from "@/components/dashboard/bubbles/Switch";
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
 * The tournament's settings, split into three section components so the detail
 * page can place them where they belong — Basic Info in the top bubble, Game
 * Info in the left column, Schedule in the right. Only the fields Challonge
 * actually honors are here; bracket generation, seeding and scoring all live on
 * Challonge. Each section shares one save path (`useTournamentPatch`) so error
 * handling and the refresh-on-success can't drift between them.
 */
function useTournamentPatch(tournamentId: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  return { pending, error, apply, saveField, saveNumber };
}

function ErrorBanner({ error }: { error: string | null }): ReactNode {
  if (!error) return null;
  return (
    <div className="ff-auth__error" role="alert">
      <p>{error}</p>
    </div>
  );
}

/** Editable identity fields for the top header bubble. */
export function TournamentBasicInfo({
  tournamentId,
  name,
  description,
  rulesUrl,
}: {
  tournamentId: string;
  name: string;
  description: string | null;
  rulesUrl: string | null;
}) {
  const { error, saveField } = useTournamentPatch(tournamentId);
  return (
    <>
      <ErrorBanner error={error} />
      <FieldRow
        label="Name"
        value={name}
        inputLabel="Tournament name"
        maxLength={TOURNAMENT_NAME_MAX}
        onSave={saveField("name")}
      />
      <FieldRow
        label="Description"
        value={description ?? ""}
        inputLabel="Short description"
        maxLength={500}
        required={false}
        placeholder="A short blurb shown under the name."
        onSave={saveField("description")}
      />
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
    </>
  );
}

/** Format and everything that follows from it. */
export function TournamentGameInfo({
  tournamentId,
  format,
  bestOf,
  maxParticipants,
  swissRounds,
  thirdPlaceMatch,
  academicVerificationRequired,
  formatLocked,
}: {
  tournamentId: string;
  format: TournamentFormat;
  bestOf: number;
  maxParticipants: number | null;
  swissRounds: number | null;
  thirdPlaceMatch: boolean;
  academicVerificationRequired: boolean;
  formatLocked: boolean;
}) {
  const { pending, error, apply, saveNumber } = useTournamentPatch(tournamentId);
  return (
    <>
      <ErrorBanner error={error} />
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

      <FieldRow
        label="Max Entrants"
        value={maxParticipants ? String(maxParticipants) : ""}
        inputLabel="Maximum entrants"
        inputType="number"
        required={false}
        note={`Up to ${MAX_PARTICIPANTS}.`}
        onSave={saveNumber("maxParticipants")}
      />

      <BubbleRow
        label="Academic Verification"
        note={
          academicVerificationRequired
            ? "Every team member must be verified to enter."
            : "Any team can enter, verified or not."
        }
        action={
          <Switch
            checked={academicVerificationRequired}
            disabled={pending}
            label="Academic verification required"
            onChange={(next) => apply({ academicVerificationRequired: next })}
          />
        }
      />

      {/* Less-used knobs, tucked away so the common case stays a two-line form. */}
      <Disclosure label="Advanced" note="Series length and format extras">
        <FieldRow
          label="Best Of"
          value={String(bestOf)}
          inputLabel="Games per series"
          inputType="number"
          note="Odd, 1–9. Shown on the bracket; scores are entered as sets."
          onSave={saveNumber("bestOf")}
        />

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
            note="Adds a match for 3rd/4th place."
            action={
              <Switch
                checked={thirdPlaceMatch}
                disabled={pending || formatLocked}
                label="Third-place match"
                onChange={(next) => apply({ thirdPlaceMatch: next })}
              />
            }
          />
        ) : null}
      </Disclosure>
    </>
  );
}

/** The five scheduling timestamps. */
export function TournamentSchedule({
  tournamentId,
  startsAt,
  endsAt,
  registrationOpensAt,
  registrationClosesAt,
  rosterLockAt,
}: {
  tournamentId: string;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  rosterLockAt: string;
}) {
  const { pending, error, apply } = useTournamentPatch(tournamentId);

  /** A datetime-local row, saving on blur. `--date` inverts the UA calendar
      glyph to white so it isn't a black square on the dark field. */
  const dateRow = (label: string, field: keyof Patch, value: string) => (
    <BubbleRow
      label={label}
      field={
        <input
          className="ff-auth__input ff-auth__input--date"
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
      <ErrorBanner error={error} />
      {dateRow("Starts", "startsAt", startsAt)}
      {dateRow("Ends", "endsAt", endsAt)}
      {dateRow("Registration Opens", "registrationOpensAt", registrationOpensAt)}
      {dateRow("Registration Closes", "registrationClosesAt", registrationClosesAt)}
      {dateRow("Roster Lock", "rosterLockAt", rosterLockAt)}
    </>
  );
}
