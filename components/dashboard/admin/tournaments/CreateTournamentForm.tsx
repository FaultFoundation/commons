"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { createTournament } from "@/app/admin/tournaments/actions";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import {
  MAX_PARTICIPANTS,
  TOURNAMENT_FORMATS,
  TOURNAMENT_FORMAT_LABELS,
  TOURNAMENT_NAME_MAX,
  slugifyName,
} from "@/lib/tournaments-shared";

/**
 * Creates a tournament in `draft`, which also creates the matching Challonge
 * tournament under the org account. Deliberately the short form — name, format,
 * field size — because everything else is editable on the detail page.
 */
export function CreateTournamentForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [format, setFormat] = useState<string>("single_elim");
  const [maxParticipants, setMaxParticipants] = useState("32");
  const [verificationRequired, setVerificationRequired] = useState(true);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createTournament({
        name,
        format,
        maxParticipants: Number(maxParticipants) || undefined,
        academicVerificationRequired: verificationRequired,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/admin/tournaments/${result.tournamentId}/`);
    });
  }

  return (
    <form onSubmit={onSubmit}>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <BubbleRow
        label="Name"
        note={
          name.trim()
            ? `Public bracket: /t/<id>/${slugifyName(name)}/ — the ID is assigned on create.`
            : "The public URL is built from this; a six-digit ID is assigned automatically."
        }
        field={
          <input
            className="ff-auth__input"
            type="text"
            value={name}
            maxLength={TOURNAMENT_NAME_MAX}
            placeholder="Spring Invitational 2026"
            required
            onChange={(e) => setName(e.target.value)}
          />
        }
      />

      <BubbleRow
        label="Format"
        field={
          <select
            className="ff-auth__input"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            {TOURNAMENT_FORMATS.map((f) => (
              <option key={f} value={f}>
                {TOURNAMENT_FORMAT_LABELS[f]}
              </option>
            ))}
          </select>
        }
      />

      <BubbleRow
        label="Max entrants"
        note={`Platform cap is ${MAX_PARTICIPANTS}.`}
        field={
          <input
            className="ff-auth__input"
            type="number"
            min={2}
            max={MAX_PARTICIPANTS}
            value={maxParticipants}
            onChange={(e) => setMaxParticipants(e.target.value)}
          />
        }
      />

      <BubbleRow
        label="Academic verification"
        note={
          verificationRequired
            ? "Every team member must be academically verified to enter."
            : "Any team can enter, verified or not."
        }
        value={verificationRequired ? "Required" : "Not required"}
        action={
          <button
            className="ff-btn ff-btn--soft ff-btn--sm"
            type="button"
            onClick={() => setVerificationRequired((v) => !v)}
          >
            {verificationRequired ? "Make optional" : "Require"}
          </button>
        }
      />

      <div className="ff-row__buttons">
        <button
          className="ff-btn ff-btn--soft"
          type="submit"
          disabled={pending || !name.trim()}
        >
          {pending ? "Creating…" : "Create Tournament"}
        </button>
      </div>
    </form>
  );
}
