// Registers this app's Linked Roles metadata schema with Discord.
//
//   DISCORD_CLIENT_ID=... DISCORD_BOT_TOKEN=... npm run discord:role-metadata
//
// Run once per Discord application, and again whenever the records below
// change. This declares the *shape* — which keys exist and how a server may
// compare them. Per-member values are pushed separately at runtime by
// pushRoleConnection() in lib/platform-identities.ts.
//
// The bot token is only ever used here. It is deliberately NOT a Worker secret:
// nothing at request time needs it.
//
// Afterwards, in the Discord app settings, set the Linked Roles Verification
// URL (e.g. https://commons.fault.foundation/account/) — without it the
// connection never appears under Server Settings -> Roles -> Links.

const applicationId = process.env.DISCORD_CLIENT_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;

if (!applicationId || !botToken) {
  console.error(
    "Missing env. Usage:\n" +
      "  DISCORD_CLIENT_ID=<app id> DISCORD_BOT_TOKEN=<bot token> \\\n" +
      "    node scripts/register-role-metadata.mjs",
  );
  process.exit(1);
}

// Discord allows a maximum of 5 records; keys are [a-z0-9_], 1-50 chars.
// This uses 3, leaving 2 spare.
//
// The member types share ONE integer key instead of a boolean each, because
// four booleans plus graduation_date would sit exactly on the cap with no room
// to ever add anything — and because Discord ANDs a role's requirements, so
// separate booleans make an "any verified member" role impossible to express.
//
//   type 7 = BOOLEAN_EQUAL
//   type 3 = INTEGER_EQUAL
//   type 6 = DATETIME_GREATER_THAN_OR_EQUAL
//
// The member_type numbers are a public contract — admins type them into role
// requirements by hand. Keep them in sync with MEMBER_TYPE_IDS in
// lib/registration-shared.ts (the source of truth; this file is a standalone
// .mjs and can't import it). Only ever append; never renumber.
const records = [
  {
    key: "verified_member",
    name: "Verified Member",
    description: "Completed verification with the Commons, any member type",
    type: 7,
  },
  {
    key: "member_type",
    name: "Member Type",
    description:
      "1 = University student, 2 = University alumnus, 3 = High school student, 4 = Guest",
    type: 3,
  },
  {
    key: "graduation_date",
    name: "Graduates After",
    description: "Expected graduation date",
    type: 6,
  },
];

const res = await fetch(
  `https://discord.com/api/v10/applications/${applicationId}/role-connections/metadata`,
  {
    method: "PUT",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(records),
  },
);

const body = await res.text();
if (!res.ok) {
  console.error(`Registration failed: ${res.status} ${res.statusText}\n${body}`);
  process.exit(1);
}

console.log(`Registered ${records.length} role-connection metadata records:`);
for (const record of records) console.log(`  ${record.key} (type ${record.type})`);
