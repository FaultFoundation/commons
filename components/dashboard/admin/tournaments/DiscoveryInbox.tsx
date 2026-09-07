"use client";
import { useEffect, useState } from "react";
import {
  discoveryRequest,
  FactsEditor,
} from "@/components/dashboard/tournaments/DiscoveryActions";
import {
  type DiscoveryFacts,
  type DiscoveryProfile,
  profilePath,
  validFacts,
} from "@/lib/discovery-shared";
import Link from "next/link";
type Submission = {
  id: string;
  kind: string;
  targetId: string;
  data: string;
  evidence: string;
  status: string;
  userId: string;
  previousData: string | null;
};
export function DiscoveryInbox() {
  const [rows, setRows] = useState<Submission[]>([]),
    [profiles, setProfiles] = useState<DiscoveryProfile[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [name, setName] = useState(""),
    [kind, setKind] = useState("organization");
  async function load() {
    try {
      const [r, c] = await Promise.all([
        fetch("/api/tournaments/discovery/?review=1"),
        fetch("/api/tournaments/discovery/"),
      ]);
      const [data, catalog] = await Promise.all([
        r.json() as Promise<{
          submissions: Submission[];
          error?: string;
        }>,
        c.json() as Promise<{
          profiles: DiscoveryProfile[];
          error?: string;
        }>,
      ]);
      if (!r.ok || !c.ok)
        throw Error(
          data.error ?? catalog.error ?? "Unable to load review queue",
        );
      setRows(data.submissions);
      setProfiles(catalog.profiles);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function submit(body: unknown) {
    setBusy(true);
    try {
      await discoveryRequest(body);
      setMessage("Saved.");
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <p>
        Review classification evidence and verify organization claims. Source
        account links establish grouping, not ownership. Approved corrections
        survive collector refreshes.
      </p>
      <details>
        <summary>Create Organization or Series</summary>
        <form
          className="ff-discovery-fields"
          onSubmit={(e) => {
            e.preventDefault();
            void submit({ action: "create-profile", name, kind });
          }}
        >
          <label>
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="organization">Organization</option>
              <option value="series">Series</option>
            </select>
          </label>
          <label>
            Name
            <input
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button disabled={busy}>Create profile</button>
        </form>
      </details>
      <p role="status">{message}</p>
      {rows.length === 0 && <p>No submissions yet.</p>}
      {rows.map((row) => (
        <ReviewRow
          key={row.id}
          row={row}
          profiles={profiles}
          busy={busy}
          submit={submit}
        />
      ))}
    </div>
  );
}
function ReviewRow({
  row,
  profiles,
  busy,
  submit,
}: {
  row: Submission;
  profiles: DiscoveryProfile[];
  busy: boolean;
  submit: (b: unknown) => Promise<void>;
}) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.data);
  } catch {
    parsed = null;
  }
  const [applyIdentity, setApplyIdentity] = useState(false);
  const [facts, setFacts] = useState<DiscoveryFacts | null>(
    validFacts(parsed) ? parsed : null,
  );
  return (
    <details className="ff-discovery-filters">
      <summary>
        {row.kind === "claim" ? "Organization claim" : "Tournament correction"}{" "}
        · {profiles.find((p) => p.id === row.targetId)?.name ?? row.targetId} ·{" "}
        {row.status}
      </summary>
      <p>Submitted by account {row.userId}</p>
      <p style={{ whiteSpace: "pre-wrap" }}>{row.evidence}</p>
      {row.kind === "claim" && (
        <Link href={profilePath(row.targetId)}>Open organization profile</Link>
      )}
      {facts && (
        <FactsEditor
          value={facts}
          onChange={setFacts}
          profiles={profiles}
          editorial
        />
      )}
      {row.status === "pending" && facts?.organizationId && (
        <label>
          <input
            type="checkbox"
            checked={applyIdentity}
            onChange={(e) => setApplyIdentity(e.target.checked)}
          />{" "}
          Use this source organizer identity for future tournaments (historical
          attribution stays unchanged)
        </label>
      )}
      {row.status === "pending" && (
        <div className="ff-discovery-context">
          <button
            disabled={busy}
            onClick={() =>
              submit({
                action: "review",
                id: row.id,
                decision: "approve",
                applyIdentity,
                ...(facts ? { data: facts } : {}),
              })
            }
          >
            {row.kind === "claim"
              ? "Approve verified ownership"
              : "Approve correction"}
          </button>
          <button
            disabled={busy}
            onClick={() =>
              submit({ action: "review", id: row.id, decision: "reject" })
            }
          >
            Reject
          </button>
        </div>
      )}
      {row.status === "approved" && (
        <button
          disabled={busy}
          onClick={() => submit({ action: "undo", id: row.id })}
        >
          Undo approval
        </button>
      )}
    </details>
  );
}
