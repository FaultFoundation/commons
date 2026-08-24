// Seed a member's personal calendar with dummy external_matches rows, so you can
// verify /schedule renders correctly WITHOUT any connected account, live API, or
// real tournament enrollment. The external_matches table is the normalized shape
// every provider adapter writes into (lib/schedule.ts), so these rows exercise
// the exact same render path a real sync produces.
//
//   node scripts/seed-schedule.mjs --email you@example.com
//   node scripts/seed-schedule.mjs --email you@example.com --remote
//   node scripts/seed-schedule.mjs --email you@example.com --clear
//
// Idempotent: re-running inserts nothing new (rows are keyed by a 'seed-*'
// external_id). --clear removes only the seeded rows for that user, never real
// synced ones. Defaults to --local; --remote targets the deployed D1.
//
// After seeding, sign in as that member and open /schedule — the dummy matches
// appear under Upcoming (scheduled/live) and Results (finished). Nothing here
// touches the provider APIs; it only proves the site displays the data.

import { execFileSync } from "node:child_process";
import process from "node:process";

function parseArgs(argv) {
  const args = { remote: false, clear: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--email") args.email = argv[++i];
    else if (arg === "--remote") args.remote = true;
    else if (arg === "--local") args.remote = false;
    else if (arg === "--clear") args.clear = true;
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error(
    "Usage:\n" +
      "  node scripts/seed-schedule.mjs --email <email> [--remote]\n" +
      "  node scripts/seed-schedule.mjs --email <email> --clear   (remove seeded rows)\n\n" +
      "  --remote  target the deployed D1 (default: --local)\n",
  );
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
if (!args.email) usage("provide --email.");

// SQLite string literal: single quotes are doubled. The email is the only input.
const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
const email = quote(args.email);

// A spread of providers, statuses, opponents/rounds, and dated/undated rows so
// the calendar's grouping, Upcoming/Results split, provider chips, "vs opponent"
// line, and "Open" links are all exercised. scheduled_at is an offset from now
// in days; timestamps are epoch-ms integers (schema mode: timestamp_ms).
const SAMPLES = [
  ["startgg", "seed-1", "Overwatch Collegiate Open #12", null, null, "scheduled", 3, "https://www.start.gg/tournament/overwatch-collegiate-open-12"],
  ["startgg", "seed-2", "Spring Valorant Invitational", null, "Group Stage", "scheduled", 7, "https://www.start.gg/tournament/spring-valorant-invitational"],
  ["challonge", "seed-3", "Fault Foundation Invitational", "Crimson Esports", "Semifinal", "live", 0, "https://challonge.com/ff_invitational"],
  ["faceit", "seed-4", "FACEIT League Season 5", "Team Nova", null, "finished", -2, "https://www.faceit.com/en/cs2/room/1-seed-abc"],
  ["faceit", "seed-5", "FACEIT League Season 5", "Iron Wolves", null, "finished", -9, "https://www.faceit.com/en/cs2/room/1-seed-def"],
  ["startgg", "seed-6", "Winter Rocket League Clash", "Sky High", "Quarterfinal", "finished", -21, "https://www.start.gg/tournament/winter-rl-clash"],
];

let sql;
if (args.clear) {
  sql = `
DELETE FROM external_matches
WHERE external_id LIKE 'seed-%'
  AND user_id = (SELECT id FROM user WHERE email = ${email});
`.trim();
} else {
  // One INSERT ... SELECT per sample row (D1 caps compound-SELECT terms very
  // low, so a UNION ALL / VALUES derived table trips it). Each resolves the user
  // id inline; the NOT EXISTS guard makes it idempotent against the
  // (user_id, provider, external_id) unique index.
  sql = SAMPLES.map(
    ([provider, extId, title, opponent, round, status, dayOffset, url]) => {
      const opp = opponent == null ? "NULL" : quote(opponent);
      const rnd = round == null ? "NULL" : quote(round);
      return `
INSERT INTO external_matches
  (id, user_id, tournament_id, provider, external_id, title, opponent_name, round, status, scheduled_at, url, created_at, updated_at)
SELECT lower(hex(randomblob(16))), u.id, NULL, ${quote(provider)}, ${quote(extId)}, ${quote(title)},
       ${opp}, ${rnd}, ${quote(status)}, ((unixepoch() + ${dayOffset} * 86400) * 1000), ${quote(url)},
       (unixepoch() * 1000), (unixepoch() * 1000)
FROM user u
WHERE u.email = ${email}
  AND NOT EXISTS (
    SELECT 1 FROM external_matches em
    WHERE em.user_id = u.id AND em.provider = ${quote(provider)} AND em.external_id = ${quote(extId)}
  );`.trim();
    },
  ).join("\n");
}

const target = args.remote ? "--remote" : "--local";
console.log(
  `${args.clear ? "Clearing" : "Seeding"} dummy schedule for ${args.email} on ${
    args.remote ? "remote" : "local"
  } D1...`,
);

try {
  execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "website-sql", target, "--command", sql],
    { stdio: "inherit" },
  );
} catch {
  process.exit(1);
}

console.log(
  args.clear
    ? "\nDone. Seeded rows removed."
    : "\nDone. If 'rows written: 0', they already existed or the email wasn't " +
        "found (the member must have signed in at least once). Sign in as that " +
        "member and open /schedule.",
);
