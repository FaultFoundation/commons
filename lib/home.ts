// ---------------------------------------------------------------------------
// Home board — the server half. Loads the data the member's ENABLED widgets
// need, and nothing else.
//
// The board can now hold any bubble on the site, so the old approach (fetch
// every tab's data on every Home render, so toggling is instant) stopped being
// affordable: it would mean a Challonge-backed tournament list, a schedule sync
// across three providers, the OW registry and four Settings reads on every
// visit, for bubbles the member may not have pinned. `homeSourcesFor` narrows
// that to the union of what's actually on the board, and each source is loaded
// once even when several widgets share it (At a Glance + Calendar + Your
// Results all ride one schedule read).
//
// The cost of that trade is that ENABLING a widget needs a round-trip to fill
// in its source — the customize dialog reloads on close when the set changed.
// ---------------------------------------------------------------------------

import { eq } from "drizzle-orm";

import type { HomeData } from "@/components/dashboard/home/HomeWidgets";
import { twoFactor, user } from "@/db/schema";
import { getAccountLinksCached } from "@/lib/account-links";
import { battlenetAuthEnabled, discordAuthEnabled } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { asDensity } from "@/lib/density";
import { listUpcomingExternalScheduleEntries } from "@/lib/external-tournaments";
import { homeSourcesFor, type HomeWidgetId } from "@/lib/home-shared";
import {
  loadConnectIntegrations,
  loadDiscordIntegration,
} from "@/lib/integrations";
import { getPlatformIdentityCached } from "@/lib/platform-identities";
import {
  getProfileCached,
  getRegistrationStateCached,
} from "@/lib/registration";
import { getExternalTeamsForUser } from "@/lib/player-data";
import { loadSchedule } from "@/lib/schedule";
import { listMyTeams } from "@/lib/teams";
import { loadTournamentEntries } from "@/lib/tournament-entries";
import { asTournamentLayout } from "@/lib/tournaments-shared";

export async function loadHomeData({
  userId, 
  layout,
  requestHeaders,
  densityCookie,
  tournamentLayoutCookie,
  sessionUser,
}: {
  userId: string;
  layout: readonly HomeWidgetId[];
  requestHeaders: Headers;
  densityCookie: string | undefined;
  tournamentLayoutCookie: string | undefined;
  sessionUser: {
    name: string;
    email: string;
    image?: string | null;
    emailVerified: boolean;
  };
}): Promise<HomeData> {
  const sources = new Set(homeSourcesFor(layout));
  const data: HomeData = {};

  // Every source is independent, so they run together rather than in sequence —
  // the Worker's CPU budget is per request, not per read.
  await Promise.all([
    sources.has("tournaments")
      ? loadTournamentEntries().then((entries) => {
          data.tournaments = {
            entries,
            layout: asTournamentLayout(tournamentLayoutCookie),
          };
        })
      : null,

    sources.has("schedule")
      ? Promise.all([
          loadSchedule(userId),
          listUpcomingExternalScheduleEntries(),
          getAccountLinksCached(userId),
        ]).then(([{ upcoming, past }, allUpcoming, connects]) => {
          data.schedule = {
            allUpcoming,
            upcoming,
            past,
            anyConnected: connects.some((c) => ["faceit", "startgg", "challonge"].includes(c.providerId)),
          };
        })
      : null,

    sources.has("teams")
      ? Promise.all([
          listMyTeams(userId),
          // D1-only (no provider calls) — same read the Teams tab does.
          getExternalTeamsForUser(userId),
        ]).then(([teams, external]) => {
          data.teams = { teams, external };
        })
      : null,

    sources.has("battlenet")
      ? Promise.all([
          getAccountLinksCached(userId),
          getPlatformIdentityCached(userId, "battlenet"),
        ]).then(([links, identity]) => {
          data.battlenet = {
            linked: links.some((r) => r.providerId === "battlenet"),
            enabled: battlenetAuthEnabled(),
            battletag: identity?.handle ?? null,
          };
        })
      : null,

    sources.has("profile")
      ? getRegistrationStateCached(userId).then((registration) => {
          data.profile = {
            name: sessionUser.name,
            email: sessionUser.email,
            image: sessionUser.image ?? null,
            emailVerified: sessionUser.emailVerified,
            registration,
          };
        })
      : null,

    sources.has("security")
      ? Promise.all([
          getAccountLinksCached(userId),
          // Read from D1 rather than the session, for the same reason the
          // Settings tab does: `user.two_factor_enabled` is what the sign-in
          // challenge consults, and the session here can be served from Better
          // Auth's cookie cache.
          getDb()
            .select({
              enabled: user.twoFactorEnabled,
              totpVerified: twoFactor.verified,
            })
            .from(user)
            .leftJoin(twoFactor, eq(twoFactor.userId, user.id))
            .where(eq(user.id, userId))
            .limit(1),
        ]).then(([links, rows]) => {
          data.security = {
            hasPassword: links.some((r) => r.providerId === "credential"),
            twoFactorEnabled: rows[0]?.enabled ?? false,
            hasTotp: Boolean(rows[0]?.totpVerified),
            email: sessionUser.email,
          };
        })
      : null,

    sources.has("display")
      ? (densityCookie
          ? Promise.resolve(null)
          : getProfileCached(userId)
        ).then((profile) => {
          data.display = { density: asDensity(densityCookie ?? profile?.density) };
        })
      : null,

    sources.has("integrations")
      ? Promise.all([
          // Also refreshes the stored Discord handle when it has gone stale.
          loadDiscordIntegration(userId, requestHeaders),
          getPlatformIdentityCached(userId, "battlenet"),
          loadConnectIntegrations(userId),
          getAccountLinksCached(userId),
        ]).then(([discord, battlenetIdentity, connects, links]) => {
          data.integrations = {
            discord,
            discordEnabled: discordAuthEnabled(),
            battlenetLinked: links.some((r) => r.providerId === "battlenet"),
            battlenetHandle: battlenetIdentity?.handle ?? null,
            battlenetEnabled: battlenetAuthEnabled(),
            connects,
          };
        })
      : null,
  ]);

  return data;
}
