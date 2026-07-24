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
