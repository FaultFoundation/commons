"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  inferFacts,
  type DiscoveryFacts,
  type DiscoveryProfile,
} from "@/lib/discovery-shared";
import type { TournamentListEntry } from "./TournamentList";

export async function discoveryRequest(body: unknown) {
  const r = await fetch("/api/tournaments/discovery/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await r.json()) as {
    error?: string;
    ok?: boolean;
  };
  if (!r.ok) throw new Error(data.error ?? "Unable to save");
  return data;
}

/**
 * A row of pills where exactly one is pressed — the same segmented control the
 * Account → Display density row uses (`.ff-segment`), so the discovery facts read
 * as switches/sliders rather than the old `<select>` dropdowns. The generic value
 * lets the filter menu use `""` for its "Any" option and the correction form use
 * the fact enums directly.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="ff-discovery-field">
      <span className="ff-discovery-field__label">{label}</span>
      <div
        className="ff-segment ff-segment--wrap"
        role="group"
        aria-label={label}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="ff-segment__btn"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The discovery facts editor, as pill switches. Members editing a correction see
 * only Audience / Venue / Type; staff (`editorial`) additionally get the
 * organization/series grouping selects and the editorial "featured" flag, which
 * are theirs to set — a member correction never reassigns grouping or featuring.
 */
export function FactsEditor({
  value,
  onChange,
  profiles,
  editorial = false,
}: {
  value: DiscoveryFacts;
  onChange: (v: DiscoveryFacts) => void;
  profiles: DiscoveryProfile[];
  editorial?: boolean;
}) {
  return (
    <div className="ff-discovery-fields">
      <Segmented
        label="Audience"
        value={value.audience}
        options={[
          { value: "collegiate", label: "Collegiate" },
          { value: "unknown", label: "Not specified" },
          { value: "open", label: "Open" },
        ]}
        onChange={(audience) => onChange({ ...value, audience })}
      />
      <Segmented
        label="Venue"
        value={value.venue}
        options={[
          { value: "in-person", label: "In-person" },
          { value: "online", label: "Online" },
          { value: "hybrid", label: "Hybrid" },
          { value: "unknown", label: "Not specified" },
        ]}
        onChange={(venue) => onChange({ ...value, venue })}
      />
      <Segmented
        label="Type"
        value={value.competition}
        options={[
          { value: "tournament", label: "Tournament" },
          { value: "league", label: "League" },
          { value: "unknown", label: "Not specified" },
        ]}
        onChange={(competition) => onChange({ ...value, competition })}
      />
      {editorial && (
        <>
          {(["organization", "series"] as const).map((kind) => (
            <label key={kind} className="ff-discovery-field">
              <span className="ff-discovery-field__label">
                {kind === "organization" ? "Organization" : "Series"}
              </span>
              <select
                value={
                  value[
                    kind === "organization" ? "organizationId" : "seriesId"
                  ] ?? ""
                }
                onChange={(e) =>
                  onChange({
                    ...value,
                    [kind === "organization" ? "organizationId" : "seriesId"]:
                      e.target.value || null,
                  })
                }
              >
                <option value="">No grouping</option>
                {profiles
                  .filter((p) => p.kind === kind)
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          ))}
          <label className="ff-discovery-field ff-discovery-field--check">
            <input
              type="checkbox"
              checked={value.featured}
              onChange={(e) => onChange({ ...value, featured: e.target.checked })}
            />{" "}
            Editorially featured
          </label>
        </>
      )}
    </div>
  );
}

/**
 * The "suggest a correction" popup — a single shared native `<dialog>` (the 2FA
 * step-up's `ff-dialog` shell), opened from the "?" button on any tournament
 * bubble. `tournament == null` keeps it closed; setting it opens the dialog with
 * that tournament's inferred/reviewed facts. Members edit the pill switches and
 * add context; the submission is queued for staff review and never mutates the
 * source tournament. Grouping (organization/series) and featuring stay staff-only,
 * so we carry the tournament's existing values through untouched.
 */
export function CorrectionDialog({
  tournament,
  onClose,
}: {
  tournament: TournamentListEntry | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [facts, setFacts] = useState<DiscoveryFacts | null>(null);
  const [info, setInfo] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (tournament && !dialog.open) dialog.showModal();
    else if (!tournament && dialog.open) dialog.close();
  }, [tournament]);

  // Reset the form each time a different tournament opens it.
  useEffect(() => {
    if (!tournament) return;
    setFacts(tournament.discovery ?? inferFacts(tournament));
    setInfo("");
    setMessage("");
    setDone(false);
  }, [tournament]);

  return (
    <dialog
      ref={ref}
      className="ff-dialog ff-dialog--correction"
      onClose={onClose}
    >
      {tournament && facts ? (
        done ? (
          <>
            <h2 className="ff-dialog__title">Sent for review</h2>
            <p className="ff-dialog__text">
              Thanks. Your suggestion won&rsquo;t change the source tournament — a
              moderator will take a look.
            </p>
            <div className="ff-dialog__actions">
              <button type="button" className="ff-btn" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              try {
                await discoveryRequest({
                  action: "correction",
                  targetId: tournament.id,
                  data: facts,
                  evidence: info,
                });
                setDone(true);
              } catch (err) {
                setMessage((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2 className="ff-dialog__title">Suggest a correction</h2>
            <p className="ff-dialog__text">{tournament.name}</p>
            <FactsEditor value={facts} onChange={setFacts} profiles={[]} />
            <label className="ff-discovery-field">
              <span className="ff-discovery-field__label">
                Additional information
              </span>
              <textarea
                required
                minLength={10}
                maxLength={4000}
                value={info}
                onChange={(e) => setInfo(e.target.value)}
                placeholder="Explain what should change and add a source link if you can."
              />
            </label>
            {message ? (
              <p className="ff-dialog__error" role="alert">
                {message}
              </p>
            ) : null}
            <div className="ff-dialog__actions">
              <button
                type="button"
                className="ff-btn ff-btn--outline"
                onClick={onClose}
              >
                Cancel
              </button>
              <button type="submit" className="ff-btn" disabled={busy}>
                {busy ? "Sending…" : "Submit"}
              </button>
            </div>
          </form>
        )
      ) : null}
    </dialog>
  );
}

export function ProfileActions({
  profile,
  following,
  canEdit,
}: {
  profile: DiscoveryProfile;
  following: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [follow, setFollow] = useState(following),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [name, setName] = useState(profile.name),
    [description, setDescription] = useState(profile.description),
    [website, setWebsite] = useState(profile.website ?? ""),
    [evidence, setEvidence] = useState("");
  async function run(body: unknown, done?: () => void) {
    setBusy(true);
    setMessage("");
    try {
      await discoveryRequest(body);
      done?.();
      setMessage("Saved.");
      router.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ff-discovery-profile-actions">
      <button
        className="ff-btn ff-btn--sm"
        disabled={busy}
        aria-pressed={follow}
        onClick={() =>
          run({ action: "follow", targetId: profile.id, follow: !follow }, () =>
            setFollow(!follow),
          )
        }
      >
        {follow ? "Following" : "Follow"}
      </button>
      {profile.kind === "organization" && !profile.ownerId && (
        <details>
          <summary>Claim this organization</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run({ action: "claim", targetId: profile.id, evidence }, () =>
                setEvidence(""),
              );
            }}
          >
            <p>
              Provide evidence that you represent this organization. Staff
              review ownership before enabling profile edits.
            </p>
            <label>
              Ownership evidence
              <textarea
                required
                minLength={10}
                maxLength={4000}
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
              />
            </label>
            <button className="ff-btn ff-btn--sm" disabled={busy}>
              Submit claim
            </button>
          </form>
        </details>
      )}
      {canEdit && (
        <details>
          <summary>Edit profile</summary>
          <form
            className="ff-discovery-fields"
            onSubmit={(e) => {
              e.preventDefault();
              run({
                action: "edit-profile",
                targetId: profile.id,
                name,
                description,
                website,
              });
            }}
          >
            <label>
              Name
              <input
                required
                maxLength={160}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Website
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </label>
            <label>
              Description
              <textarea
                maxLength={4000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <button className="ff-btn ff-btn--sm" disabled={busy}>
              Save profile
            </button>
          </form>
        </details>
      )}
      <p role="status">{message}</p>
    </div>
  );
}
