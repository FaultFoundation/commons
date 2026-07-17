// Optional bindings that exist only once configured (wrangler secret put /
// .dev.vars), so `wrangler types` doesn't emit them. Merges into the
// generated CloudflareEnv (cloudflare-env.d.ts).
interface CloudflareEnv {
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  // Registration verification-code emails. Without the key, emails are
  // logged to the console instead of sent (dev mode).
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}
