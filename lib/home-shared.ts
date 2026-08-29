// ---------------------------------------------------------------------------
// Home board — the client-safe widget registry. The Home tab is a customizable
// board of draggable widgets, each a condensed view of another tab. This file
// is the SINGLE PLACE that lists what a member can put on their Home screen.
//
// THE RULE (see docs/dashboard-guide.md): every widget here is a condensed view
// that reads the SAME data source as the tab it mirrors, so a change to a tab's
// bubbles is reflected on Home automatically. When you add a new tab or a new
// standalone bubble that a member should be able to pin, add a widget entry
// here (and render it in components/dashboard/home/HomeBoard.tsx) — that is what
// keeps "any new bubble is accessible from Home" true.
//
// No server-only imports (db, cloudflare context) — the *-shared.ts convention.
// ---------------------------------------------------------------------------

export type HomeWidgetId = "overview" | "tournaments" | "schedule" | "teams";

export type HomeWidgetMeta = {
  id: HomeWidgetId;
  /** Title Case, shown as the bubble's heading and in the customize popup. */
  title: string;
  /** One line in the customize popup. */
  description: string;
};

/** Every widget a member can place on Home, in a stable canonical order. */
export const HOME_WIDGETS: readonly HomeWidgetMeta[] = [
  {
    id: "overview",
    title: "At a Glance",
    description: "Active tournaments and your next matches in one place.",
  },
  {
    id: "tournaments",
    title: "Tournaments",
    description: "Open and live tournaments to jump into.",
  },
  {
    id: "schedule",
    title: "Upcoming Matches",
    description: "Your next matches across every connected platform.",
  },
  {
    id: "teams",
    title: "My Teams",
    description: "Your rosters, at a glance.",
  },
];

const HOME_WIDGET_IDS: readonly HomeWidgetId[] = HOME_WIDGETS.map((w) => w.id);

/** The layout a member sees before they've customized anything. */
export const DEFAULT_HOME_LAYOUT: HomeWidgetId[] = [
  "overview",
  "tournaments",
  "schedule",
  "teams",
];

export function isHomeWidgetId(value: unknown): value is HomeWidgetId {
  return (
    typeof value === "string" &&
    (HOME_WIDGET_IDS as readonly string[]).includes(value)
  );
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
