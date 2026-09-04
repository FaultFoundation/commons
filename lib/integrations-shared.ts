// ---------------------------------------------------------------------------
// Integrations — the client-safe half. Provider ids, labels and the connect
// registry, importable from client components. No server-only imports (db,
// cloudflare context): the server-only work lives in lib/integrations.ts and
// lib/platform-identities.ts. Follows the *-shared.ts convention (see CLAUDE.md).
// ---------------------------------------------------------------------------

/** Every platform a member can attach to their account. */
export type LinkableProvider =
  | "discord"
  | "battlenet"
  | "faceit"
  | "startgg"
  | "challonge";

/**
 * The esports platforms connected purely as integrations (never a sign-in):
 * each is a generic-OAuth link that feeds the cross-site schedule. Distinct
 * from discord/battlenet, which predate this and carry their own flows.
 */
export type ConnectProviderId = "faceit" | "startgg" | "challonge";

export type ConnectProvider = {
  id: ConnectProviderId;
  /** Card heading and brand name. */
  label: string;
  /** Connect-button text. */
  linkLabel: string;
};

/**
 * The connect cards rendered under Integrations, in display order. Static
 * metadata only — linked/handle/enabled are resolved per request server-side
 * by loadConnectIntegrations (lib/integrations.ts).
 */
export const CONNECT_PROVIDERS: readonly ConnectProvider[] = [
  { id: "faceit", label: "FACEIT", linkLabel: "Connect FACEIT" },
  { id: "startgg", label: "start.gg", linkLabel: "Connect start.gg" },
  { id: "challonge", label: "Challonge", linkLabel: "Connect Challonge" },
];

/**
 * The Discord card's sub-note. Pure, and lives here rather than in
 * lib/integrations.ts because the Integrations bubble is a pinnable panel: the
 * Home board is a CLIENT component, so anything its panels call at runtime has
 * to be free of the db/cloudflare imports that module carries.
 */
export function discordServerNote(inGuild: boolean | null): string | undefined {
  if (inGuild === true) return "You're in the Discord server.";
  if (inGuild === false) return "You haven't joined the Discord server yet.";
  return undefined;
}
