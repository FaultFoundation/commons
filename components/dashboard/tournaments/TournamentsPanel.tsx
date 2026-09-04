import { Bubble } from "@/components/dashboard/bubbles/Bubble";
import {
  mergeChrome,
  type PanelChrome,
} from "@/components/dashboard/bubbles/PanelChrome";
import {
  TournamentList,
  type TournamentListEntry,
} from "@/components/dashboard/tournaments/TournamentList";
import type { TournamentLayout } from "@/lib/tournaments-shared";

/**
 * The Tournaments tab's one bubble, as a pinnable panel — the unified internal
 * (Challonge) + external (cen-sql) list, with its own view/layout/game filters
 * intact. Home mounts this same component, so a member who pins Tournaments
 * gets the real list rather than a trimmed copy of it.
 */
export function TournamentsPanel({
  tournaments,
  initialLayout,
  chrome,
}: {
  tournaments: TournamentListEntry[];
  initialLayout: TournamentLayout;
  chrome?: PanelChrome;
}) {
  return (
    <Bubble title="Tournaments" {...mergeChrome(chrome, { span: "full" })}>
      <TournamentList
        tournaments={tournaments}
        initialLayout={initialLayout}
      />
    </Bubble>
  );
}
