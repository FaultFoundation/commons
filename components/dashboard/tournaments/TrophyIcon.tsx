// Gold / silver / bronze trophy marks for the top-3 finishers. Inline SVG in the
// same currentColor/glyph style as the rest of our icons (ShareBar, provider
// marks) — no image assets — so they scale crisply at the small sizes the
// finishers row and standings medals use. Solid place-coloured fill plus a
// darker rim and a soft highlight; no <defs>/gradient ids, so several can render
// on one page (finishers row + standings) with no id collisions.

const PLACE_STYLE: Record<number, { fill: string; rim: string; label: string }> = {
  1: { fill: "#f2c14e", rim: "#b8860b", label: "1st place" },
  2: { fill: "#c7ced6", rim: "#8b95a1", label: "2nd place" },
  3: { fill: "#cd8a4b", rim: "#8a4f24", label: "3rd place" },
};

export function TrophyIcon({
  place,
  size = 16,
}: {
  /** 1, 2, or 3. Anything else falls back to the bronze styling. */
  place: number;
  size?: number;
}) {
  const style = PLACE_STYLE[place] ?? PLACE_STYLE[3];
  return (
    <svg
      className="ff-trophy"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={style.label}
    >
      {/* Handles — thin rings on each side of the cup. */}
      <path
        d="M6 4H3.5v2A3.5 3.5 0 0 0 7 9.5M18 4h2.5v2A3.5 3.5 0 0 1 17 9.5"
        fill="none"
        stroke={style.rim}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Cup bowl. */}
      <path
        d="M6 3h12v4.2A6 6 0 0 1 6 7.2V3z"
        fill={style.fill}
        stroke={style.rim}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Highlight on the bowl. */}
      <path d="M8.4 4.4h2.1v2.4a1.05 1.05 0 0 1-2.1 0V4.4z" fill="#fff" opacity="0.35" />
      {/* Stem + base. */}
      <path
        d="M11 12.6h2v3.1h-2zM7.5 20.5l1-2.6h7l1 2.6z"
        fill={style.fill}
        stroke={style.rim}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
