import { cache } from "react";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  genericOAuth,
  type GenericOAuthConfig,
} from "better-auth/plugins/generic-oauth";
import { twoFactor } from "better-auth/plugins/two-factor";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { deleteAvatarByUrl } from "@/lib/avatars";
import { getDb } from "@/lib/db";
import { sendEmailVerificationLink, sendTwoFactorCodeEmail } from "@/lib/email";
import {
  fetchBattleTag,
  fetchChallongeProfile,
  fetchDiscordUsername,
  fetchFaceitProfile,
  fetchStartggProfile,
  hasScope,
  mirrorPlatformIdentity,
  pushRoleConnection,
} from "@/lib/platform-identities";
import { ensureVerificationTicket } from "@/lib/verification-ticket";
import { snapshotOnConnect } from "@/lib/ow-stats";

// The tokens object passed to a generic-OAuth getUserInfo. Derived from the
// plugin's own config type so the callbacks below (which live in a separate
// array literal, where contextual typing doesn't reach them) stay typed.
type OAuthTokens = Parameters<NonNullable<GenericOAuthConfig["getUserInfo"]>>[0];

// Server-side Better Auth instance. Built per-request because the D1 binding
// and secrets only exist on the request's Cloudflare context — but memoized for
// the request with React `cache`, so the several callers in one render (a page's
// getSession, DashboardShell's getSessionCached, the integration/schedule token
// reads) share ONE construction instead of rebuilding the whole plugin stack
// (genericOAuth × 5 + twoFactor) each time. Rebuilding it was a measurable slice
// of the Worker's per-request CPU, which matters acutely under the Free plan's
// 10 ms ceiling (see CLAUDE.md "Runtime model"). This is request-scoped, NOT the
// module-level caching the runtime rules forbid — same pattern as getSessionCached.
export const getAuth = cache(function getAuth() {
  const { env } = getCloudflareContext();
  const isDev = process.env.NODE_ENV === "development";

  // Generic-OAuth providers — platforms with no built-in better-auth provider.
  // Each config is added only when its secrets are set; all are connect-only
  // (disableSignUp: true), so they attach to an authenticated session and never
  // create an account. One plugin instance carries every config, built here so
  // the `plugins` literal below stays a literal (see the inference note there).
  const genericConfig: GenericOAuthConfig[] = [
    // Blizzard rides generic-OAuth; unset secrets leave it dark.
    ...(env.BATTLENET_CLIENT_ID && env.BATTLENET_CLIENT_SECRET
      ? [
          {
            providerId: "battlenet",
            clientId: env.BATTLENET_CLIENT_ID,
            clientSecret: env.BATTLENET_CLIENT_SECRET,
            // Region-neutral hosts, per oauth.battle.net's OIDC discovery
            // document. The old us./eu./kr. hosts are legacy.
            authorizationUrl: "https://oauth.battle.net/authorize",
            tokenUrl: "https://oauth.battle.net/token",
            userInfoUrl: "https://oauth.battle.net/userinfo",
            // BattleTag and account id come back without any extra scope; the
            // game-profile scopes (wow./sc2./d3.) would buy us nothing —
            // Blizzard publishes no Overwatch API at all.
            scopes: ["openid"],
            pkce: true,
            // Required, not optional: Blizzard returns no email address and
            // user.email is NOT NULL, so an implicit sign-up would try to
            // create a user with an empty email. Battle.net may only ever
            // attach to an already-authenticated session.
            disableSignUp: true,
            getUserInfo: async (tokens: OAuthTokens) => {
              const profile = await fetchBattleNetProfile(tokens.accessToken);
              if (!profile) return null;
              return {
                id: profile.id,
                // Must be non-empty or the callback bails with
                // "name_is_missing". Only validated here — the link path
                // writes an account row, never the user's name.
                name: profile.battletag || `Battle.net ${profile.id}`,
                // Blizzard returns no email, but the generic-OAuth callback
                // rejects a blank one *before* it branches on link vs sign-up,
                // so disableSignUp alone wouldn't get us through. .invalid is
                // reserved by RFC 2606 and can never resolve, so this is inert:
                // with allowDifferentEmails the link path never compares it,
                // and disableSignUp means it is never written to a user row.
                email: `${profile.id}@battlenet.invalid`,
                emailVerified: false,
              };
            },
          },
        ]
      : []),
    // FACEIT ("FACEIT Connect") — OpenID Connect. Endpoints come from FACEIT's
    // OIDC discovery (authorization_endpoint = https://accounts.faceit.com — the
    // real, DNS-resolving authorize host).
    // ⚠️ DO NOT set authorizationUrl to https://auth.faceit.com/... — that host
    // does NOT resolve (ERR_NAME_NOT_RESOLVED / DNS_PROBE_STARTED). FACEIT's
    // Connect 3.0 PDF documents it, but it's dead. Keep discoveryUrl.
    ...(env.FACEIT_CLIENT_ID && env.FACEIT_CLIENT_SECRET
      ? [
          {
            providerId: "faceit",
            clientId: env.FACEIT_CLIENT_ID,
            clientSecret: env.FACEIT_CLIENT_SECRET,
            discoveryUrl: "https://api.faceit.com/auth/v1/openid_configuration",
            scopes: ["openid", "email", "profile"],
            // MUST be true — FACEIT's authorize endpoint REQUIRES PKCE. Without a
            // code_challenge, api/v1/authorize 400s ("Unauthorized client" /
            // "pkce_required") and the grant silently fails. (FACEIT's discovery
            // omits code_challenge_methods, which misled an earlier pkce:false —
            // but the original app demonstrably worked WITH a code_challenge, so
            // PKCE is supported and required.) Better Auth generates the verifier/
            // challenge and sends code_verifier at the token exchange itself.
            pkce: true,
            // FACEIT's token endpoint only accepts client_secret_basic (per its
            // OIDC discovery: token_endpoint_auth_methods_supported). Better Auth
            // defaults to client_secret_post (creds in the body), which FACEIT
            // rejects — the exchange fails with oauth_code_verification_failed and
            // the link silently doesn't complete. Send the credentials as Basic.
            authentication: "basic" as const,
            disableSignUp: true,
            // FACEIT's token endpoint returns a bare 401 that Better Auth wraps
            // as `oauth_code_verification_failed`, hiding the real reason. Do the
            // exchange ourselves — Basic auth per FACEIT's docs — and log
            // FACEIT's actual response body, so the true error (e.g.
            // invalid_client) is visible in `wrangler tail`. Overriding getToken
            // also removes any ambiguity about how Better Auth authenticates.
            getToken: async ({
              code,
              redirectURI,
              codeVerifier,
            }: {
              code: string;
              redirectURI: string;
              codeVerifier?: string;
            }) => {
              // Trim: `wrangler secret put` easily stores a trailing newline,
              // which corrupts the Basic header and 401s with a valid secret.
              const clientId = (env.FACEIT_CLIENT_ID ?? "").trim();
              const clientSecret = (env.FACEIT_CLIENT_SECRET ?? "").trim();
              const basic = Buffer.from(
                `${clientId}:${clientSecret}`,
              ).toString("base64");
              const form = new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: redirectURI,
              });
              if (codeVerifier) form.set("code_verifier", codeVerifier);
              const res = await fetch(
                "https://api.faceit.com/auth/v1/oauth/token",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Accept: "application/json",
                    // Browser-like UA to rule out FACEIT's Cloudflare bot layer
                    // treating a Worker subrequest as automated.
                    "User-Agent":
                      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
                    Authorization: `Basic ${basic}`,
                  },
                  body: form.toString(),
                },
              );
              const text = await res.text();
              if (!res.ok) {
                console.error(
                  `FACEIT token exchange ${res.status} ` +
                    `(clientId=${clientId} secretLen=${clientSecret.length}): ${text}`,
                );
                throw new Error(`FACEIT token ${res.status}`);
              }
              const data = JSON.parse(text) as Record<string, unknown>;
              return {
                accessToken: data.access_token as string | undefined,
                refreshToken: data.refresh_token as string | undefined,
                tokenType: data.token_type as string | undefined,
                idToken: data.id_token as string | undefined,
                accessTokenExpiresAt:
                  typeof data.expires_in === "number"
                    ? new Date(Date.now() + data.expires_in * 1000)
                    : undefined,
                scopes:
                  typeof data.scope === "string"
                    ? data.scope.split(" ")
                    : undefined,
                raw: data,
              };
            },
            getUserInfo: async (tokens: OAuthTokens) => {
              const p = await fetchFaceitProfile(tokens.accessToken);
              if (!p) return null;
              return {
                id: p.externalId,
                name: p.handle || `FACEIT ${p.externalId}`,
                email: p.email || `${p.externalId}@faceit.invalid`,
                emailVerified: p.emailVerified ?? false,
              };
            },
          },
        ]
      : []),
    // start.gg — OAuth 2.0 over a GraphQL API. Identity is the currentUser
    // query (see fetchStartggProfile).
    ...(env.STARTGG_CLIENT_ID && env.STARTGG_CLIENT_SECRET
      ? [
          {
            providerId: "startgg",
            clientId: env.STARTGG_CLIENT_ID,
            clientSecret: env.STARTGG_CLIENT_SECRET,
            authorizationUrl: "https://start.gg/oauth/authorize",
            tokenUrl: "https://api.start.gg/oauth/access_token",
            scopes: ["user.identity", "user.email"],
            disableSignUp: true,
            getUserInfo: async (tokens: OAuthTokens) => {
              const p = await fetchStartggProfile(tokens.accessToken);
              if (!p) return null;
              return {
                id: p.externalId,
                name: p.handle || `start.gg ${p.externalId}`,
                email: p.email || `${p.externalId}@startgg.invalid`,
                emailVerified: p.emailVerified ?? false,
              };
            },
          },
        ]
      : []),
    // Challonge — OAuth 2.0. `me` is a thin profile (username + email);
    // `tournaments:read`/`matches:read` let the personal schedule sync
    // (lib/schedule.ts) read the member's own Challonge tournaments. Accounts
    // linked before these scopes shipped carry only `me`, so the sync gates on
    // hasScope() and skips rather than 403 (see loadChallongeSchedule).
    ...(env.CHALLONGE_CLIENT_ID && env.CHALLONGE_CLIENT_SECRET
      ? [
          {
            providerId: "challonge",
            clientId: env.CHALLONGE_CLIENT_ID,
            clientSecret: env.CHALLONGE_CLIENT_SECRET,
            authorizationUrl: "https://api.challonge.com/oauth/authorize",
            tokenUrl: "https://api.challonge.com/oauth/token",
            scopes: ["me", "tournaments:read", "matches:read"],
            disableSignUp: true,
            getUserInfo: async (tokens: OAuthTokens) => {
              const p = await fetchChallongeProfile(tokens.accessToken);
              if (!p) return null;
              return {
                id: p.externalId,
                name: p.handle || `Challonge ${p.externalId}`,
                email: p.email || `${p.externalId}@challonge.invalid`,
                emailVerified: p.emailVerified ?? false,
              };
            },
          },
        ]
      : []),
  ];

  // Deliberately *not* annotated `BetterAuthPlugin[]`: the widened type erases
  // each plugin's own inference, and with it `session.user.twoFactorEnabled`.
  // The generic-OAuth plugin is spread into the literal rather than pushed for
  // the same reason — a `push` onto an inferred array would need the annotation
  // back.
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
    // The generic-OAuth providers assembled above (Battle.net + the esports
    // connects), as a single plugin. Spread, not pushed — see the note above.
    ...(genericConfig.length
      ? [genericOAuth({ config: genericConfig })]
      : []),
  ];

  return betterAuth({
    database: drizzleAdapter(getDb(), { provider: "sqlite" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // Serve repeat session checks from a signed cookie for one minute instead
    // of reading D1 on every page and HeaderAuthButton request. The short TTL
    // bounds revocation/profile staleness; privileged staff and unlock state is
    // still re-derived by its own gates rather than trusted from the session.
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60,
        strategy: "compact",
      },
    },
    // Cloudflare terminates TLS and puts the real client IP in CF-Connecting-IP.
    // Without this, Better Auth can't resolve an IP and rate-limits every client
    // into one shared per-path bucket — weakening brute-force protection on
    // sign-in and 2FA. Trust only this header; our own edge sets it and the
    // client can't forge it.
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
      // Scope the session cookie to the registrable domain so the marketing
      // site (fault.foundation) can read it and paint the header avatar
      // instead of a permanent "Sign In". fault.foundation and
      // commons.fault.foundation are same-SITE but cross-ORIGIN, so the
      // cookie stays SameSite=Lax — it rides along on the site's credentialed
      // session fetch without the CSRF exposure SameSite=None would add.
      //
      // The tradeoff is real and deliberate: every *.fault.foundation host now
      // receives the session cookie, so any subdomain we point at a third
      // party (a status page, a docs host, a marketing landing page) can read
      // a member's session. Keep subdomains under our control, or move this
      // back to host-only and drop the avatar from the marketing site.
      crossSubDomainCookies: {
        enabled: true,
        domain: ".fault.foundation",
      },
    },
    // `next dev` serves on :3000 while BETTER_AUTH_URL points at :3999
    // (the wrangler preview port) — trust both origins in development.
    // In production the baseURL origin is always trusted; listing both the
    // workers.dev alias and the eventual custom domain means the DNS cutover
    // is a wrangler.jsonc var change with no code edit. Without this, auth
    // POSTs from the non-baseURL origin are rejected 403 by the origin check.
    trustedOrigins: isDev
      ? ["http://localhost:3000", "http://localhost:3001", "http://localhost:3999"]
      : [
          "https://commons.fault.foundation",
          "https://commons.oscarlabit9729.workers.dev",
          // The marketing site's header calls get-session (and sign-out)
          // cross-origin; without this the origin check 403s them.
          "https://fault.foundation",
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
        trustedProviders: [
          "discord",
          "battlenet",
          "faceit",
          "startgg",
          "challonge",
        ],
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
              // Seed the Overwatch statistics store the moment they connect:
              // register them for the poller and take an initial career
              // snapshot. Best-effort — never blocks or fails the link.
              await snapshotOnConnect(account.userId, battleTag);
            } else if (account.providerId === "faceit") {
              const p = await fetchFaceitProfile(account.accessToken);
              await mirrorPlatformIdentity(
                account.userId,
                "faceit",
                account.accountId,
                p?.handle,
              );
            } else if (account.providerId === "startgg") {
              const p = await fetchStartggProfile(account.accessToken);
              await mirrorPlatformIdentity(
                account.userId,
                "startgg",
                account.accountId,
                p?.handle,
              );
            } else if (account.providerId === "challonge") {
              const p = await fetchChallongeProfile(account.accessToken);
              await mirrorPlatformIdentity(
                account.userId,
                "challonge",
                account.accountId,
                p?.handle,
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
});

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

// The esports-connect providers, each gated on its own OAuth secrets. Same
// degrade-don't-break rule: unset secrets leave the card disabled.
export function faceitAuthEnabled(): boolean {
  const { env } = getCloudflareContext();
  return Boolean(env.FACEIT_CLIENT_ID && env.FACEIT_CLIENT_SECRET);
}

export function startggAuthEnabled(): boolean {
  const { env } = getCloudflareContext();
  return Boolean(env.STARTGG_CLIENT_ID && env.STARTGG_CLIENT_SECRET);
}

export function challongeAuthEnabled(): boolean {
  const { env } = getCloudflareContext();
  return Boolean(env.CHALLONGE_CLIENT_ID && env.CHALLONGE_CLIENT_SECRET);
}
