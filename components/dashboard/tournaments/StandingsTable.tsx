// The Standings tab's placement table for an external tournament. Shared (no
// directive — pure presentational) between the placed-standings path and the
// bracket-derived one. Two differences from the old plain table:
//
//   • Ranks are ORDINALS and TIES collapse into one range cell — the four teams
//     sharing 5th place render once as "5th – 8th", spanning their rows (a
//     rowSpan on the rank cell), exactly like the provider's own standings.
//   • Every entrant carries a circular avatar — its school favicon / provider
//     logo, or a neutral person placeholder when it has none — so a table of
//     entrants without logos still reads as a roster, not a bare list.
//
// The tie range END is start + size − 1 (standard competition ranking: a tie
// occupies the TOP of its span and skips the rest), which is what start.gg /
// FACEIT / Challonge emit and what our bracket deriver (rankBracket) produces.

export type StandingRow = {
  entrantName: string;
  entrantLogoUrl: string | null;
  /** Provider/derived placement; null for an unplaced entrants roster. */
  placement: number | null;
  /** Tag this row "Advancing" (a pool's qualifying entrants). */
  advancing?: boolean;
};

/** 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th", 11 → "11th". */
function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function EntrantAvatar({ url }: { url: string | null }) {
  if (url) {
    return (
      <img
        className="ff-standings__avatar"
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      className="ff-standings__avatar ff-standings__avatar--empty"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.46-8 5.5V21h16v-1.5c0-3.04-3.58-5.5-8-5.5Z" />
      </svg>
    </span>
  );
}

type TieGroup = { label: string; rows: StandingRow[] };

/** Bucket already-ranked rows into tie groups (consecutive equal placements). */
function groupTies(rows: StandingRow[]): TieGroup[] {
  const sorted = [...rows].sort(
    (a, b) => (a.placement ?? Infinity) - (b.placement ?? Infinity),
  );
  const groups: TieGroup[] = [];
  let i = 0;
  while (i < sorted.length) {
    const place = sorted[i].placement;
    const bucket = [sorted[i]];
    let j = i + 1;
    while (j < sorted.length && sorted[j].placement === place) {
      bucket.push(sorted[j]);
      j += 1;
    }
    const label =
      place == null
        ? "—"
        : bucket.length > 1
          ? `${ordinal(place)} – ${ordinal(place + bucket.length - 1)}`
          : ordinal(place);
    groups.push({ label, rows: bucket });
    i = j;
  }
  return groups;
}

export function StandingsTable({
  rows,
  showPlace,
}: {
  rows: StandingRow[];
  /** Show the "#" rank column. Off for an unplaced entrants roster. */
  showPlace: boolean;
}) {
  // When placements exist, group tied rows so the rank cell spans them; an
  // unplaced roster is one flat group with no rank column.
  const groups = showPlace ? groupTies(rows) : [{ label: "", rows }];

  return (
    <div className="ff-ticket-table-wrap">
      <table className="ff-standings">
        <thead>
          <tr>
            {showPlace ? (
              <th scope="col" className="ff-standings__rank-col">
                #
              </th>
            ) : null}
            <th scope="col">Entrant</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group, groupIndex) =>
            group.rows.map((row, rowIndex) => (
              <tr
                key={`${group.label}-${row.entrantName}-${rowIndex}`}
                className={
                  showPlace && rowIndex === 0
                    ? "ff-standings__group-start"
                    : undefined
                }
              >
                {showPlace && rowIndex === 0 ? (
                  <td className="ff-standings__rank" rowSpan={group.rows.length}>
                    {group.label}
                  </td>
                ) : null}
                <td className="ff-standings__player">
                  <span className="ff-ext-entrant">
                    <EntrantAvatar url={row.entrantLogoUrl} />
                    <span>{row.entrantName}</span>
                    {row.advancing ? (
                      <span className="ff-ext-adv">Advancing</span>
                    ) : null}
                  </span>
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}
