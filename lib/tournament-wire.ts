import type { TournamentListEntry } from "@/components/dashboard/tournaments/TournamentList";

// Send object keys once per shape instead of thousands of times through React's
// server-component serializer. Values (including nulls and discovery facts) are
// preserved. No compression library or client fetch is needed.
type Table = { shapes: string[][]; rows: [number, unknown[]][] };
export type PackedTournamentEntries = { entries: Table; discovery: Table };

function packTable(records: Record<string, unknown>[]): Table {
  const shapes: string[][] = [];
  const ids = new Map<string, number>();
  const rows: Table["rows"] = records.map((record) => {
    const keys = Object.keys(record).filter((key) => record[key] !== undefined);
    const shape = JSON.stringify(keys);
    let id = ids.get(shape);
    if (id === undefined) {
      id = shapes.length;
      shapes.push(keys);
      ids.set(shape, id);
    }
    return [id, keys.map((key) => record[key])];
  });
  return { shapes, rows };
}

function unpackTable(table: Table): Record<string, unknown>[] {
  return table.rows.map(([shape, values]) =>
    Object.fromEntries(table.shapes[shape].map((key, i) => [key, values[i]])),
  );
}

export function packTournamentEntries(entries: TournamentListEntry[]): PackedTournamentEntries {
  const discovery: Record<string, unknown>[] = [];
  const records = entries.map(({ discovery: facts, ...entry }) => {
    if (!facts) return entry;
    const index = discovery.length;
    discovery.push(facts);
    return { ...entry, discovery: index };
  });
  return { entries: packTable(records), discovery: packTable(discovery) };
}

export function unpackTournamentEntries(packed: PackedTournamentEntries): TournamentListEntry[] {
  const discovery = unpackTable(packed.discovery);
  return unpackTable(packed.entries).map((entry) => {
    if (typeof entry.discovery === "number") entry.discovery = discovery[entry.discovery];
    return entry as TournamentListEntry;
  });
}
