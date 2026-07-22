"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { updateTeamSettings } from "@/app/teams/actions";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";

/** The viewer's own IANA zone, or "" where the runtime won't say. */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

/** Every zone the browser knows. Older engines lack the API — the row falls
    back to a plain text field there, validated server-side either way. */
function supportedTimezones(): string[] {
  const supported = (
    Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf;
  try {
    return supported ? supported("timeZone") : [];
  } catch {
    return [];
  }
}

/**
 * Timezone as a dropdown rather than a text field — it's set for the team at
 * creation from the creator's browser, and only ever changed when that guess
 * was wrong, so the job here is to make the right value easy to find.
 */
export function TimezoneRow({
  teamId,
  timezone,
  editable,
}: {
  teamId: string;
  timezone: string | null;
  editable: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(timezone ?? browserTimezone());

  const zones = useMemo(supportedTimezones, []);
  const mine = browserTimezone();
  // The device's own zone floats to the top; the stored one is kept in the
  // list even if this browser doesn't know it, so saving can't silently
  // change it to something else.
  const options = useMemo(() => {
    const rest = zones.filter((zone) => zone !== mine && zone !== timezone);
    return [mine, timezone, ...rest].filter(
      (zone, index, all): zone is string =>
        Boolean(zone) && all.indexOf(zone) === index,
    );
  }, [zones, mine, timezone]);

  async function save() {
    setError(null);
    setPending(true);
    const result = await updateTeamSettings(teamId, { timezone: value });
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
      label="Timezone"
      value={timezone ?? "—"}
      note={timezone ? undefined : "Used to line up scrims and matches."}
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
            <span className="ff-auth__label">Timezone</span>
            {options.length > 1 ? (
              <select
                className="ff-auth__input"
                value={value}
                onChange={(event) => setValue(event.target.value)}
              >
                {options.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone === mine ? `${zone} (this device)` : zone}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="ff-auth__input"
                type="text"
                value={value}
                maxLength={60}
                placeholder="America/Los_Angeles"
                onChange={(event) => setValue(event.target.value)}
              />
            )}
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
