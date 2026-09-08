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
  follows = [],
}: {
  tournaments: TournamentListEntry[];
  initialLayout: TournamentLayout;
  chrome?: PanelChrome;
  follows?: string[];
}) {
  return (
    // `titleHidden` on both surfaces: the list renders its own "Tournaments"
    // section head beside the matching-count, so a visible bubble title would
    // just repeat it. On Home the header row survives for the board's chrome.
    <Bubble
      title="Tournaments"
      titleHidden
      {...mergeChrome(chrome, { span: "full" })}
    >
      <TournamentList
        tournaments={tournaments}
        initialLayout={initialLayout}
        follows={follows}
      />
    </Bubble>
  );
}
