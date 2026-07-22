"use client";

import { useRouter } from "next/navigation";

import { updateTeamSettings } from "@/app/teams/actions";
import { InlineEditRow } from "@/components/dashboard/accounts/InlineEditRow";
import {
  TEAM_DESCRIPTION_MAX,
  TEAM_NAME_MAX,
  TEAM_TAG_MAX,
} from "@/lib/teams-shared";

/**
 * Team settings as edit-in-place rows, the same shape as the Account tab's
 * profile rows. Region/timezone are here because the LFG matcher reads them,
 * not just because they're nice to display.
 */
export function TeamSettingsRows({
  teamId,
  name,
  tag,
  description,
  region,
  timezone,
  discordInviteUrl,
}: {
  teamId: string;
  name: string;
  tag: string | null;
  description: string | null;
  region: string | null;
  timezone: string | null;
  discordInviteUrl: string | null;
}) {
  const router = useRouter();

  /** InlineEditRow wants an error message or null; the actions already
      return exactly that shape's contents. */
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
      <InlineEditRow
        label="Region"
        value={region ?? "—"}
        inputLabel="Region"
        maxLength={40}
        placeholder="NA West"
        onSave={save("region")}
      />
      <InlineEditRow
        label="Timezone"
        value={timezone ?? "—"}
        inputLabel="IANA timezone"
        maxLength={60}
        placeholder="America/Los_Angeles"
        onSave={save("timezone")}
      />
      <InlineEditRow
        label="Discord invite"
        value={discordInviteUrl ?? "—"}
        inputLabel="Discord invite link"
        inputType="url"
        maxLength={300}
        placeholder="https://discord.gg/…"
        onSave={save("discordInviteUrl")}
      />
    </>
  );
}
