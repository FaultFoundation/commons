import type {
  HeaderLink,
  HeaderLinkKind,
} from "@/components/dashboard/tournaments/tournament-view-shared";

// The header's social/known-links row: a compact strip of circular icon buttons
// for the links a tournament ACTUALLY has — a promo video, a live stream, the
// organizer's Discord/socials, their page, the ruleset. "Only include links
// known": the caller passes only real links, and this renders nothing when the
// list is empty. Brand glyphs are simple-icons paths (same source as ShareBar);
// utility kinds (video/stream/organizer/website/rules) use hand-drawn marks.

/** simple-icons brand glyphs (24×24, fill=currentColor). */
const BRAND: Partial<Record<HeaderLinkKind, string>> = {
  discord:
    "M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z",
  x: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  facebook:
    "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
  youtube:
    "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  twitch:
    "M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z",
};

function GlyphSvg({ kind }: { kind: HeaderLinkKind }) {
  const brand = BRAND[kind];
  if (brand) {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
        <path d={brand} />
      </svg>
    );
  }
  // Hand-drawn utility marks (stroke-based), matching the ShareBar line icons.
  const stroke = {
    viewBox: "0 0 24 24",
    width: 18,
    height: 18,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (kind) {
    case "video":
      return (
        <svg {...stroke}>
          <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
          <path d="M10 9l5 3-5 3V9z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "stream":
      return (
        <svg {...stroke}>
          <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
          <path d="M6.5 6.5a7 7 0 0 0 0 11M17.5 6.5a7 7 0 0 1 0 11" />
          <path d="M3.8 3.8a11 11 0 0 0 0 16.4M20.2 3.8a11 11 0 0 1 0 16.4" />
        </svg>
      );
    case "organizer":
      return (
        <svg {...stroke}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    case "email":
      return (
        <svg {...stroke}>
          <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
          <path d="M3 7l9 6 9-6" />
        </svg>
      );
    case "rules":
      return (
        <svg {...stroke}>
          <path d="M6 3h9l4 4v14a0 0 0 0 1 0 0H6a0 0 0 0 1 0 0V3z" />
          <path d="M14 3v5h5M8.5 13h7M8.5 16.5h7" />
        </svg>
      );
    case "website":
    case "provider":
    default:
      return (
        <svg {...stroke}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
        </svg>
      );
  }
}

export function TournamentLinks({ links }: { links: HeaderLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className="ff-tlinks" role="group" aria-label="Tournament links">
      {links.map((link) => (
        <a
          key={`${link.kind}:${link.href}`}
          className={`ff-tlink ff-tlink--${link.kind}`}
          href={link.href}
          target="_blank"
          rel="noreferrer noopener"
          title={link.label}
          aria-label={link.label}
        >
          <GlyphSvg kind={link.kind} />
        </a>
      ))}
    </div>
  );
}
