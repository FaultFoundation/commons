"use client";

import { useMemo } from "react";
import { TournamentsPanel } from "./TournamentsPanel";
import { unpackTournamentEntries, type PackedTournamentEntries } from "@/lib/tournament-wire";
import type { TournamentLayout } from "@/lib/tournaments-shared";

/** Decode at the client boundary, before the existing filters and cards run. */
export function PackedTournamentsPanel({ tournaments, ...props }: {
  tournaments: PackedTournamentEntries;
  initialLayout: TournamentLayout;
  follows: string[];
}) {
  const entries = useMemo(() => unpackTournamentEntries(tournaments), [tournaments]);
  return <TournamentsPanel {...props} tournaments={entries} />;
}
