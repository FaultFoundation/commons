// Bootstrap the first staff member — the one manual step that breaks the
// chicken-and-egg of "you must be staff to grant staff." After this, owners
// grant and revoke everyone else from the admin dashboard.
//
//   node scripts/seed-staff-owner.mjs --email you@example.com
//   node scripts/seed-staff-owner.mjs --discord 123456789012345678 --role owner
//   node scripts/seed-staff-owner.mjs --email you@example.com --remote
//
// Resolves the target account in D1 and inserts a site-wide staff_roles row
// (granted_via = "manual", so the Discord sync never removes it). Idempotent:
// re-running does nothing if the grant already exists. Defaults to --local;
// pass --remote to seed the deployed database.
//
// Note: an admin must have two-factor enabled to actually unlock privileged
// actions (see lib/admin-unlock.ts). Seeding does not enroll 2FA — the seeded
// owner enrolls it from the Account tab before their first unlock.

import { execFileSync } from "node:child_process";
import process from "node:process";

const STAFF_ROLES = ["owner", "admin", "moderator", "tournament_admin"];

function parseArgs(argv) {
  const args = { role: "owner", remote: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--email") args.email = argv[++i];
    else if (arg === "--discord") args.discord = argv[++i];
    else if (arg === "--role") args.role = argv[++i];
    else if (arg === "--remote") args.remote = true;
    else if (arg === "--local") args.remote = false;
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
      "  node scripts/seed-staff-owner.mjs --email <email> [--role <role>] [--remote]\n" +
      "  node scripts/seed-staff-owner.mjs --discord <discordId> [--role <role>] [--remote]\n\n" +
      `  --role   one of: ${STAFF_ROLES.join(", ")} (default: owner)\n` +
      "  --remote target the deployed D1 (default: --local)\n",
  );
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));

if (!args.email && !args.discord) usage("provide --email or --discord.");
if (args.email && args.discord) usage("provide only one of --email / --discord.");
if (!STAFF_ROLES.includes(args.role)) usage(`invalid --role "${args.role}".`);

// SQLite string literal: single quotes are doubled. Both inputs are opaque
// identifiers, so this is the whole of the escaping needed.
const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
const role = quote(args.role);

// INSERT ... SELECT resolves the user id in one statement and the NOT EXISTS
// guard makes it idempotent. granted_by is the user themselves (a real FK
// target); granted_via = 'manual' keeps it out of the Discord reconcile.
const selectFrom = args.email
  ? `FROM user u WHERE u.email = ${quote(args.email)}`
  : `FROM user u
     JOIN account a ON a.user_id = u.id
       AND a.provider_id = 'discord'
       AND a.account_id = ${quote(args.discord)}`;

const sql = `
INSERT INTO staff_roles (id, user_id, role, program_id, granted_by, granted_via, granted_at)
SELECT lower(hex(randomblob(16))), u.id, ${role}, NULL, u.id, 'manual', (unixepoch() * 1000)
${selectFrom}
  AND NOT EXISTS (
    SELECT 1 FROM staff_roles s
    WHERE s.user_id = u.id AND s.role = ${role} AND s.program_id IS NULL
  );
`.trim();

const target = args.remote ? "--remote" : "--local";
console.log(
  `Granting "${args.role}" to ${args.email ?? `discord:${args.discord}`} on ${
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
  // wrangler already printed the failure.
  process.exit(1);
}

console.log(
  "\nDone. If 'rows written: 0', the grant already existed or the account " +
    "wasn't found — check the email/discord id and that the user has signed in " +
    "at least once.",
);
