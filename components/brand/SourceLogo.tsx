import { FaceitMark } from "@/components/brand/ProviderMark";

// The "website" mark shown top-left on a tournament tile: which platform the
// tournament lives on. Internal Commons tournaments (hosted on the org's
// Challonge, but branded as ours) show the Commons mark; scraped external ones
// show start.gg / FACEIT.
//
// Marks are inline like the OAuth glyphs (components/brand/ProviderMark) so they
// never depend on a network fetch and can't render broken. To swap in official
// brand art later, drop an SVG at `public/brand/sources/<key>.svg` (keys:
// commons, challonge, startgg, faceit) and replace the inline mark below with an
// <img src="/brand/sources/<key>.svg" alt="" /> — see db/README.md.

export type TournamentSource = "commons" | "challonge" | "startgg" | "faceit";

/** Normalize a list entry's `source` to a logo key. Internal Commons
    tournaments carry no source; external ones carry "startgg" | "faceit". */
export function sourceKey(source: string | null | undefined): TournamentSource {
  switch (source) {
    case "startgg":
      return "startgg";
    case "faceit":
      return "faceit";
    case "challonge":
      return "challonge";
    default:
      return "commons";
  }
}

const SOURCE_NAMES: Record<TournamentSource, string> = {
  commons: "The Fault Foundation",
  challonge: "Challonge",
  startgg: "start.gg",
  faceit: "FACEIT",
};

/** The Fault Foundation monogram — a bold "FF" in the brand accent. Placeholder
    for the org's real mark; drop `public/brand/sources/commons.svg` to replace. */
function CommonsMark() {
  return (
    <svg viewBox="0 0 24 24" role="presentation" fill="currentColor">
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fontSize={12}
        fontWeight={900}
        fontFamily="inherit"
        letterSpacing="-1"
      >
        FF
      </text>
    </svg>
  );
}

export function SourceLogo({ source }: { source: TournamentSource }) {
  const label = SOURCE_NAMES[source];
  return (
    <span
      className={`ff-tcard__source ff-tcard__source--${source}`}
      title={label}
      aria-label={label}
    >
      {source === "faceit" ? (
        <FaceitMark />
      ) : source === "commons" ? (
        <CommonsMark />
      ) : (
        // start.gg / Challonge present as wordmarks, which is how both brands
        // style themselves; swap for an official single-path SVG when on hand.
        <span className="ff-brandword" aria-hidden="true">
          {source === "startgg" ? "start.gg" : "Challonge"}
        </span>
      )}
    </span>
  );
}
