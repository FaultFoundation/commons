import { randomUUID } from "node:crypto";
import { and, eq, desc, sql } from "drizzle-orm";
import { reviewDiscovery, undoDiscovery } from "@/lib/discovery-review";
import { getDb } from "@/lib/db";
import { getSessionCached } from "@/lib/session";
import { requireStaffApi } from "@/lib/admin-api";
import {
  discoveryFollows,
  discoveryProfiles,
  discoverySubmissions,
} from "@/db/schema";
import {
  discoveryCatalog,
  discoveryFollowIds,
  loadDiscoveryOverlay,
} from "@/lib/discovery";
import { loadTournamentEntries } from "@/lib/tournament-entries";
import { safeWebsite, validFacts } from "@/lib/discovery-shared";
export const dynamic = "force-dynamic";
const fail = (error: string, status = 400) =>
  Response.json({ error }, { status });
export async function GET(request: Request) {
  const session = await getSessionCached();
  if (!session) return fail("Sign in to continue", 401);
  if (new URL(request.url).searchParams.has("review")) {
    const gate = await requireStaffApi("manageTournaments");
    if (!gate.ok) return gate.response;
    const rows = await getDb()
      .select()
      .from(discoverySubmissions)
      .orderBy(
        desc(sql`${discoverySubmissions.status} = 'pending'`),
        desc(discoverySubmissions.createdAt),
      )
      .limit(200);
    return Response.json(
      { submissions: rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const tournaments = await loadTournamentEntries();
  return Response.json(
    {
      profiles: await discoveryCatalog(tournaments),
      follows: await discoveryFollowIds(session.user.id),
      available: (await loadDiscoveryOverlay()).available,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return fail("Invalid origin", 403);
  const session = await getSessionCached();
  if (!session) return fail("Sign in to continue", 401);
  const raw = await request.text();
  if (raw.length > 16000) return fail("Request too large", 413);
  let b;
  try {
    b = JSON.parse(raw);
  } catch {
    return fail("Invalid request");
  }
  if (!b || typeof b !== "object") return fail("Invalid request");
  const db = getDb();
  const actor = session.user.id;
  const now = Date.now();
  try {
    const entries = await loadTournamentEntries();
    const profiles = await discoveryCatalog(entries);
    const profile = profiles.find((p) => p.id === b.targetId);
    if (b.action === "follow") {
      if (!profile || typeof b.follow !== "boolean")
        return fail("Profile not found", 404);
      if (b.follow)
        await db.batch([
          db
            .insert(discoveryProfiles)
            .values({
              ...profile,
              website: safeWebsite(profile.website),
              updatedAt: now,
            })
            .onConflictDoNothing(),
          db
            .insert(discoveryFollows)
            .values({
              id: randomUUID(),
              userId: actor,
              targetId: profile.id,
              createdAt: now,
            })
            .onConflictDoNothing(),
        ]);
      else
        await db
          .delete(discoveryFollows)
          .where(
            and(
              eq(discoveryFollows.userId, actor),
              eq(discoveryFollows.targetId, profile.id),
            ),
          );
      return Response.json({ ok: true });
    }
    if (b.action === "correction" || b.action === "claim") {
      if (
        typeof b.evidence !== "string" ||
        b.evidence.trim().length < 10 ||
        b.evidence.length > 4000
      )
        return fail(
          "Please explain the correction or provide ownership evidence (10–4000 characters).",
        );
      if (
        b.action === "claim" &&
        (!profile || profile.kind !== "organization" || profile.ownerId)
      )
        return fail("This organization cannot be claimed.");
      const target = entries.find((t) => t.id === b.targetId);
      if (b.action === "correction" && (!target || !validFacts(b.data)))
        return fail("Invalid tournament correction");
      if (
        b.action === "correction" &&
        [b.data.organizationId, b.data.seriesId].some(
          (id: string | null, i: number) =>
            id &&
            !profiles.some(
              (p) =>
                p.id === id && p.kind === (i === 0 ? "organization" : "series"),
            ),
        )
      )
        return fail(
          "Choose an existing organization or series; describe a missing one in the evidence.",
        );
      // Members cannot assign featured placement; that remains staff editorial policy.
      const data =
        b.action === "claim"
          ? profile
          : {
              ...b.data,
              featured: target!.discovery?.featured ?? target!.featured,
            };
      const pending = await db
        .select({ id: discoverySubmissions.id })
        .from(discoverySubmissions)
        .where(
          and(
            eq(discoverySubmissions.userId, actor),
            eq(discoverySubmissions.status, "pending"),
          ),
        )
        .limit(20);
      if (pending.length >= 20)
        return fail(
          "You have 20 pending submissions. Please wait for review.",
          429,
        );
      await db
        .insert(discoverySubmissions)
        .values({
          id: randomUUID(),
          userId: actor,
          kind: b.action,
          targetId: b.targetId,
          data: JSON.stringify(data),
          evidence: b.evidence.trim(),
          createdAt: now,
        });
      return Response.json({ ok: true });
    }
    if (b.action === "edit-profile") {
      if (!profile || profile.ownerId !== actor)
        return fail(
          "Only the verified profile owner can edit this profile.",
          403,
        );
      if (
        typeof b.name !== "string" ||
        !b.name.trim() ||
        b.name.length > 160 ||
        typeof b.description !== "string" ||
        b.description.length > 4000 ||
        (b.website && !safeWebsite(b.website))
      )
        return fail("Invalid profile details");
      await db
        .update(discoveryProfiles)
        .set({
          name: b.name.trim(),
          description: b.description,
          website: safeWebsite(b.website),
          updatedAt: now,
        })
        .where(
          and(
            eq(discoveryProfiles.id, profile.id),
            eq(discoveryProfiles.ownerId, actor),
          ),
        );
      return Response.json({ ok: true });
    }
    const gate = await requireStaffApi("manageTournaments");
    if (!gate.ok) return gate.response;
    if (b.action === "create-profile") {
      if (
        !["organization", "series"].includes(b.kind) ||
        typeof b.name !== "string" ||
        !b.name.trim() ||
        b.name.length > 160
      )
        return fail("Invalid profile");
      const id = `${b.kind}:${randomUUID()}`;
      await db
        .insert(discoveryProfiles)
        .values({
          id,
          kind: b.kind,
          name: b.name.trim(),
          description: "",
          updatedAt: now,
        });
      return Response.json({ ok: true, id });
    }
    if (b.action === "undo" || b.action === "review") {
      if (typeof b.id !== "string") return fail("Invalid submission");
      const row = (
        await db
          .select()
          .from(discoverySubmissions)
          .where(eq(discoverySubmissions.id, b.id))
          .limit(1)
      )[0];
      if (!row) return fail("Submission not found", 404);
      let changed: boolean;
      try {
        if (b.action === "undo") changed = await undoDiscovery(row, actor);
        else {
          if (!["approve", "reject"].includes(b.decision))
            return fail("Invalid review");
          changed = await reviewDiscovery({
            row,
            decision: b.decision,
            data: b.data ?? JSON.parse(row.data),
            applyIdentity: b.applyIdentity === true,
            actor,
            entries,
            profiles,
          });
        }
      } catch (error) {
        return fail((error as Error).message);
      }
      return changed
        ? Response.json({ ok: true })
        : fail(
            "The submission or its target changed. Reload the queue; undo newer approvals first.",
            409,
          );
    }
    return fail("Unknown action");
  } catch (error) {
    console.error("Discovery mutation failed", error);
    return fail(
      "Discovery storage is unavailable. Please try again after the database migration is applied.",
      503,
    );
  }
}
