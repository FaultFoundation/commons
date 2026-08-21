// Optional bindings that exist only once configured (wrangler secret put /
// .dev.vars), so `wrangler types` doesn't emit them. Merges into the
// generated CloudflareEnv (cloudflare-env.d.ts).
interface CloudflareEnv {
  // Discord OAuth app. CLIENT_ID doubles as the Discord Application ID, which
  // is what the Linked Roles endpoints are keyed on — no separate app-id var.
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  // Snowflake of the Fault Foundation server. Not a secret (it lives in
  // wrangler.jsonc vars); gates the guilds.members.read lookup.
  DISCORD_GUILD_ID?: string;
  // JSON map of Discord role snowflake -> staff tier
  // (owner|admin|moderator|tournament_admin), e.g.
  //   {"123...":"admin","456...":"moderator"}
  // Drives the granted_via="discord" rows in staff_roles (lib/integrations.ts
  // syncStaffRolesFromDiscord). Not a secret — the role IDs aren't sensitive —
  // but bootstrap the very first owner with scripts/seed-staff-owner.mjs.
  DISCORD_STAFF_ROLE_MAP?: string;
  // Battle.net OAuth client (https://develop.battle.net/access/clients).
  // Link-only: Blizzard returns no email, so it can never create a user.
  BATTLENET_CLIENT_ID?: string;
  BATTLENET_CLIENT_SECRET?: string;
  // FACEIT "FACEIT Connect" OAuth client (developers.faceit.com). OpenID
  // Connect; connect-only (attaches to a session, never signs up).
  FACEIT_CLIENT_ID?: string;
  FACEIT_CLIENT_SECRET?: string;
  // FACEIT server-side Data API key (open.faceit.com/data/v4). Separate from
  // the OAuth client above: identity is OAuth, but match history / ELO /
  // upcoming matches come from the API-key Data API (used by the schedule sync).
  FACEIT_API_KEY?: string;
  // start.gg OAuth client (start.gg/admin/profile/developer). OAuth 2.0 over a
  // GraphQL API; connect-only.
  STARTGG_CLIENT_ID?: string;
  STARTGG_CLIENT_SECRET?: string;
  // Challonge OAuth client (connect.challonge.com). OAuth 2.0; connect-only —
  // this is the *member* "Connect Challonge" flow, used only to read a member's
  // Challonge handle so their tournament entry can be linked to their account.
  CHALLONGE_CLIENT_ID?: string;
  CHALLONGE_CLIENT_SECRET?: string;
  // Challonge personal API key (challonge.com/settings/developer, the "create an
  // API v1 key" button) for the org's own account. This is the *tournament
  // backend* credential: lib/challonge.ts sends it as `Authorization-Type: v1`
  // against the current v2.1 API, so every tournament we create lives in the
  // org's Challonge history. Optional so the repo stays open-source-clean and
  // degrades gracefully — with it unset, admin tournament actions return a clear
  // "not configured" error and public bracket pages render empty rather than 500.
  CHALLONGE_API_V1_KEY?: string;
  // Verification-code emails, sent over SMTP (see lib/email.ts). The Google
  // app password for SUPPORT_EMAIL — without it the code is logged to the
  // console instead (dev mode).
  SUPPORT_EMAIL_APP_PASSWORD?: string;
  // The mailbox we authenticate as AND send from. Defaults to
  // support@fault.foundation.
  SUPPORT_EMAIL?: string;
  // Optional display-name form of the From header; defaults to
  // "The Fault Foundation <SUPPORT_EMAIL>".
  EMAIL_FROM?: string;
  // Default to Gmail submission; override to point at another provider.
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  // Shared secret for the Discord bot's calls to the site: the bot HMAC-signs
  // POST bodies (app/api/bot/*) and bears it as a token on the outbox poll GET.
  // The bot only ever calls the site (outbound), so there is no reverse secret.
  BOT_API_SECRET?: string;
}
