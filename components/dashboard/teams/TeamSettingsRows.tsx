"use client";

import { useRouter } from "next/navigation";

import { removeTeamLogo, setTeamLogo, updateTeamSettings } from "@/app/teams/actions";
import { AvatarUploadRow } from "@/components/dashboard/accounts/AvatarUploadRow";
import { InlineEditRow } from "@/components/dashboard/accounts/InlineEditRow";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { RegionRow } from "@/components/dashboard/teams/RegionRow";
import { TimezoneRow } from "@/components/dashboard/teams/TimezoneRow";
import {
  TEAM_DESCRIPTION_MAX,
  TEAM_NAME_MAX,
  TEAM_TAG_MAX,
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
  /** Directory countries for the region picker; empty for read-only viewers. */
  countries: string[];
  editable: boolean;
}) {
  const router = useRouter();

  /** InlineEditRow wants an error message or null — exactly what the action
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
          <InlineEditRow
            label="Name"
            value={name}
            inputLabel="Team name"
            maxLength={TEAM_NAME_MAX}
            onSave={save("name")}
          />
          <InlineEditRow
            label="Tag"
            value={tag ?? "—"}
            inputLabel="Short tag"
            maxLength={TEAM_TAG_MAX}
            placeholder="FLT"
            onSave={save("tag")}
          />
          <InlineEditRow
            label="About"
            value={description ?? "—"}
            inputLabel="What your team is about"
            maxLength={TEAM_DESCRIPTION_MAX}
            onSave={save("description")}
          />
        </>
      ) : (
        <>
          <BubbleRow label="Name" value={name} />
          {description ? <BubbleRow label="About" value={description} /> : null}
        </>
      )}

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
        <InlineEditRow
          label="Discord invite"
          value={discordInviteUrl ?? "—"}
          inputLabel="Discord invite link"
          inputType="url"
          maxLength={300}
          placeholder="https://discord.gg/…"
          onSave={save("discordInviteUrl")}
        />
      ) : null}
    </>
  );
}
