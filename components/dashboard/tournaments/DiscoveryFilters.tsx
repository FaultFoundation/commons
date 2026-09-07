"use client";
import {
  EMPTY_FILTERS,
  type DiscoveryFilters as Filters,
} from "@/lib/discovery-shared";
export function DiscoveryFilters({
  value,
  onChange,
  countries,
}: {
  value: Filters;
  onChange: (v: Filters) => void;
  countries: string[];
}) {
  const count = Object.values(value).filter(Boolean).length;
  const selects: [keyof Filters, string, [string, string][]][] = [
    [
      "audience",
      "Audience",
      [
        ["collegiate", "Collegiate"],
        ["open", "Open to everyone"],
        ["unknown", "Not specified"],
      ],
    ],
    [
      "venue",
      "Venue",
      [
        ["online", "Online"],
        ["in-person", "In-person"],
        ["hybrid", "Hybrid"],
        ["unknown", "Not specified"],
      ],
    ],
    [
      "competition",
      "Competition",
      [
        ["league", "Leagues"],
        ["series", "Series"],
        ["tournament", "Standalone tournaments"],
      ],
    ],
    [
      "source",
      "Platform",
      [
        ["startgg", "start.gg"],
        ["faceit", "FACEIT"],
        ["challonge", "Challonge"],
        ["discord", "Discord"],
      ],
    ],
    ["country", "Region / country", countries.map((c) => [c, c])],
    [
      "days",
      "Date",
      [
        ["7", "Next 7 days"],
        ["30", "Next 30 days"],
        ["90", "Next 90 days"],
      ],
    ],
    [
      "registration",
      "Registration deadline",
      [["closing", "Closing within 72 hours"]],
    ],
  ];
  return (
    <details className="ff-discovery-filters">
      <summary>Filters{count ? ` · ${count} applied` : ""}</summary>
      <div className="ff-discovery-fields">
        <label>
          Search
          <input
            type="search"
            value={value.query}
            onChange={(e) => onChange({ ...value, query: e.target.value })}
            placeholder="Tournament, organization or game"
          />
        </label>
        {selects.map(([key, label, options]) => (
          <label key={key}>
            {label}
            <select
              value={String(value[key])}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            >
              <option value="">Any</option>
              {options.map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          <span>Following</span>
          <input
            type="checkbox"
            checked={value.following}
            onChange={(e) =>
              onChange({ ...value, following: e.target.checked })
            }
          />{" "}
          Only organizations and series I follow
        </label>
        <button
          type="button"
          className="ff-ticket-view"
          onClick={() => onChange({ ...EMPTY_FILTERS })}
        >
          Clear filters
        </button>
      </div>
    </details>
  );
}
