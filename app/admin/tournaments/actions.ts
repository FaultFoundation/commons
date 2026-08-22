"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { tournamentBrackets, tournaments, tournamentParticipants } from "@/db/schema";
import { requireAdminUnlock } from "@/lib/admin-unlock";
import { deleteAvatarByUrl, putAvatar } from "@/lib/avatars";
import { getAuth } from "@/lib/auth";
import {
  changeChallongeState,
  challongeConfigured,
  createChallongeTournament,
  deleteChallongeTournament,
  reportChallongeMatch,
  setChallongeSeed,
  updateChallongeTournament,
} from "@/lib/challonge";
import { getDb } from "@/lib/db";
import { GAME_OVERWATCH_ID, PROGRAM_COLLEGIATE_ID } from "@/lib/programs";
import { requireStaffCapability } from "@/lib/staff";
import {
  buildSnapshot,
  getParticipantCount,
  getTournament,
  listParticipantsWithTeams,
  reserveTournamentId,
  transitionStatus,
} from "@/lib/tournaments";
import {
  CHALLONGE_TYPE,
  cleanRulesUrl,
  cleanTournamentName,
  clampBestOf,
  clampMaxParticipants,
  clampSwissRounds,
  isTournamentFormat,
  isTournamentStatus,
  tournamentPath,
  type TournamentStatus,
} from "@/lib/tournaments-shared";

// ---------------------------------------------------------------------------
// Staff-facing tournament actions.
//
// Every action opens with requireActor(): session -> manageTournaments staff
// capability re-read from D1 -> fresh 2FA unlock. Same three-layer gate every
// other admin surface uses, re-derived here rather than trusted from the page.
//
// The bracket itself lives on Challonge (lib/challonge.ts); these actions are
// the orchestration — they call Challonge AND update the D1 row, then rebuild
// the cached snapshot so the public bracket reflects the change immediately.
// ---------------------------------------------------------------------------

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

async function requireActor(): Promise<ActionResult<{ userId: string }>> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Your session expired. Sign in again." };
  const userId = session.user.id;

  const staff = await requireStaffCapability(userId, "manageTournaments");
  if (!staff.ok) return { ok: false, error: staff.error };

  const unlock = await requireAdminUnlock(userId);
  if (!unlock.ok) return { ok: false, error: unlock.error };

  return { ok: true, userId };
}

/** Refresh the admin surfaces plus the public ones a change touches. Takes the
    name because the public path derives its cosmetic segment from it. */
function revalidateTournament(tournamentId: string, name?: string) {
  revalidatePath("/admin/tournaments/", "layout");
  revalidatePath(`/admin/tournaments/${tournamentId}/`, "layout");
  revalidatePath("/tournaments/", "layout");
  if (name) revalidatePath(tournamentPath(tournamentId, name), "layout");
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createTournament(input: {
  name: string;
  format: string;
  maxParticipants?: number;
  academicVerificationRequired?: boolean;
}): Promise<ActionResult<{ tournamentId: string }>> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  if (!challongeConfigured()) {
    return {
      ok: false,
      error: "Challonge isn't configured — set CHALLONGE_API_V1_KEY first.",
    };
  }

  const name = cleanTournamentName(input.name);
  if (!name) return { ok: false, error: "Enter a tournament name." };
  if (!isTournamentFormat(input.format)) {
    return { ok: false, error: "Pick a valid tournament format." };
  }
  const maxParticipants = input.maxParticipants
    ? clampMaxParticipants(input.maxParticipants)
    : null;

  // The id is the public identifier too — staff never pick it. It also seeds a
  // stable, unique Challonge url slug so the two systems share one handle.
  const id = await reserveTournamentId();
  if (!id) return { ok: false, error: "Couldn't allocate a tournament ID. Try again." };

  const created = await createChallongeTournament({
    name,
    format: input.format,
    urlSlug: `ff${id}`,
    gameName: "Overwatch",
  });
  if (!created.ok) return created;

  const now = new Date();
  await getDb().insert(tournaments).values({
    id,
    programId: PROGRAM_COLLEGIATE_ID,
    gameId: GAME_OVERWATCH_ID,
    source: "challonge",
    externalId: created.data.id,
    externalUrl: created.data.fullUrl,
    name,
    format: input.format,
    status: "draft",
    maxParticipants,
    academicVerificationRequired: input.academicVerificationRequired ?? true,
    createdAt: now,
    updatedAt: now,
  });

  revalidateTournament(id, name);
  return { ok: true, tournamentId: id };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function updateTournamentSettings(
  tournamentId: string,
  patch: {
    name?: string;
    format?: string;
    maxParticipants?: number;
    bestOf?: number;
    rulesUrl?: string;
    startsAt?: string;
    endsAt?: string;
    registrationOpensAt?: string;
    registrationClosesAt?: string;
    rosterLockAt?: string;
    swissRounds?: number;
    thirdPlaceMatch?: boolean;
    academicVerificationRequired?: boolean;
    description?: string;
  },
): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  const tournament = await getTournament(tournamentId);
  if (!tournament) return { ok: false, error: "Tournament not found." };

  const fields: Record<string, unknown> = {};
  const challongeAttrs: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    const name = cleanTournamentName(patch.name);
    if (!name) return { ok: false, error: "Enter a tournament name." };
    fields.name = name;
    challongeAttrs.name = name;
  }

  if (patch.format !== undefined) {
    if (tournament.bracketGeneratedAt) {
      return {
        ok: false,
        error: "The bracket is already started — reset it to change format.",
      };
    }
    if (!isTournamentFormat(patch.format)) {
      return { ok: false, error: "Pick a valid tournament format." };
    }
    fields.format = patch.format;
    challongeAttrs.tournament_type = CHALLONGE_TYPE[patch.format];
  }

  if (patch.maxParticipants !== undefined) {
    // Our own cap (checkRegistrationOpen enforces it); not pushed to Challonge —
    // we don't use Challonge's signup page, and a partial registration_options
    // object is rejected.
    fields.maxParticipants = clampMaxParticipants(patch.maxParticipants);
  }
  if (patch.bestOf !== undefined) fields.bestOf = clampBestOf(patch.bestOf);
  if (patch.swissRounds !== undefined) {
    const rounds = clampSwissRounds(patch.swissRounds);
    fields.swissRounds = rounds;
    challongeAttrs.swiss_options = { rounds };
  }
  if (patch.thirdPlaceMatch !== undefined) {
    fields.thirdPlaceMatch = patch.thirdPlaceMatch;
    challongeAttrs.hold_third_place_match = patch.thirdPlaceMatch;
  }
  if (patch.academicVerificationRequired !== undefined) {
    // Our own gate (checked at registration); nothing to push to Challonge.
    fields.academicVerificationRequired = patch.academicVerificationRequired;
  }
  if (patch.description !== undefined) {
    const description = patch.description.trim().slice(0, 500);
    fields.description = description || null;
    challongeAttrs.description = description;
  }
  if (patch.rulesUrl !== undefined) {
    if (patch.rulesUrl.trim()) {
      const url = cleanRulesUrl(patch.rulesUrl);
      if (!url) return { ok: false, error: "Enter a full https:// rules link." };
      fields.rulesUrl = url;
    } else {
      fields.rulesUrl = null;
    }
  }

  for (const key of [
    "startsAt",
    "endsAt",
    "registrationOpensAt",
    "registrationClosesAt",
    "rosterLockAt",
  ] as const) {
    if (patch[key] === undefined) continue;
    const raw = patch[key];
    if (!raw || !raw.trim()) {
      fields[key] = null;
      continue;
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, error: `"${raw}" isn't a valid date.` };
    }
    fields[key] = parsed;
    if (key === "startsAt") challongeAttrs.starts_at = parsed.toISOString();
  }

  if (!Object.keys(fields).length) return { ok: true };

  // Push to Challonge first: if it rejects, our row is untouched.
  if (Object.keys(challongeAttrs).length && tournament.externalId) {
    const res = await updateChallongeTournament(tournament.externalId, challongeAttrs);
    if (!res.ok) return res;
  }

  await getDb()
    .update(tournaments)
    .set({ ...fields, version: tournament.version + 1, updatedAt: new Date() })
    .where(eq(tournaments.id, tournamentId));

  const newName = (fields.name as string | undefined) ?? tournament.name;
  revalidateTournament(tournamentId, newName);
  if (newName !== tournament.name) {
    revalidatePath(tournamentPath(tournamentId, tournament.name), "layout");
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** The lifecycle state machine, enumerated once so the UI and action can't
    drift. `active` is deliberately absent — a tournament only becomes active by
    starting its bracket (startTournament), never by a status button. */
function allowedTransitions(from: TournamentStatus): TournamentStatus[] {
  switch (from) {
    case "draft":
      return ["registration", "cancelled"];
    case "registration":
      return ["seeding", "draft", "cancelled"];
    case "seeding":
      return ["registration", "cancelled"];
    case "active":
      return ["completed", "cancelled"];
    case "completed":
      return ["active"];
    case "cancelled":
      return ["draft"];
    default:
      return [];
  }
}

export async function setTournamentStatus(
  tournamentId: string,
  to: string,
): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  if (!isTournamentStatus(to)) {
    return { ok: false, error: "That isn't a valid tournament status." };
  }

  const tournament = await getTournament(tournamentId);
  if (!tournament) return { ok: false, error: "Tournament not found." };

  if (!allowedTransitions(tournament.status).includes(to)) {
    return {
      ok: false,
      error: `A ${tournament.status} tournament can't move to ${to}.`,
    };
  }

  if (to === "seeding") {
    const count = await getParticipantCount(tournamentId);
    if (count < 2) return { ok: false, error: "At least 2 entrants are needed to seed." };
  }

  // Completing finalizes on Challonge; the others are lifecycle-only on our side.
  if (to === "completed" && tournament.externalId) {
    const res = await changeChallongeState(tournament.externalId, "finalize");
    if (!res.ok) return res;
  }

  const result = await transitionStatus(tournamentId, tournament.status, to);
  if (!result.ok) return result;

  await buildSnapshot(tournamentId);
  revalidateTournament(tournamentId, tournament.name);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Seeding — push our seed order to Challonge
// ---------------------------------------------------------------------------

export async function saveSeeds(
  tournamentId: string,
  /** Participant ids (our tournament_participants.id) in seed order. */
  order: string[],
): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  const tournament = await getTournament(tournamentId);
  if (!tournament) return { ok: false, error: "Tournament not found." };
  if (tournament.status !== "seeding") {
    return { ok: false, error: "Seeds can only be set while seeding." };
  }

  const participants = await listParticipantsWithTeams(tournamentId);
  const known = new Set(participants.map((p) => p.id));
  const submitted = new Set(order);
  if (
    order.length !== participants.length ||
    submitted.size !== order.length ||
    order.some((id) => !known.has(id))
  ) {
    return {
      ok: false,
      error: "The seed list doesn't match the current entrants. Refresh.",
    };
  }

  const byId = new Map(participants.map((p) => [p.id, p]));

  // Challonge first (per participant), then mirror the seed into D1.
  if (tournament.externalId) {
    for (let i = 0; i < order.length; i += 1) {
      const p = byId.get(order[i]);
      if (!p?.challongeParticipantId) continue;
      const res = await setChallongeSeed(
        tournament.externalId,
        p.challongeParticipantId,
        i + 1,
      );
      if (!res.ok) return res;
    }
  }

  const db = getDb();
  const now = new Date();
  const statements = [
    db
      .update(tournaments)
      .set({ version: tournament.version + 1, updatedAt: now })
      .where(eq(tournaments.id, tournamentId)),
    ...order.map((participantId, i) =>
      db
        .update(tournamentParticipants)
        .set({ seed: i + 1, updatedAt: now })
        .where(eq(tournamentParticipants.id, participantId)),
    ),
  ];
  await db.batch(
    statements as [(typeof statements)[number], ...(typeof statements)[number][]],
  );

  await buildSnapshot(tournamentId);
  revalidateTournament(tournamentId, tournament.name);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Start / report / reset — the live bracket
// ---------------------------------------------------------------------------

export async function startTournament(tournamentId: string): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  const tournament = await getTournament(tournamentId);
  if (!tournament) return { ok: false, error: "Tournament not found." };
  if (tournament.status !== "seeding") {
    return { ok: false, error: "Move the tournament to seeding first." };
  }
  const count = await getParticipantCount(tournamentId);
  if (count < 2) return { ok: false, error: "At least 2 entrants are needed." };
  if (!tournament.externalId) {
    return { ok: false, error: "This tournament isn't linked to Challonge." };
  }

  const res = await changeChallongeState(tournament.externalId, "start");
  if (!res.ok) return res;

  const moved = await transitionStatus(tournamentId, "seeding", "active", {
    bracketGeneratedAt: new Date(),
  });
  if (!moved.ok) return moved;

  await buildSnapshot(tournamentId);
  revalidateTournament(tournamentId, tournament.name);
  return { ok: true };
}

/**
 * Staff result entry. `scoresCsv` is Challonge's set list, player-1 score first
 * ("3-1,2-3,3-0"); `winnerId` is the winning Challonge participant id (both
 * come from the snapshot the admin bracket renders).
 */
export async function reportResult(
  tournamentId: string,
  input: { matchId: string; scoresCsv: string; winnerId: string },
): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  const tournament = await getTournament(tournamentId);
  if (!tournament) return { ok: false, error: "Tournament not found." };
  if (tournament.status !== "active") {
    return { ok: false, error: "Results can only be entered while the bracket is active." };
  }
  if (!tournament.externalId) {
    return { ok: false, error: "This tournament isn't linked to Challonge." };
  }
  if (!/^\d+(-\d+)?(,\d+-\d+)*$/.test(input.scoresCsv.trim())) {
    return { ok: false, error: "Enter scores like 3-1 or 3-1,2-3,3-0." };
  }

  const res = await reportChallongeMatch(
    tournament.externalId,
    input.matchId,
    input.scoresCsv.trim(),
    input.winnerId,
  );
  if (!res.ok) return res;

  await getDb()
    .update(tournaments)
    .set({ version: tournament.version + 1, updatedAt: new Date() })
    .where(eq(tournaments.id, tournamentId));
  await buildSnapshot(tournamentId);
  revalidateTournament(tournamentId, tournament.name);
  return { ok: true };
}

export async function resetBracket(tournamentId: string): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  const tournament = await getTournament(tournamentId);
  if (!tournament) return { ok: false, error: "Tournament not found." };
  if (tournament.status !== "active" && tournament.status !== "completed") {
    return { ok: false, error: "There's no started bracket to reset." };
  }

  if (tournament.externalId) {
    const res = await changeChallongeState(tournament.externalId, "reset");
    if (!res.ok) return res;
  }

  await getDb()
    .update(tournaments)
    .set({
      status: "seeding",
      bracketGeneratedAt: null,
      version: tournament.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(tournaments.id, tournamentId));

  await buildSnapshot(tournamentId);
  revalidateTournament(tournamentId, tournament.name);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Delete — removes the Challonge tournament too
// ---------------------------------------------------------------------------

export async function deleteTournament(tournamentId: string): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  const tournament = await getTournament(tournamentId);
  if (!tournament) return { ok: false, error: "Tournament not found." };

  // Delete Challonge first so we never orphan our row over a live bracket.
  if (tournament.externalId) {
    const res = await deleteChallongeTournament(tournament.externalId);
    if (!res.ok) return res;
  }

  const db = getDb();
  await db.batch([
    db.delete(tournamentBrackets).where(eq(tournamentBrackets.tournamentId, tournamentId)),
    db.delete(tournamentParticipants).where(eq(tournamentParticipants.tournamentId, tournamentId)),
    db.delete(tournaments).where(eq(tournaments.id, tournamentId)),
  ]);
  await deleteAvatarByUrl(tournament.bannerUrl);

  revalidateTournament(tournamentId, tournament.name);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Hero banner — stored in the AVATARS R2 bucket under the "tournament" scope
// ---------------------------------------------------------------------------

export async function uploadTournamentBanner(
  tournamentId: string,
  form: FormData,
): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  const tournament = await getTournament(tournamentId);
  if (!tournament) return { ok: false, error: "Tournament not found." };

  const file = form.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Choose an image to upload." };
  }

  const stored = await putAvatar(
    "tournament",
    tournamentId,
    await file.arrayBuffer(),
  );
  if (!stored.ok) return stored;

  await getDb()
    .update(tournaments)
    .set({
      bannerUrl: stored.url,
      version: tournament.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(tournaments.id, tournamentId));

  // Content-addressed keys: re-uploading the same image lands on the key we
  // just wrote, so only delete a genuinely different previous banner.
  if (tournament.bannerUrl && tournament.bannerUrl !== stored.url) {
    await deleteAvatarByUrl(tournament.bannerUrl);
  }

  revalidateTournament(tournamentId, tournament.name);
  return { ok: true };
}

export async function removeTournamentBanner(
  tournamentId: string,
): Promise<ActionResult> {
  const gate = await requireActor();
  if (!gate.ok) return gate;

  const tournament = await getTournament(tournamentId);
  if (!tournament) return { ok: false, error: "Tournament not found." };

  await getDb()
    .update(tournaments)
    .set({ bannerUrl: null, version: tournament.version + 1, updatedAt: new Date() })
    .where(eq(tournaments.id, tournamentId));
  await deleteAvatarByUrl(tournament.bannerUrl);

  revalidateTournament(tournamentId, tournament.name);
  return { ok: true };
}
