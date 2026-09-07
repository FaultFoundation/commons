"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";

import { usePersistentState } from "@/lib/view-state";

import {
  isTournamentTabId,
  type TournamentTabId,
} from "@/components/dashboard/tournaments/tournament-view-shared";

// The tabbed shell shared by the internal (Challonge) and external
// (start.gg/FACEIT) tournament views: the hero header (always visible), then a
// browser-style tab strip (Overview / Bracket / Standings / Rules) with one
// panel shown at a time. Only the active panel is mounted, so a heavy client
// panel (the polling BracketView, the measured ExternalBracket) does no work
// while it's hidden.
//
// The open tab is remembered per tournament (lib/view-state.ts), so leaving a
// bracket for the list and coming back lands on the bracket again rather than
// resetting to Overview. A `?tab=` deep link still wins — it's an explicit
// instruction from the link the member followed — and becomes the remembered
// tab from then on.
//
// A tiny context lets controls DEEP inside a panel switch tabs — "Full
// standings →" in the overview, a bracket-tab jump — without threading a
// callback through every server-rendered node. The panels are passed in as
// already-rendered nodes (server components are fine as props to this client
// component); the client controls that consume the context are ordinary client
// components sitting inside those trees, below this provider.

type TabContext = { active: TournamentTabId; setTab: (id: TournamentTabId) => void };

const TournamentTabCtx = createContext<TabContext | null>(null);

/** Switch the active tournament tab from anywhere inside a panel. Returns null
    outside a TournamentChrome (so a control can no-op rather than throw). */
export function useTournamentTabs(): TabContext | null {
  return useContext(TournamentTabCtx);
}

export type TournamentTab = {
  id: TournamentTabId;
  label: string;
  node: ReactNode;
};

export function TournamentChrome({
  header,
  tabs,
  initialTab = "overview",
  storageKey,
}: {
  header: ReactNode;
  /** In display order; empty tabs should simply be omitted by the caller. */
  tabs: TournamentTab[];
  initialTab?: TournamentTabId;
  /** What the remembered tab is filed under — the tournament id. Omit it and
      the tab simply doesn't persist. */
  storageKey?: string;
}) {
  const [active, setActive] = usePersistentState<TournamentTabId>(
    storageKey ? `tournament-tab:${storageKey}` : null,
    initialTab,
    (stored) =>
      typeof stored === "string" &&
      isTournamentTabId(stored) &&
      tabs.some((t) => t.id === stored)
        ? stored
        : undefined,
  );

  // Honour a ?tab= deep link on first mount (e.g. a shared bracket link), but
  // only for a tab that actually exists here — no server plumbing needed. This
  // effect is declared after the hook above, so it runs after the restore and
  // the link wins.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (
      requested &&
      isTournamentTabId(requested) &&
      tabs.some((t) => t.id === requested)
    ) {
      setActive(requested);
    }
    // Run once on mount; tab set is stable for the life of the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0];
  const setTab = (id: TournamentTabId) => {
    if (tabs.some((t) => t.id === id)) setActive(id);
  };

  return (
    <TournamentTabCtx.Provider value={{ active: activeTab?.id ?? active, setTab }}>
      {header}
      <div className="ff-ttabs" role="tablist" aria-label="Tournament sections">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`ttab-${tab.id}`}
            aria-selected={tab.id === activeTab?.id}
            aria-controls={`tpanel-${tab.id}`}
            className={`ff-ttab${tab.id === activeTab?.id ? " ff-ttab--active" : ""}`}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab ? (
        <div
          id={`tpanel-${activeTab.id}`}
          role="tabpanel"
          aria-labelledby={`ttab-${activeTab.id}`}
        >
          {activeTab.node}
        </div>
      ) : null}
    </TournamentTabCtx.Provider>
  );
}
