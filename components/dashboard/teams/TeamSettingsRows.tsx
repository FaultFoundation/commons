"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { removeTeamLogo, setTeamLogo, updateTeamSettings } from "@/app/teams/actions";
import { AvatarUploadRow } from "@/components/dashboard/accounts/AvatarUploadRow";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { FieldRow } from "@/components/dashboard/bubbles/FieldRow";
import { GameSelect } from "@/components/dashboard/teams/GameSelect";
import { TeamColorPicker } from "@/components/dashboard/teams/TeamColorPicker";
import { RegionRow } from "@/components/dashboard/teams/RegionRow";
import { TimezoneRow } from "@/components/dashboard/teams/TimezoneRow";
import type { GameOption } from "@/lib/games-shared";
import {
  TEAM_DESCRIPTION_MAX,
  TEAM_NAME_MAX,
  TEAM_TAG_MAX,
  teamColor,
} from "@/lib/teams-shared";

const SCHOOL_LOCK_NOTE = "Comes from your verified academic email";

/**
 * The team's settings as compact rows, rendered inside the team page's header
 * bubble (there is no separate settings card). Members who can't edit see the
 * same rows without controls — the header is the team's identity either way.
 */
export function TeamSettingsRows({
  teamId,
  name,
  tag,
  description,
  collegeName,
  region,
  timezone,
  discordInviteUrl,
  logoUrl,
  color,
  gameId,
  gameName,
  games,
  countries,
  editable,
}: {
  teamId: string;
  name: string;
  tag: string | null;
  description: string | null;
  collegeName: string | null;
  region: string | null;
  timezone: string | null;
  discordInviteUrl: string | null;
  logoUrl: string | null;
  color: string | null;
  gameId: string | null;
  gameName: string | null;
  /** Selectable games; empty for read-only viewers (never fetched for them). */
  games: GameOption[];
  /** Directory countries for the region picker; empty for read-only viewers. */
  countries: string[];
  editable: boolean;
}) {
  const router = useRouter();
  // Local mirror for a snappy swatch/picker preview; persists on change.
  const [colorValue, setColorValue] = useState(teamColor(color));

  /** FieldRow wants an error message or null — exactly what the action
      returns the contents of. */
  const save =
    (field: keyof Parameters<typeof updateTeamSettings>[1]) =>
    async (value: string) => {
      const result = await updateTeamSettings(teamId, { [field]: value });
      if (!result.ok) return result.error;
      router.refresh();
      return null;
    };

  return (
    <>
      {/* Read-only viewers see the logo on the bubble's header instead — a row
          whose only purpose is an upload button is noise without the button. */}
      {editable ? (
        <AvatarUploadRow
          label="Team logo"
          name={name}
          currentUrl={logoUrl}
          shape="team"
          onSave={async (file) => {
            const body = new FormData();
            body.set("file", file);
            const result = await setTeamLogo(teamId, body);
            if (!result.ok) return result.error;
            router.refresh();
            return null;
          }}
          onRemove={async () => {
            const result = await removeTeamLogo(teamId);
            if (!result.ok) return result.error;
            router.refresh();
            return null;
          }}
        />
      ) : null}

      {editable ? (
        <>
          {/* `?? ""` throughout: the field shows what's stored, so an unset
              value has to be genuinely empty — a placeholder em-dash would be
              real text the member has to delete before typing. */}
          <FieldRow
            label="Name"
            value={name}
            inputLabel="Team name"
            maxLength={TEAM_NAME_MAX}
            onSave={save("name")}
          />
          <FieldRow
            label="Tag"
            value={tag ?? ""}
            inputLabel="Short tag"
            maxLength={TEAM_TAG_MAX}
            placeholder="FLT"
            required={false}
            onSave={save("tag")}
          />
          <FieldRow
            label="About"
            value={description ?? ""}
            inputLabel="What your team is about"
            maxLength={TEAM_DESCRIPTION_MAX}
            placeholder="What your team is about"
            required={false}
            onSave={save("description")}
          />
        </>
      ) : (
        <>
          <BubbleRow label="Name" value={name} />
          {description ? <BubbleRow label="About" value={description} /> : null}
        </>
      )}

      {editable && games.length ? (
        <BubbleRow
          label="Game"
          note="The mark and colour shown on the team's card."
          field={
            <GameSelect
              id={`game-${teamId}`}
              value={gameId ?? games[0].id}
              games={games}
              onChange={(next) => {
                void save("gameId")(next);
              }}
            />
          }
        />
      ) : gameName ? (
        <BubbleRow label="Game" value={gameName} />
      ) : null}

      {editable ? (
        <BubbleRow
          label="Colour"
          note="The accent on the team's card and header."
          field={
            <TeamColorPicker
              value={colorValue}
              onChange={(next) => {
                setColorValue(next);
                void save("color")(next);
              }}
            />
          }
        />
      ) : null}

      <BubbleRow
        label="School"
        value={collegeName ?? "Unaffiliated"}
        locked
        note={SCHOOL_LOCK_NOTE}
        lockTitle={SCHOOL_LOCK_NOTE}
      />

      <RegionRow
        teamId={teamId}
        region={region}
        countries={countries}
        editable={editable}
      />
      <TimezoneRow teamId={teamId} timezone={timezone} editable={editable} />

      {/* Visiting the Discord is the header's button; this row is about
          setting the link, so it only exists for people who may. */}
      {editable ? (
        <FieldRow
          label="Discord invite"
          value={discordInviteUrl ?? ""}
          inputLabel="Discord invite link"
          inputType="url"
          maxLength={300}
          placeholder="https://discord.gg/…"
          required={false}
          onSave={save("discordInviteUrl")}
        />
      ) : null}
    </>
  );
}
