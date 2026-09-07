// Server-only (it reads D1 through listTournaments / the cen-sql projection).
import type { TournamentListEntry } from "@/components/dashboard/tournaments/TournamentList";
import { listExternalTournaments } from "@/lib/external-tournaments";
import { enrichDiscovery } from "@/lib/discovery";
import { listTournaments } from "@/lib/tournaments";

/**
 * The unified tournament list: internal (Challonge-backed, website-sql) plus
 * external (the cen-sql projection), mapped into the one shape the list card
 * renders. External reads degrade to [] when cen-sql isn't bound, so the list
 * still shows the internal tournaments.
 *
 * Lives here rather than in the Tournaments page because the Home board can pin
 * the Tournaments bubble — both hosts must build entries identically, or a
 * pinned list would quietly disagree with the tab it came from.
 */
export async function loadTournamentEntries(): Promise<TournamentListEntry[]> {
  const [internal, external] = await Promise.all([
    listTournaments({ excludeDraft: true }),
    listExternalTournaments(),
  ]);

  const internalEntries: TournamentListEntry[] = internal.map((t) => ({
    id: t.id,
    name: t.name,
    format: t.format,
    status: t.status,
    entrantCount: t.entrantCount,
    maxParticipants: t.maxParticipants,
    startsAt: t.startsAt ? t.startsAt.getTime() : null,
    bannerUrl: t.bannerUrl,
    featured: t.featured,
    endsAt: t.endsAt?.getTime() ?? null,
    description: t.description,
    registrationClosesAt: t.registrationClosesAt?.getTime() ?? null,
    academicVerificationRequired: t.academicVerificationRequired,
    game: t.gameName,
    gameLogoUrl: t.gameLogoUrl,
  }));

  const externalEntries: TournamentListEntry[] = external.map((t) => ({
    id: t.id,
    name: t.name,
    format: "",
    status: t.status,
    entrantCount: t.numAttendees ?? 0,
    maxParticipants: null,
    // Prefer the first round's scheduled time when the projection has match
    // times; fall back to the tournament-level start. Drives both the displayed
    // date+time and the list sort.
    startsAt: (t.firstMatchAt ?? t.startAt)?.getTime() ?? null,
    bannerUrl: t.bannerUrl,
    featured: false,
    endsAt: t.endAt?.getTime() ?? null,
    sourceStartsAt: t.startAt?.getTime() ?? null,
    description: t.description,
    organizer: t.organizer,
    organizerUrl: t.organizerUrl,
    country: t.country,
    city: t.city,
    registrationClosesAt: t.registrationClosesAt?.getTime() ?? null,
    prizePool: t.prizePool,
    source: t.source,
    sourceTournamentId: t.sourceTournamentId,
    externalUrl: t.url,
    game: t.game,
    gameLogoUrl: null,
  }));

  const entries = await enrichDiscovery([...internalEntries, ...externalEntries]);
  // Classification uses source prose on the server; cards do not need a copy
  // of every full description in their serialized client payload.
  return entries.map(({ description: _description, ...entry }) => entry);
}
