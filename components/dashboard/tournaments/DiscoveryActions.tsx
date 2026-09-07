"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  inferFacts,
  profilePath,
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
      <label>
        Audience
        <select
          value={value.audience}
          onChange={(e) =>
            onChange({
              ...value,
              audience: e.target.value as DiscoveryFacts["audience"],
            })
          }
        >
          {["unknown", "collegiate", "open"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label>
        Venue
        <select
          value={value.venue}
          onChange={(e) =>
            onChange({
              ...value,
              venue: e.target.value as DiscoveryFacts["venue"],
            })
          }
        >
          {["unknown", "online", "in-person", "hybrid"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label>
        Competition
        <select
          value={value.competition}
          onChange={(e) =>
            onChange({
              ...value,
              competition: e.target.value as DiscoveryFacts["competition"],
            })
          }
        >
          {["unknown", "league", "tournament"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      {(["organization", "series"] as const).map((kind) => (
        <label key={kind}>
          {kind === "organization" ? "Organization" : "Series"}
          <select
            value={
              value[kind === "organization" ? "organizationId" : "seriesId"] ??
              ""
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
      {editorial && (
        <label>
          <input
            type="checkbox"
            checked={value.featured}
            onChange={(e) => onChange({ ...value, featured: e.target.checked })}
          />{" "}
          Editorially featured
        </label>
      )}
    </div>
  );
}
export function DiscoveryCardContext({
  tournament: t,
}: {
  tournament: TournamentListEntry;
}) {
  const d = t.discovery;
  return (
    <div className="ff-discovery-context">
      {d?.audience === "collegiate" && (
        <span title={d.reasons.join(". ")}>
          Collegiate{d.reviewed ? "" : " · suggested"}
        </span>
      )}
      {d?.venue && d.venue !== "unknown" && <span>{d.venue}</span>}
      {d?.competition === "league" && <span>League</span>}
      {d?.organizationId && (
        <Link href={profilePath(d.organizationId)}>
          {d.organizationName ?? "Organization"}
        </Link>
      )}
      {d?.seriesId && (
        <Link href={profilePath(d.seriesId)}>{d.seriesName ?? "Series"}</Link>
      )}
      <CorrectionForm tournament={t} />
    </div>
  );
}
function CorrectionForm({
  tournament: t,
}: {
  tournament: TournamentListEntry;
}) {
  const [open, setOpen] = useState(false),
    [profiles, setProfiles] = useState<DiscoveryProfile[]>([]);
  const [facts, setFacts] = useState<DiscoveryFacts>(
    t.discovery ?? inferFacts(t),
  );
  const [evidence, setEvidence] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReady(false);
    fetch("/api/tournaments/discovery/")
      .then(async (r) => {
        if (!r.ok) throw Error("Unable to load profiles");
        return r.json() as Promise<{ profiles: DiscoveryProfile[] }>;
      })
      .then((d) => {
        if (!cancelled) {
          setProfiles(d.profiles);
          setReady(true);
        }
      })
      .catch((e) => {
        if (!cancelled) setMessage(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="ff-discovery-correction"
    >
      <summary>Suggest a correction</summary>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await discoveryRequest({
                action: "correction",
                targetId: t.id,
                data: facts,
                evidence,
              });
              setMessage(
                "Submitted for review. Your suggestion will not change the source tournament.",
              );
            } catch (err) {
              setMessage((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>{t.name}</p>
          {!!t.discovery?.reasons.length && (
            <p>Classification evidence: {t.discovery.reasons.join(". ")}.</p>
          )}
          {ready ? (
            <FactsEditor
              value={facts}
              onChange={setFacts}
              profiles={profiles}
            />
          ) : (
            <p>Loading organization and series choices…</p>
          )}
          <label>
            Evidence or missing organization/series
            <textarea
              required
              minLength={10}
              maxLength={4000}
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="Explain what should change and include a supporting source link."
            />
          </label>
          <button disabled={busy || !ready} type="submit">
            Submit correction
          </button>
          <p role="status">{message}</p>
        </form>
      )}
    </details>
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
        className="ff-ticket-view"
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
            <button disabled={busy}>Submit claim</button>
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
            <button disabled={busy}>Save profile</button>
          </form>
        </details>
      )}
      <p role="status">{message}</p>
    </div>
  );
}
