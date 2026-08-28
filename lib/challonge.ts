import { getCloudflareContext } from "@opennextjs/cloudflare";

import {
  CHALLONGE_TYPE,
  fromChallongeType,
  type MatchStatus,
  type SnapshotMatch,
  type SnapshotParticipant,
  type TournamentFormat,
} from "@/lib/tournaments-shared";

// ---------------------------------------------------------------------------
// Challonge API v2.1 client (server-only).
//
// Challonge is the tournament backend: it owns bracket generation, seeding,
// match progression, and standings. This module is the *only* place that talks
// to it. We authenticate with the org account's personal API key — on v2.1 the
// key is a credential *type* (`Authorization-Type: v1`), not the deprecated v1
// API, so these are current v2.1 endpoints acting on our own account. Every
// tournament created therefore lives in the org's Challonge history.
//
// v2.1 speaks JSON:API: request bodies are `{ data: { type, attributes } }`
// and responses carry the payload under `data` (an object or array). The
// helpers here wrap/unwrap that envelope so callers deal in plain objects.
//
// Degrade, don't break (the project-wide rule): with no key configured every
// call returns `{ ok: false, error }` rather than throwing, so an admin action
// shows "Challonge isn't configured" and a public page falls back to an empty
// bracket instead of 500ing. See types/env.d.ts for why the key is optional.
// ---------------------------------------------------------------------------

const BASE = "https://api.challonge.com/v2.1";
const TIMEOUT_MS = 12_000;

export type ChallongeResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

/** Whether a server-side API key is present. UI uses this to explain the gap. */
export function challongeConfigured(): boolean {
  const { env } = getCloudflareContext();
  return Boolean(env.CHALLONGE_API_V1_KEY);
}

// ---------------------------------------------------------------------------
// Low-level request
// ---------------------------------------------------------------------------

type JsonApiResource = {
  id?: string | number;
  type?: string;
  attributes?: Record<string, unknown>;
};

type JsonApiBody = {
  data?: JsonApiResource | JsonApiResource[];
  errors?: {
    // Challonge sometimes puts a nested {field: [messages]} object here rather
    // than a plain string, so these are unknown and stringified on render.
    title?: unknown;
    detail?: unknown;
    code?: string | number;
    status?: string | number;
    // JSON:API points at the offending field here — the difference between a
    // useful "name is missing" and a baffling "is missing".
    source?: { pointer?: string; parameter?: string };
  } | Array<{
    title?: unknown;
    detail?: unknown;
    code?: string | number;
    status?: string | number;
    source?: { pointer?: string; parameter?: string };
  }>;
};

async function request(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: { type: string; attributes: Record<string, unknown> },
): Promise<ChallongeResult<JsonApiBody>> {
  const { env } = getCloudflareContext();
  const key = env.CHALLONGE_API_V1_KEY;
  if (!key) {
    return {
      ok: false,
      error: "Challonge isn't configured (no API key). Set CHALLONGE_API_V1_KEY.",
    };
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/vnd.api+json",
        Accept: "application/json",
        // On v2.1 the personal API key is sent as credential-type "v1".
        "Authorization-Type": "v1",
        Authorization: key,
      },
      body: body ? JSON.stringify({ data: body }) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: "Couldn't reach Challonge. Try again." };
  }

  if (res.status === 204) return { ok: true, data: {} };

  let parsed: JsonApiBody = {};
  try {
    // Some DELETEs answer 200 with an empty body.
    const text = await res.text();
    parsed = text ? (JSON.parse(text) as JsonApiBody) : {};
  } catch {
    parsed = {};
  }

  if (!res.ok) {
    // Name the field(s) Challonge is complaining about. Its errors carry the
    // reason ("is missing", "is invalid") in `detail`/`title` and the field in
    // `source.pointer` (".../data/attributes/round_robin_options/ranking"). We
    // keep the whole path after "attributes" (dot-joined) so a nested field
    // reads "round_robin_options.ranking is missing", not a bare "ranking".
    const errs = Array.isArray(parsed.errors)
      ? parsed.errors
      : parsed.errors
        ? [parsed.errors]
        : [];
    const parts = errs.map((e) => {
      let field: string | undefined;
      const ptr = e.source?.pointer;
      if (ptr) {
        const segs = ptr.split("/").filter(Boolean);
        const at = segs.indexOf("attributes");
        field = (at >= 0 ? segs.slice(at + 1) : segs).join(".");
      }
      field = field || e.source?.parameter;
      const raw = e.detail ?? e.title;
      const reason =
        raw == null
          ? "was rejected"
          : typeof raw === "string"
            ? raw
            : JSON.stringify(raw);
      return field ? `${field} ${reason}` : reason;
    });
    const msg = parts.length
      ? parts.join("; ")
      : errs.length
        ? JSON.stringify(errs)
        : `request failed (${res.status})`;
    return { ok: false, error: `Challonge: ${msg}`, status: res.status };
  }

  return { ok: true, data: parsed };
}

function one(body: JsonApiBody): JsonApiResource | null {
  const d = body.data;
  if (!d) return null;
  return Array.isArray(d) ? (d[0] ?? null) : d;
}

function many(body: JsonApiBody): JsonApiResource[] {
  const d = body.data;
  if (!d) return [];
  return Array.isArray(d) ? d : [d];
}

function asString(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}

function asNumber(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Tournaments
// ---------------------------------------------------------------------------

export type CreateTournamentInput = {
  name: string;
  format: TournamentFormat;
  /** Preferred Challonge URL slug; Challonge assigns one if taken/omitted. */
  urlSlug?: string;
  gameName?: string;
  description?: string;
  startsAt?: Date | null;
  holdThirdPlaceMatch?: boolean;
  swissRounds?: number | null;
};

export type ChallongeTournament = {
  id: string;
  name: string | null;
  url: string | null;
  fullUrl: string | null;
  state: string | null;
  format: TournamentFormat;
  description: string | null;
  startsAt: string | null;
  holdThirdPlaceMatch: boolean | null;
};

function readTournament(res: JsonApiResource): ChallongeTournament {
  const a = res.attributes ?? {};
  return {
    id: String(res.id),
    name: asString(a.name),
    url: asString(a.url),
    fullUrl: asString(a.full_challonge_url ?? a.fullChallongeUrl),
    state: asString(a.state),
    format: fromChallongeType(asString(a.tournament_type)),
    description: asString(a.description),
    startsAt: asString(a.starts_at ?? a.startsAt),
    holdThirdPlaceMatch:
      typeof a.hold_third_place_match === "boolean"
        ? a.hold_third_place_match
        : null,
  };
}

const TOURNAMENT_PAGE_SIZE = 100;
const MAX_TOURNAMENT_PAGES = 100;

/** Every tournament in the organization account, following v2.1 pagination. */
export async function listChallongeTournaments(): Promise<
  ChallongeResult<ChallongeTournament[]>
> {
  const tournaments: ChallongeTournament[] = [];
  for (let page = 1; page <= MAX_TOURNAMENT_PAGES; page += 1) {
    const res = await request(
      "GET",
      `/tournaments.json?page=${page}&per_page=${TOURNAMENT_PAGE_SIZE}`,
    );
    if (!res.ok) return res;

    if (!Array.isArray(res.data.data)) {
      return {
        ok: false,
        error: "Challonge returned an invalid tournament listing.",
      };
    }
    const resources = res.data.data;
    tournaments.push(...resources.filter((item) => item.id).map(readTournament));
    if (resources.length < TOURNAMENT_PAGE_SIZE) {
      return { ok: true, data: tournaments };
    }
  }

  return {
    ok: false,
    error: "Challonge returned too many tournament pages to reconcile safely.",
  };
}

export async function createChallongeTournament(
  input: CreateTournamentInput,
): Promise<ChallongeResult<ChallongeTournament>> {
  const attributes: Record<string, unknown> = {
    name: input.name,
    tournament_type: CHALLONGE_TYPE[input.format],
  };
  if (input.urlSlug) attributes.url = input.urlSlug;
  if (input.gameName) attributes.game_name = input.gameName;
  if (input.description) attributes.description = input.description;
  if (input.startsAt) attributes.starts_at = input.startsAt.toISOString();
  if (input.holdThirdPlaceMatch != null) {
    attributes.hold_third_place_match = input.holdThirdPlaceMatch;
  }
  // Challonge requires the format's options object for round robin and swiss.
  // Round robin is stricter than the docs imply: an empty object is rejected
  // with `round_robin_options {"iterations":["is missing"],"ranking":["is
  // missing"]}` — both fields are mandatory. Send Challonge's own defaults:
  // one iteration (each pair plays once) ranked by match wins. `ranking` must be
  // one of Challonge's fixed strings ("match wins", "game wins", "points
  // scored", …); "match wins" is the standard collegiate default.
  if (input.format === "round_robin") {
    attributes.round_robin_options = {
      iterations: 1,
      ranking: "match wins",
    };
  }
  // Swiss accepts an empty options object (rounds derive from the field size);
  // send the round count only when we've set one.
  if (input.format === "swiss") {
    attributes.swiss_options =
      input.swissRounds != null ? { rounds: input.swissRounds } : {};
  }
  // Deliberately no registration_options: we don't use Challonge's own signup
  // page (entrants are added through the API), and sending a partial
  // registration_options object is what Challonge rejects with "is missing".

  const res = await request("POST", "/tournaments.json", {
    type: "tournament",
    attributes,
  });
  if (!res.ok) return res;
  const resource = one(res.data);
  if (!resource?.id) {
    return { ok: false, error: "Challonge didn't return a tournament id." };
  }
  return { ok: true, data: readTournament(resource) };
}

export async function updateChallongeTournament(
  challongeId: string,
  attributes: Record<string, unknown>,
): Promise<ChallongeResult<ChallongeTournament>> {
  const res = await request("PUT", `/tournaments/${challongeId}.json`, {
    type: "tournament",
    attributes,
  });
  if (!res.ok) return res;
  const resource = one(res.data);
  return {
    ok: true,
    data: resource ? readTournament(resource) : {
      id: challongeId,
      name: null,
      url: null,
      fullUrl: null,
      state: null,
      format: "single_elim",
      description: null,
      startsAt: null,
      holdThirdPlaceMatch: null,
    },
  };
}

export async function deleteChallongeTournament(
  challongeId: string,
): Promise<ChallongeResult<null>> {
  const res = await request("DELETE", `/tournaments/${challongeId}.json`);
  return res.ok ? { ok: true, data: null } : res;
}

/** Start / finalize / reset — Challonge's change_state endpoint. */
export async function changeChallongeState(
  challongeId: string,
  state: "start" | "finalize" | "reset",
): Promise<ChallongeResult<null>> {
  const res = await request(
    "PUT",
    `/tournaments/${challongeId}/change_state.json`,
    { type: "TournamentState", attributes: { state } },
  );
  return res.ok ? { ok: true, data: null } : res;
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

export type AddParticipantInput = {
  name: string;
  seed?: number | null;
  /** Links the entry to an existing Challonge account (lands in their history);
      invites them if new. Omit for a plain named entry. */
  username?: string | null;
  /** Our foreign key round-trips here (Challonge's API-only `misc`). */
  misc?: string | null;
};

export async function addChallongeParticipant(
  challongeId: string,
  input: AddParticipantInput,
): Promise<ChallongeResult<{ id: string }>> {
  const attributes: Record<string, unknown> = { name: input.name };
  if (input.seed != null) attributes.seed = input.seed;
  if (input.username) attributes.username = input.username;
  if (input.misc) attributes.misc = input.misc;

  const res = await request(
    "POST",
    `/tournaments/${challongeId}/participants.json`,
    { type: "participant", attributes },
  );
  if (!res.ok) return res;
  const resource = one(res.data);
  if (!resource?.id) {
    return { ok: false, error: "Challonge didn't return a participant id." };
  }
  return { ok: true, data: { id: String(resource.id) } };
}

export async function removeChallongeParticipant(
  challongeId: string,
  participantId: string,
): Promise<ChallongeResult<null>> {
  const res = await request(
    "DELETE",
    `/tournaments/${challongeId}/participants/${participantId}.json`,
  );
  return res.ok ? { ok: true, data: null } : res;
}

export async function setChallongeSeed(
  challongeId: string,
  participantId: string,
  seed: number,
): Promise<ChallongeResult<null>> {
  const res = await request(
    "PUT",
    `/tournaments/${challongeId}/participants/${participantId}.json`,
    { type: "participant", attributes: { seed } },
  );
  return res.ok ? { ok: true, data: null } : res;
}

// ---------------------------------------------------------------------------
// Matches — staff result entry
// ---------------------------------------------------------------------------

/**
 * Report a result. `scoresCsv` is Challonge's set list, player-1 score first
 * (e.g. "3-1,2-3,3-0"); `winnerId` is the winning Challonge participant id.
 *
 * NOTE: v2.1 kept `winner_id` and added a `tie` flag; the scores field carries
 * over from v1 as `scores_csv`. This is the one write path worth double-checking
 * against a live tournament — it is isolated here for exactly that reason.
 */
export async function reportChallongeMatch(
  challongeId: string,
  matchId: string,
  scoresCsv: string,
  winnerId: string,
): Promise<ChallongeResult<null>> {
  const res = await request(
    "PUT",
    `/tournaments/${challongeId}/matches/${matchId}.json`,
    { type: "Match", attributes: { scores_csv: scoresCsv, winner_id: winnerId } },
  );
  return res.ok ? { ok: true, data: null } : res;
}

// ---------------------------------------------------------------------------
// Reading state — participants + matches, normalized to the snapshot shape
// (label enrichment from D1 happens in lib/tournaments.ts, which has the join).
// ---------------------------------------------------------------------------

function normalizeMatchState(raw: string | null): MatchStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "complete":
      return "complete";
    case "open":
      return "open";
    default:
      return "pending";
  }
}

export type ChallongeState = {
  participants: SnapshotParticipant[];
  matches: SnapshotMatch[];
};

export async function fetchChallongeState(
  challongeId: string,
): Promise<ChallongeResult<ChallongeState>> {
  const [pRes, mRes] = await Promise.all([
    request("GET", `/tournaments/${challongeId}/participants.json`),
    request("GET", `/tournaments/${challongeId}/matches.json`),
  ]);
  if (!pRes.ok) return pRes;
  if (!mRes.ok) return mRes;

  const participants: SnapshotParticipant[] = many(pRes.data).map((r) => {
    const a = r.attributes ?? {};
    const states = a.states as { active?: boolean } | undefined;
    return {
      id: String(r.id),
      name: asString(a.name) ?? "Entrant",
      seed: asNumber(a.seed),
      finalRank: asNumber(a.final_rank ?? a.final_ranking),
      active: states?.active ?? true,
    };
  });

  const matches: SnapshotMatch[] = many(mRes.data).map((r) => {
    const a = r.attributes ?? {};
    const round = asNumber(a.round) ?? 0;
    const groupId = asString(a.group_id);
    return {
      id: String(r.id),
      round,
      identifier: asString(a.identifier),
      side: groupId ? "group" : round < 0 ? "L" : "W",
      player1Id: asString(a.player1_id),
      player2Id: asString(a.player2_id),
      winnerId: asString(a.winner_id),
      loserId: asString(a.loser_id),
      scores: asString(a.scores_csv),
      state: normalizeMatchState(asString(a.state)),
      order: asNumber(a.suggested_play_order),
    };
  });

  return { ok: true, data: { participants, matches } };
}
