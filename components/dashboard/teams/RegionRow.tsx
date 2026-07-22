"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { updateTeamSettings } from "@/app/teams/actions";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";

/**
 * `teams.region` is one string ("California, United States") so LFG can match
 * on it without a join. The editor splits it back into its two halves — the
 * country picked from the same directory the school search uses, the state
 * typed freely (the dataset spells these inconsistently, and plenty of
 * countries have none).
 */
function splitRegion(region: string | null): { state: string; country: string } {
  if (!region) return { state: "", country: "" };
  const comma = region.lastIndexOf(", ");
  if (comma === -1) return { state: "", country: region };
  return {
    state: region.slice(0, comma).trim(),
    country: region.slice(comma + 2).trim(),
  };
}

export function RegionRow({
  teamId,
  region,
  countries,
  editable,
}: {
  teamId: string;
  region: string | null;
  /** Directory countries, from listSchoolCountries(). */
  countries: string[];
  editable: boolean;
}) {
  const router = useRouter();
  const initial = splitRegion(region);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState(initial.country);
  const [state, setState] = useState(initial.state);

  // A country the directory doesn't list (or an empty directory) still has to
  // survive a round trip through the select.
  const options = countries.includes(country) || !country
    ? countries
    : [country, ...countries];

  async function save() {
    setError(null);
    setPending(true);
    const next = [state.trim(), country.trim()].filter(Boolean).join(", ");
    const result = await updateTeamSettings(teamId, { region: next });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <BubbleRow
      label="Region"
      value={region ?? "—"}
      note={region ? undefined : "Taken from your school when the team is made."}
      action={
        editable && !editing ? (
          <button
            className="ff-btn ff-btn--outline ff-btn--sm"
            type="button"
            onClick={() => {
              setError(null);
              setEditing(true);
            }}
          >
            Edit
          </button>
        ) : undefined
      }
    >
      {editing ? (
        <>
          {error ? (
            <div className="ff-auth__error" role="alert">
              <p>{error}</p>
            </div>
          ) : null}
          <label className="ff-auth__field">
            <span className="ff-auth__label">Country</span>
            <select
              className="ff-auth__input"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
            >
              <option value="">Select…</option>
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="ff-auth__field">
            <span className="ff-auth__label">State or province (optional)</span>
            <input
              className="ff-auth__input"
              type="text"
              value={state}
              maxLength={40}
              placeholder="California"
              onChange={(event) => setState(event.target.value)}
            />
          </label>
          <div className="ff-row__buttons">
            <button
              className="ff-btn ff-btn--sm"
              type="button"
              disabled={pending}
              onClick={save}
            >
              Save
            </button>
            <button
              className="ff-btn ff-btn--outline ff-btn--sm"
              type="button"
              disabled={pending}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </>
      ) : null}
    </BubbleRow>
  );
}
