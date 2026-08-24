// Probe the live esports provider APIs with the server-side keys, to confirm
// they're reachable AND that our adapters parse the real response shape — with
// NO site, NO member OAuth, and NO real tournament enrollment. It points the
// same fetches lib/schedule.ts uses at public accounts that already have data.
//
//   node scripts/probe-providers.mjs
//   node scripts/probe-providers.mjs --faceit s1mple --startgg 1000
//
//   --faceit <nickname>   public FACEIT player to read history for (default: shroud)
//   --startgg <userId>    optional start.gg user id to read tournaments for
//   --challonge           also list the org account's Challonge tournaments
//
// Reads keys from .dev.vars (FACEIT_API_KEY, STARTGG_API_KEY, CHALLONGE_API_V1_KEY).
// Each provider prints PASS with a normalized sample, or FAIL with the reason.
// This is the "send it a known input and see the format" check you wanted, at
// the API layer; scripts/seed-schedule.mjs is the same idea at the render layer.

import { readFileSync } from "node:fs";
import process from "node:process";

const TIMEOUT_MS = 8000;

function parseArgs(argv) {
  const args = { faceit: "shroud", challonge: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--faceit") args.faceit = argv[++i];
    else if (arg === "--startgg") args.startgg = argv[++i];
    else if (arg === "--challonge") args.challonge = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

/** Minimal .dev.vars reader: KEY=VALUE lines, ignoring comments/blanks. */
function readDevVars() {
  let text;
  try {
    text = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  } catch {
    return {};
  }
  const env = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const args = parseArgs(process.argv.slice(2));
const env = readDevVars();

function pass(name, detail) {
  console.log(`\n✅ ${name} — PASS`);
  if (detail) console.log(detail);
}
function fail(name, reason) {
  console.log(`\n❌ ${name} — FAIL: ${reason}`);
}
function fmtDate(ms) {
  return ms == null ? "—" : new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}
async function getJson(url, headers) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = await res.text();
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, body };
}

// ---------------------------------------------------------------------------

async function probeFaceit() {
  const key = env.FACEIT_API_KEY;
  if (!key) return fail("FACEIT", "FACEIT_API_KEY not in .dev.vars");
  const auth = { Authorization: `Bearer ${key}` };
  try {
    const player = await getJson(
      `https://open.faceit.com/data/v4/players?nickname=${encodeURIComponent(args.faceit)}`,
      auth,
    );
    if (!player.ok)
      return fail(
        "FACEIT",
        `players?nickname=${args.faceit} -> HTTP ${player.status}. ` +
          `Body: ${(player.body || "").slice(0, 160)}`,
      );
    const playerId = player.json?.player_id;
    const games = Object.keys(player.json?.games ?? {});
    if (!playerId) return fail("FACEIT", "no player_id in response");

    const game = games[0];
    if (!game) return pass("FACEIT", `resolved ${args.faceit} (${playerId}) but no games listed`);

    const hist = await getJson(
      `https://open.faceit.com/data/v4/players/${playerId}/history?game=${encodeURIComponent(game)}&offset=0&limit=3`,
      auth,
    );
    if (!hist.ok) return fail("FACEIT", `history -> HTTP ${hist.status}`);
    const items = hist.json?.items ?? [];
    const rows = items.map((m) => {
      const factions = Object.values(m.teams ?? {});
      const opp = factions.find(
        (f) => !(f.roster ?? []).some((p) => p.player_id === playerId),
      );
      return `   • ${m.competition_name ?? game} — vs ${opp?.nickname ?? "?"} — ${fmtDate(
        m.started_at ? m.started_at * 1000 : null,
      )} — ${m.status ?? "?"}`;
    });
    pass(
      "FACEIT",
      `   ${args.faceit} (${playerId}), game "${game}", ${items.length} recent match(es):\n` +
        (rows.join("\n") || "   (no history)"),
    );
  } catch (e) {
    fail("FACEIT", String(e));
  }
}

async function probeStartgg() {
  const key = env.STARTGG_API_KEY;
  if (!key) return fail("start.gg", "STARTGG_API_KEY not in .dev.vars");
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const gql = (query, variables) =>
    fetch("https://api.start.gg/gql/alpha", {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).then((r) => r.json());
  try {
    // Baseline: currentUser always works with a valid token — proves the API +
    // token before we trust the by-id query the adapter actually uses.
    const me = await gql("query{currentUser{id slug player{gamerTag}}}");
    if (me?.errors) return fail("start.gg", `currentUser errors: ${JSON.stringify(me.errors)}`);
    const meUser = me?.data?.currentUser;
    if (!meUser?.id) return fail("start.gg", "currentUser returned no id (bad token?)");
    let detail = `   token owner: user ${meUser.id} (${meUser.player?.gamerTag ?? meUser.slug ?? "?"})`;

    // The adapter's real query: another user's upcoming tournaments by id.
    const targetId = args.startgg ?? String(meUser.id);
    const byId = await gql(
      "query($id:ID!){user(id:$id){tournaments(query:{perPage:5,filter:{upcoming:true}}){nodes{id name slug startAt}}}}",
      { id: targetId },
    );
    if (byId?.errors) {
      detail += `\n   user(id:${targetId}).tournaments errors: ${JSON.stringify(byId.errors)}`;
      return fail("start.gg", detail);
    }
    const nodes = byId?.data?.user?.tournaments?.nodes ?? [];
    const rows = nodes.map(
      (t) => `   • ${t.name} — ${fmtDate(t.startAt ? t.startAt * 1000 : null)} — ${t.slug}`,
    );
    pass(
      "start.gg",
      `${detail}\n   user(id:${targetId}) upcoming tournaments: ${nodes.length}\n` +
        (rows.join("\n") || "   (none — try a --startgg <userId> that has upcoming events)"),
    );
  } catch (e) {
    fail("start.gg", String(e));
  }
}

async function probeChallonge() {
  const key = env.CHALLONGE_API_V1_KEY;
  if (!key) return fail("Challonge (org key)", "CHALLONGE_API_V1_KEY not in .dev.vars");
  try {
    const res = await getJson("https://api.challonge.com/v2.1/tournaments.json", {
      // Mirror lib/challonge.ts exactly — v2.1 (JSON:API) 415s without the
      // vnd.api+json content type, even on a GET.
      "Content-Type": "application/vnd.api+json",
      Accept: "application/json",
      "Authorization-Type": "v1",
      Authorization: key,
    });
    if (!res.ok) return fail("Challonge (org key)", `tournaments.json -> HTTP ${res.status}`);
    const list = res.json?.data ?? [];
    const rows = list
      .slice(0, 5)
      .map((t) => `   • ${t.attributes?.name ?? t.id} — ${t.attributes?.state ?? "?"}`);
    pass(
      "Challonge (org key)",
      `   ${list.length} tournament(s) on the org account:\n` + (rows.join("\n") || "   (none)"),
    );
    console.log(
      "   note: the /schedule Challonge adapter uses a MEMBER OAuth token, not this\n" +
        "   org key — that path can only be verified by a signed-in member connecting Challonge.",
    );
  } catch (e) {
    fail("Challonge (org key)", String(e));
  }
}

// ---------------------------------------------------------------------------

console.log("Probing provider APIs from .dev.vars keys...");
await probeFaceit();
await probeStartgg();
if (args.challonge) await probeChallonge();
console.log("\nDone.");
