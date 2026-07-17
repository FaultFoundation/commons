import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";
import { fetchDiscordUsername, mirrorDiscordIdToProfile } from "@/lib/registration";

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
    // In production the baseURL origin (fault.foundation) is always trusted;
    // the workers.dev URL is the staging alias, without which auth POSTs
    // from it are rejected 403 by the origin check.
    trustedOrigins: isDev
      ? ["http://localhost:3000", "http://localhost:3999"]
      : ["https://website.oscarlabit9729.workers.dev"],
    emailAndPassword: {
      enabled: true,
      // Flip to true once an email provider (e.g. Resend) is wired up.
      requireEmailVerification: false,
    },
    user: {
      changeEmail: {
        enabled: true,
        // No verification sender is wired yet, and better-auth rejects
        // every change without one unless this flag is set. It only
        // applies while user.emailVerified is false, so wiring
        // verification emails later upgrades the flow automatically.
        updateEmailWithoutVerification: true,
      },
      // Self-serve deletion from the Accounts tab. Better Auth removes
      // the user's sessions and accounts itself; the D1 FKs then set
      // profiles.user_id NULL (row kept for staff/anti-abuse history)
      // and cascade school_email_verifications.
      deleteUser: {
        enabled: true,
      },
    },
    account: {
      accountLinking: {
        trustedProviders: ["discord"],
        // Members' Discord emails rarely match their site email; linking is
        // only reachable with an authenticated session, so the different-
        // email check adds no real protection here.
        allowDifferentEmails: true,
      },
    },
    databaseHooks: {
      account: {
        create: {
          // Fires for explicit linkSocial AND Discord sign-in/up — the one
          // place a Discord account row appears. Mirror never throws.
          after: async (account) => {
            if (account.providerId === "discord") {
              const username = await fetchDiscordUsername(account.accessToken);
              await mirrorDiscordIdToProfile(
                account.userId,
                account.accountId,
                username,
              );
            }
          },
        },
      },
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
