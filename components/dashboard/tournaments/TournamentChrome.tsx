"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

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
}: {
  header: ReactNode;
  /** In display order; empty tabs should simply be omitted by the caller. */
  tabs: TournamentTab[];
  initialTab?: TournamentTabId;
}) {
  const [active, setActive] = useState<TournamentTabId>(initialTab);

  // Honour a ?tab= deep link on first mount (e.g. a shared bracket link), but
  // only for a tab that actually exists here — no server plumbing needed.
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
