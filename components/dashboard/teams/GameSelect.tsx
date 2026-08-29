"use client";

import type { GameOption } from "@/lib/games-shared";

/**
 * The "what game are you competing in" dropdown, shared by the create form,
 * the Start a Team dialog, and the team settings row. Just the <select>; the
 * caller supplies the label/field chrome. Options come from the server
 * (lib/games.ts listGames) so a new game is a seed row, not a code change.
 */
export function GameSelect({
  id,
  value,
  games,
  disabled,
  onChange,
}: {
  id?: string;
  value: string;
  games: GameOption[];
  disabled?: boolean;
  onChange: (gameId: string) => void;
}) {
  return (
    <select
      id={id}
      className="ff-auth__input"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {games.map((game) => (
        <option key={game.id} value={game.id}>
          {game.name}
        </option>
      ))}
    </select>
  );
}
