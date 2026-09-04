// ---------------------------------------------------------------------------
// Home board — the client-safe widget registry. The Home tab is a customizable
// board of the portal's OWN bubbles: every entry here renders the same panel
// component the tab it comes from renders, with the same data. This file is the
// SINGLE PLACE that lists what a member can put on their Home screen.
//
// THE RULE (see docs/dashboard-guide.md): a widget is never a re-implementation
// of a tab's bubble — it is that bubble. The tab and Home both wrap a shared
// `*Panel` component in a `Bubble`, so a change to the panel lands in both. When
// you add a bubble a member should be able to pin, extract its body into a panel
// (if it isn't one already), add an entry here, and render it in
// components/dashboard/home/HomeWidgets.tsx.
//
// No server-only imports (db, cloudflare context) — the *-shared.ts convention.
// ---------------------------------------------------------------------------

export type HomeWidgetId =
  | "overview"
  | "tournaments"
  | "schedule"
  | "results"
  | "teams"
  | "statistics"
  | "matches"
  | "profile"
  | "security"
  | "display"
  | "integrations";

/**
 * A server-side data set one or more widgets need. The Home page loads only the
 * sources the member's ENABLED widgets ask for — the board is now big enough
 * that fetching every tab's data on every render would spend Worker CPU and
 * provider calls on bubbles nobody pinned.
 *
 * `[]` means the widget loads its own data client-side (the Statistics panels
 * go through /api/statistics/*, deliberately, so Home never blocks on OverFast).
 */
export type HomeSourceId =
  | "tournaments"
  | "schedule"
  | "teams"
  | "battlenet"
  | "profile"
  | "security"
  | "display"
  | "integrations";

/** Section headings in the Customize Home popup — the tab a bubble comes from. */
export type HomeWidgetGroup =
  | "Overview"
  | "Tournaments"
  | "Schedule"
  | "Teams"
  | "Statistics"
  | "Settings";

export const HOME_WIDGET_GROUPS: readonly HomeWidgetGroup[] = [
  "Overview",
  "Tournaments",
  "Schedule",
  "Teams",
  "Statistics",
  "Settings",
];

export type HomeWidgetMeta = {
  id: HomeWidgetId;
  /** Title Case, shown as the bubble's heading and in the customize popup.
      Matches the title the bubble carries on its own tab. */
  title: string;
  /** One line in the customize popup. */
  description: string;
  /** Which tab the bubble comes from; groups the customize popup. */
  group: HomeWidgetGroup;
  /** Server data this widget needs. Empty = loads client-side. */
  sources: readonly HomeSourceId[];
};

/** Every widget a member can place on Home, in a stable canonical order. */
export const HOME_WIDGETS: readonly HomeWidgetMeta[] = [
  {
    id: "overview",
    title: "At a Glance",
    description: "Active tournaments and your next matches in one place.",
    group: "Overview",
    sources: ["tournaments", "schedule"],
  },
  {
    id: "tournaments",
    title: "Tournaments",
    description: "The full tournament list, exactly as the Tournaments tab shows it.",
    group: "Tournaments",
    sources: ["tournaments"],
  },
  {
    id: "schedule",
    title: "Calendar",
    description: "The month calendar from Schedule, with the All / Your Matches switch.",
    group: "Schedule",
    sources: ["schedule"],
  },
  {
    id: "results",
    title: "Your Results",
    description: "Recently finished matches on your connected accounts.",
    group: "Schedule",
    sources: ["schedule"],
  },
  {
    id: "teams",
    title: "My Teams",
    description: "Your team cards, including teams synced from FACEIT and start.gg.",
    group: "Teams",
    sources: ["teams"],
  },
  {
    id: "statistics",
    title: "Overwatch Statistics",
    description: "Your competitive ranks and career dashboard.",
    group: "Statistics",
    // The career itself is fetched client-side (never an SSR OverFast call);
    // the server only supplies whether Battle.net is linked, so the panel can
    // show the connect prompt without a flash.
    sources: ["battlenet"],
  },
  {
    id: "matches",
    title: "Match Data",
    description: "Your match history across FACEIT, start.gg and Challonge.",
    group: "Statistics",
    sources: [],
  },
  {
    id: "profile",
    title: "Profile",
    description: "Your avatar, name, email and school verification.",
    group: "Settings",
    sources: ["profile"],
  },
  {
    id: "security",
    title: "Security",
    description: "Your password and two-factor authentication.",
    group: "Settings",
    sources: ["security"],
  },
  {
    id: "display",
    title: "Display",
    description: "The dashboard density control.",
    group: "Settings",
    sources: ["display"],
  },
  {
    id: "integrations",
    title: "Integrations",
    description: "Every connected platform, and the ones you haven't linked yet.",
    group: "Settings",
    sources: ["integrations"],
  },
];

const HOME_WIDGET_IDS: readonly HomeWidgetId[] = HOME_WIDGETS.map((w) => w.id);

const BY_ID = new Map<HomeWidgetId, HomeWidgetMeta>(
  HOME_WIDGETS.map((w) => [w.id, w]),
);

export function homeWidgetMeta(id: HomeWidgetId): HomeWidgetMeta | undefined {
  return BY_ID.get(id);
}

/**
 * The layout a member sees before they've customized anything.
 *
 * Ordered so the rotating rhythm (see `isFullWidthAt`) lands the WIDE bubbles
 * in full-width slots: At a Glance opens the board, the two compact bubbles
 * pair up in the two-column row, and the calendar and tournament list — both of
 * which need the room — take the full-width rows after it.
 */
export const DEFAULT_HOME_LAYOUT: HomeWidgetId[] = [
  "overview",
  "teams",
  "results",
  "schedule",
  "tournaments",
];

export function isHomeWidgetId(value: unknown): value is HomeWidgetId {
  return (
    typeof value === "string" &&
    (HOME_WIDGET_IDS as readonly string[]).includes(value)
  );
}

/** The union of server sources an enabled layout needs — nothing more. */
export function homeSourcesFor(layout: readonly HomeWidgetId[]): HomeSourceId[] {
  const sources = new Set<HomeSourceId>();
  for (const id of layout) {
    for (const source of BY_ID.get(id)?.sources ?? []) sources.add(source);
  }
  return [...sources];
}

/**
 * The board's row rhythm: one full-width bubble, then a two-up row, then
 * full-width again — a repeating cycle of three. `true` means this position
 * spans the grid.
 *
 * The one exception is a trailing bubble that would sit alone in a two-up row:
 * it stretches instead, so the board never ends on a half-empty row. Shared
 * (rather than inlined in HomeBoard) because the rhythm is a layout RULE, not a
 * detail of the drag surface.
 */
export function isFullWidthAt(index: number, total: number): boolean {
  if (index % 3 === 0) return true;
  return index === total - 1 && index % 3 === 1;
}

/**
 * Normalize a stored layout (JSON string, array, or null) into a clean list of
 * known widget ids — dropping unknown/duplicate ids, never throwing. An empty
 * or missing value falls back to the default set, so a member always lands on a
 * usable board. An explicitly empty (but valid JSON `[]`) layout is honored as
 * "no widgets" only when it came through the action, which stores `[]` verbatim;
 * a null/garbage value is the default.
 */
export function asHomeLayout(
  raw: string | string[] | null | undefined,
): HomeWidgetId[] {
  if (raw == null) return [...DEFAULT_HOME_LAYOUT];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [...DEFAULT_HOME_LAYOUT];
    }
  }
  if (!Array.isArray(parsed)) return [...DEFAULT_HOME_LAYOUT];
  const seen = new Set<HomeWidgetId>();
  for (const value of parsed) {
    if (isHomeWidgetId(value)) seen.add(value);
  }
  return [...seen];
}
