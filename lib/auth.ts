import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { twoFactor } from "better-auth/plugins/two-factor";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { deleteAvatarByUrl } from "@/lib/avatars";
import { getDb } from "@/lib/db";
import { sendEmailVerificationLink, sendTwoFactorCodeEmail } from "@/lib/email";
import {
  fetchBattleTag,
  fetchDiscordUsername,
  hasScope,
  mirrorPlatformIdentity,
  pushRoleConnection,
} from "@/lib/platform-identities";
import { ensureVerificationTicket } from "@/lib/verification-ticket";

// Server-side Better Auth instance. Built per-request because the D1 binding
// and secrets only exist on the request's Cloudflare context.
export function getAuth() {
  const { env } = getCloudflareContext();
  const isDev = process.env.NODE_ENV === "development";

  // Deliberately *not* annotated `BetterAuthPlugin[]`: the widened type erases
  // each plugin's own inference, and with it `session.user.twoFactorEnabled`.
  // Battle.net is spread in rather than pushed for the same reason — a `push`
  // onto an inferred array would need the annotation back.
  const plugins = [
    twoFactor({
      // What authenticator apps display beside the code.
      issuer: "The Fault Foundation",
      otpOptions: {
        period: 5, // minutes
        // A row in D1 must never be a live sign-in code.
        storeOTP: "hashed",
        // Configuring this is what makes email a second factor *at all*:
        // unlike TOTP, which each member sets up themselves, email codes are
        // offered to anyone with 2FA on as soon as a sender exists.
        sendOTP: async ({ user, otp }) => {
          await sendTwoFactorCodeEmail({ to: user.email, code: otp });
        },
      },
      // Defaults kept deliberately: skipVerificationOnEnable stays false so a
      // member can't lock themselves out by enrolling with an app they never
      // tested, allowPasswordless stays false so changing 2FA always re-proves
      // the password, and the account lockout stays on (10 consecutive failed
      // verifications → 15 minutes).
    }),
    // Blizzard has no built-in better-auth provider, so it rides the
    // generic-OAuth plugin. Unset secrets leave the integration dark rather
    // than breaking getAuth().
    ...(env.BATTLENET_CLIENT_ID && env.BATTLENET_CLIENT_SECRET
      ? [
          genericOAuth({
            config: [
              {
                providerId: "battlenet",
                clientId: env.BATTLENET_CLIENT_ID,
                clientSecret: env.BATTLENET_CLIENT_SECRET,
                // Region-neutral hosts, per oauth.battle.net's OIDC discovery
                // document. The old us./eu./kr. hosts are legacy.
                authorizationUrl: "https://oauth.battle.net/authorize",
                tokenUrl: "https://oauth.battle.net/token",
                userInfoUrl: "https://oauth.battle.net/userinfo",
                // BattleTag and account id come back without any extra scope;
                // the game-profile scopes (wow./sc2./d3.) would buy us nothing
                // — Blizzard publishes no Overwatch API at all.
                scopes: ["openid"],
                pkce: true,
                // Required, not optional: Blizzard returns no email address and
                // user.email is NOT NULL, so an implicit sign-up would try to
                // create a user with an empty email. Battle.net may only ever
                // attach to an already-authenticated session.
                disableSignUp: true,
                getUserInfo: async (tokens) => {
                  const profile = await fetchBattleNetProfile(tokens.accessToken);
                  if (!profile) return null;
                  return {
                    id: profile.id,
                    // Must be non-empty or the callback bails with
                    // "name_is_missing". Only validated here — the link path
                    // writes an account row, never the user's name.
                    name: profile.battletag || `Battle.net ${profile.id}`,
                    // Blizzard returns no email, but the generic-OAuth callback
                    // rejects a blank one *before* it branches on link vs
                    // sign-up, so disableSignUp alone wouldn't get us through.
                    // .invalid is reserved by RFC 2606 and can never resolve,
                    // so this is inert: with allowDifferentEmails the link path
                    // never compares it, and disableSignUp means it is never
                    // written to a user row.
                    email: `${profile.id}@battlenet.invalid`,
                    emailVerified: false,
                  };
                },
              },
            ],
          }),
        ]
      : []),
  ];

  return betterAuth({
    database: drizzleAdapter(getDb(), { provider: "sqlite" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // Cloudflare terminates TLS and puts the real client IP in CF-Connecting-IP.
    // Without this, Better Auth can't resolve an IP and rate-limits every client
    // into one shared per-path bucket — weakening brute-force protection on
    // sign-in and 2FA. Trust only this header; our own edge sets it and the
    // client can't forge it.
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },
    // `next dev` serves on :3000 while BETTER_AUTH_URL points at :3999
    // (the wrangler preview port) — trust both origins in development.
    // In production the baseURL origin is always trusted; listing both the
    // workers.dev alias and the eventual custom domain means the DNS cutover
    // is a wrangler.jsonc var change with no code edit. Without this, auth
    // POSTs from the non-baseURL origin are rejected 403 by the origin check.
    trustedOrigins: isDev
      ? ["http://localhost:3000", "http://localhost:3999"]
      : [
          "https://commons.fault.foundation",
          "https://commons.oscarlabit9729.workers.dev",
        ],
    emailAndPassword: {
      enabled: true,
      // Stays false on purpose. Verification exists (below), but *requiring*
      // it to sign in would lock out every member who registered before it
      // shipped. The Account tab nags instead.
      requireEmailVerification: false,
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmailVerificationLink({ to: user.email, url });
      },
      // MUST stay false. Better Auth signs the member in when it's true, which
      // would make the verification link a second factor bypass for anyone who
      // can read their inbox — including the address email 2FA codes go to.
      autoSignInAfterVerification: false,
      expiresIn: 60 * 60,
    },
    user: {
      changeEmail: {
        enabled: true,
        // False, so every change is confirmed from the *new* address before it
        // lands. With a sender wired this is the only sane setting: leaving it
        // true would let a stolen session repoint the address that receives
        // 2FA codes, instantly and unverified.
        updateEmailWithoutVerification: false,
      },
      // Self-serve deletion from the Accounts tab. Better Auth removes
      // the user's sessions and accounts itself; the D1 FKs then cascade the
      // user's satellite rows (profile, memberships, identities, …).
      // moderation_actions.user_id is set NULL instead (its subject_* columns
      // keep the anti-abuse record after deletion).
      deleteUser: {
        enabled: true,
        // R2 has no foreign keys to cascade through, so the profile picture is
        // the one artifact that would outlive the account. Deleting an
        // already-gone object is a no-op, and deleteAvatarByUrl never throws —
        // an orphaned 20 KB blob must not block someone's deletion request.
        beforeDelete: async (user) => {
          await deleteAvatarByUrl(user.image);
        },
      },
    },
    account: {
      accountLinking: {
        trustedProviders: ["discord", "battlenet"],
        // Members' Discord emails rarely match their site email; linking is
        // only reachable with an authenticated session, so the different-
        // email check adds no real protection here.
        allowDifferentEmails: true,
      },
    },
    databaseHooks: {
      account: {
        create: {
          // Fires for explicit linking AND (Discord only) sign-in/up — the one
          // place a provider account row appears. Mirrors never throw.
          //
          // Tokens are read straight off the row, which is only correct while
          // account.encryptOAuthTokens is off. Turning encryption on means
          // routing these reads through auth.api.accountInfo instead, or the
          // fetches silently start returning null.
          after: async (account) => {
            if (account.providerId === "discord") {
              const username = await fetchDiscordUsername(account.accessToken);
              await mirrorPlatformIdentity(
                account.userId,
                "discord",
                account.accountId,
                username,
              );
              // Members who verified before linking Discord would otherwise
              // wait until their next verification for the Linked Role.
              // Accounts linked before role_connections.write was requested
              // skip this rather than take a 403.
              if (hasScope(account.scope, "role_connections.write")) {
                await pushRoleConnection(
                  account.accessToken,
                  env.DISCORD_CLIENT_ID,
                  account.userId,
                );
              }
              // Now that we know their Discord, open a support ticket if their
              // registration is stuck in manual review — self-gates on status.
              await ensureVerificationTicket(
                account.userId,
                "Registration needs manual verification (no matching school email).",
              );
            } else if (account.providerId === "battlenet") {
              const battleTag = await fetchBattleTag(account.accessToken);
              await mirrorPlatformIdentity(
                account.userId,
                "battlenet",
                account.accountId,
                battleTag,
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
              // Appended to better-auth's built-in ["identify", "email"].
              // guilds.members.read is scoped to a single guild — it reveals
              // whether the member joined our server and nothing about their
              // other servers. role_connections.write is write-only.
              // Deliberately NOT requested: `guilds` and `connections`, which
              // would read every server and every linked account.
              scope: ["guilds.members.read", "role_connections.write"],
            },
          }
        : undefined,
    plugins,
  });
}

/**
 * Battle.net's userinfo response. `sub` is the stable account id as a string;
 * `id` is the same value as a number. Access tokens live ~24h and Blizzard
 * issues no refresh token, so this is only reachable right after linking.
 */
async function fetchBattleNetProfile(
  accessToken: string | undefined,
): Promise<{ id: string; battletag: string } | null> {
  if (!accessToken) return null;
  const res = await fetch("https://oauth.battle.net/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const profile = (await res.json()) as {
    sub?: string;
    id?: number;
    battletag?: string;
  };
  const id = profile.sub ?? (profile.id != null ? String(profile.id) : null);
  if (!id) return null;
  return { id, battletag: profile.battletag ?? "" };
}

// Whether the Discord sign-in button should render (server-side check so the
// client never needs the env).
export function discordAuthEnabled(): boolean {
  const { env } = getCloudflareContext();
  return Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET);
}

// Same, for the Blizzard "Connect" button. Unset secrets leave the row
// disabled rather than breaking getAuth().
export function battlenetAuthEnabled(): boolean {
  const { env } = getCloudflareContext();
  return Boolean(env.BATTLENET_CLIENT_ID && env.BATTLENET_CLIENT_SECRET);
}
