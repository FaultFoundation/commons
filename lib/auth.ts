import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";

// Server-side Better Auth instance. Built per-request because the D1 binding
// and secrets only exist on the request's Cloudflare context.
export function getAuth() {
  const { env } = getCloudflareContext();
  const isDev = process.env.NODE_ENV === "development";

  return betterAuth({
    database: drizzleAdapter(getDb(), { provider: "sqlite" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // `next dev` serves on :3000 while BETTER_AUTH_URL points at :3999
    // (the wrangler preview port) — trust both origins in development.
    trustedOrigins: isDev
      ? ["http://localhost:3000", "http://localhost:3999"]
      : undefined,
    emailAndPassword: {
      enabled: true,
      // Flip to true once an email provider (e.g. Resend) is wired up.
      requireEmailVerification: false,
    },
    // Discord sign-in lights up only when the OAuth app is configured
    // (secrets via `wrangler secret put` / .dev.vars) — email/password
    // works without it.
    socialProviders:
      env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET
        ? {
            discord: {
              clientId: env.DISCORD_CLIENT_ID,
              clientSecret: env.DISCORD_CLIENT_SECRET,
            },
          }
        : undefined,
  });
}

// Whether the Discord sign-in button should render (server-side check so the
// client never needs the env).
export function discordAuthEnabled(): boolean {
  const { env } = getCloudflareContext();
  return Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET);
}
