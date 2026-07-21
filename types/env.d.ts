// Optional bindings that exist only once configured (wrangler secret put /
// .dev.vars), so `wrangler types` doesn't emit them. Merges into the
// generated CloudflareEnv (cloudflare-env.d.ts).
interface CloudflareEnv {
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
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
}
