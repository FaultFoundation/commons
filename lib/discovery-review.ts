import { randomUUID } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  organizerIdentity,
  safeWebsite,
  validFacts,
  type DiscoveryProfile,
} from "@/lib/discovery-shared";
import { discoverySubmissions } from "@/db/schema";
import type { TournamentListEntry } from "@/components/dashboard/tournaments/TournamentList";
type Submission = typeof discoverySubmissions.$inferSelect;
/** All effects, before-images and review state commit in one D1 transaction.
 * A unique transient status reserves the row inside the batch. It is never
 * observable outside the transaction, and makes concurrent approvals/reverts
 * no-ops even when different admins loaded the same pending item. */
export async function reviewDiscovery({
  row,
  decision,
  data,
  applyIdentity,
  actor,
  entries,
  profiles,
}: {
  row: Submission;
  decision: "approve" | "reject";
  data: unknown;
  applyIdentity: boolean;
  actor: string;
  entries: TournamentListEntry[];
  profiles: DiscoveryProfile[];
}) {
  const { env } = getCloudflareContext();
  const now = Date.now();
  const token = `reviewing:${randomUUID()}`;
  const statements: D1PreparedStatement[] = [];
  const guard =
    "EXISTS (SELECT 1 FROM discovery_submissions WHERE id=? AND status=?)";
  const claim = decision === "approve" && row.kind === "claim";
  const profile = claim ? profiles.find((p) => p.id === row.targetId) : null;
  if (claim && (!profile || profile.ownerId))
    throw new Error("Organization already claimed or missing");
  if (decision === "approve" && row.kind === "correction" && !validFacts(data))
    throw new Error("Invalid classification");
  statements.push(
    env.DB.prepare(
      `UPDATE discovery_submissions SET status=? WHERE id=? AND status='pending' ${claim ? "AND NOT EXISTS (SELECT 1 FROM discovery_profiles WHERE id=? AND owner_id IS NOT NULL)" : ""}`,
    ).bind(token, row.id, ...(claim ? [row.targetId] : [])),
  );
  if (decision === "approve" && row.kind === "correction" && validFacts(data)) {
    if (
      [data.organizationId, data.seriesId].some(
        (id, i) =>
          id &&
          !profiles.some(
            (p) =>
              p.id === id && p.kind === (i === 0 ? "organization" : "series"),
          ),
      )
    )
      throw new Error("Unknown organization or series");
    // Preserve inferred profile URLs selected by a correction even if a provider
    // later renames the source. These inserts never change verified ownership.
    for (const p of profiles.filter(
      (p) => p.id === data.organizationId || p.id === data.seriesId,
    )) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO discovery_profiles (id,kind,name,description,website,owner_id,updated_at) SELECT ?,?,?,?,?,NULL,? WHERE ${guard} ON CONFLICT(id) DO NOTHING`,
        ).bind(
          p.id,
          p.kind,
          p.name,
          p.description,
          safeWebsite(p.website),
          now,
          row.id,
          token,
        ),
      );
    }
    statements.push(
      env.DB.prepare(
        `UPDATE discovery_submissions SET previous_data=(SELECT json_object('data',data,'updatedBy',updated_by,'updatedAt',updated_at) FROM discovery_overrides WHERE tournament_id=?) WHERE id=? AND status=?`,
      ).bind(row.targetId, row.id, token),
    );
    if (applyIdentity && data.organizationId) {
      const t = entries.find((t) => t.id === row.targetId);
      const identity = t ? organizerIdentity(t) : null;
      if (!identity)
        throw new Error(
          "No source organizer identity. Approve the individual correction without a future rule.",
        );
      statements.push(
        env.DB.prepare(
          `UPDATE discovery_identities SET valid_to=? WHERE identity=? AND valid_to IS NULL AND ${guard}`,
        ).bind(now, identity, row.id, token),
      );
      statements.push(
        env.DB.prepare(
          `INSERT INTO discovery_identities (id,identity,organization_id,valid_from,valid_to,updated_at) SELECT ?,?,?,?,NULL,? WHERE ${guard}`,
        ).bind(row.id, identity, data.organizationId, now, now, row.id, token),
      );
    }
    statements.push(
      env.DB.prepare(
        `INSERT INTO discovery_overrides (tournament_id,data,updated_by,updated_at) SELECT ?,?,?,MAX(?,COALESCE((SELECT updated_at+1 FROM discovery_overrides WHERE tournament_id=?),?)) WHERE ${guard} ON CONFLICT(tournament_id) DO UPDATE SET data=excluded.data,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
      ).bind(
        row.targetId,
        JSON.stringify(data),
        actor,
        now,
        row.targetId,
        now,
        row.id,
        token,
      ),
    );
  }
  if (claim && profile) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO discovery_profiles (id,kind,name,description,website,owner_id,updated_at) SELECT ?,?,?,?,?,?,? WHERE ${guard} ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id,updated_at=excluded.updated_at WHERE discovery_profiles.owner_id IS NULL`,
      ).bind(
        profile.id,
        profile.kind,
        profile.name,
        profile.description,
        safeWebsite(profile.website),
        row.userId,
        now,
        row.id,
        token,
      ),
    );
  }
  const correction = decision === "approve" && row.kind === "correction";
  statements.push(
    env.DB.prepare(
      `UPDATE discovery_submissions SET status=?,reviewed_by=?,reviewed_at=${correction ? "(SELECT updated_at FROM discovery_overrides WHERE tournament_id=?)" : "?"},data=? WHERE id=? AND status=?`,
    ).bind(
      decision === "approve" ? "approved" : "rejected",
      actor,
      correction ? row.targetId : now,
      correction ? JSON.stringify(data) : row.data,
      row.id,
      token,
    ),
  );
  const results = await env.DB.batch(statements);
  return (results[0].meta.changes ?? 0) > 0;
}
export async function undoDiscovery(row: Submission, actor: string) {
  const { env } = getCloudflareContext();
  const now = Date.now();
  const token = `reverting:${randomUUID()}`;
  const guard =
    "EXISTS (SELECT 1 FROM discovery_submissions WHERE id=? AND status=?)";
  const statements: D1PreparedStatement[] = [];
  const current =
    row.kind === "correction"
      ? "EXISTS (SELECT 1 FROM discovery_overrides WHERE tournament_id=? AND updated_at=?)"
      : "EXISTS (SELECT 1 FROM discovery_profiles WHERE id=? AND owner_id=?)";
  statements.push(
    env.DB.prepare(
      `UPDATE discovery_submissions SET status=? WHERE id=? AND status='approved' AND ${current} AND NOT EXISTS (SELECT 1 FROM discovery_identities WHERE id=? AND valid_to IS NOT NULL)`,
    ).bind(
      token,
      row.id,
      row.targetId,
      row.kind === "correction" ? row.reviewedAt : row.userId,
      row.id,
    ),
  );
  if (row.kind === "correction") {
    const previous = row.previousData
      ? (JSON.parse(row.previousData) as {
          data: string;
          updatedBy: string | null;
          updatedAt: number;
        })
      : null;
    if (previous)
      statements.push(
        env.DB.prepare(
          `UPDATE discovery_overrides SET data=?,updated_by=?,updated_at=? WHERE tournament_id=? AND ${guard}`,
        ).bind(
          previous.data,
          previous.updatedBy,
          previous.updatedAt,
          row.targetId,
          row.id,
          token,
        ),
      );
    else
      statements.push(
        env.DB.prepare(
          `DELETE FROM discovery_overrides WHERE tournament_id=? AND ${guard}`,
        ).bind(row.targetId, row.id, token),
      );
  } else
    statements.push(
      env.DB.prepare(
        `UPDATE discovery_profiles SET owner_id=NULL,updated_at=? WHERE id=? AND owner_id=? AND ${guard}`,
      ).bind(now, row.targetId, row.userId, row.id, token),
    );
  // Reopen the predecessor before removing this rule; the temporal join cannot
  // affect any other source identity or any earlier closed interval.
  statements.push(
    env.DB.prepare(
      `UPDATE discovery_identities SET valid_to=NULL WHERE EXISTS (SELECT 1 FROM discovery_identities AS r WHERE r.id=? AND r.identity=discovery_identities.identity AND r.valid_from=discovery_identities.valid_to) AND ${guard}`,
    ).bind(row.id, row.id, token),
  );
  statements.push(
    env.DB.prepare(
      `DELETE FROM discovery_identities WHERE id=? AND ${guard}`,
    ).bind(row.id, row.id, token),
  );
  statements.push(
    env.DB.prepare(
      "UPDATE discovery_submissions SET status='reverted',reviewed_by=? WHERE id=? AND status=?",
    ).bind(actor, row.id, token),
  );
  const results = await env.DB.batch(statements);
  return (results[0].meta.changes ?? 0) > 0;
}
