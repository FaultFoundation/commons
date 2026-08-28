import { ChallongeMark, FaceitMark, StartggMark } from "@/components/brand/ProviderMark";

// The "website" mark shown top-left on a tournament tile: which platform the
// tournament lives on. Internal Commons tournaments (hosted on the org's
// Challonge, but branded as ours) show the Commons mark; scraped external ones
// show start.gg / FACEIT.
//
// Marks are inline like the OAuth glyphs (components/brand/ProviderMark), and
// shared with them for challonge/faceit/startgg, so they never depend on a
// network fetch and can't render broken. The Commons mark is the one exception:
// it's real org art at `public/brand/sources/commons.svg`, loaded as an <img>.

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

/** The Fault Foundation wordmark, white-on-transparent. Plain <img> to match
    the rest of the markup (next.config sets images.unoptimized). */
function CommonsMark() {
  return <img src="/brand/sources/commons.svg" alt="" />;
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
      ) : source === "startgg" ? (
        <StartggMark />
      ) : (
        <ChallongeMark />
      )}
    </span>
  );
}
