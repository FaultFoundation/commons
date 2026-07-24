"use client";

import { useRouter } from "next/navigation";

import {
  adminRemoveTeamLogo,
  adminSetTeamLogo,
  adminUpdateTeamSettings,
} from "@/app/admin/teams/actions";
import { AvatarUploadRow } from "@/components/dashboard/accounts/AvatarUploadRow";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { FieldRow } from "@/components/dashboard/bubbles/FieldRow";
import {
  TEAM_DESCRIPTION_MAX,
  TEAM_NAME_MAX,
  TEAM_TAG_MAX,
} from "@/lib/teams-shared";

/**
 * A team's identity + settings for the staff admin panel. Mirrors the member's
 * TeamSettingsRows but wires every control to the staff actions (which gate on
 * `manageTeams` instead of team membership). Region and timezone are plain
 * fields here rather than the member pickers — a staff override is a rare, know-
 * what-you're-doing edit, and the values are still validated server-side.
 *
 * `editable` is false for a moderator (viewTeams without manageTeams): they see
 * the same identity read-only.
 */
export function AdminTeamSettings({
  teamId,
  name,
  tag,
  description,
  collegeName,
  region,
  timezone,
  discordInviteUrl,
  logoUrl,
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
  editable: boolean;
}) {
  const router = useRouter();

  const save =
    (field: keyof Parameters<typeof adminUpdateTeamSettings>[1]) =>
    async (value: string) => {
      const result = await adminUpdateTeamSettings(teamId, { [field]: value });
      if (!result.ok) return result.error;
      router.refresh();
      return null;
    };

  return (
    <>
      {editable ? (
        <AvatarUploadRow
          label="Team logo"
          name={name}
          currentUrl={logoUrl}
          shape="team"
          onSave={async (file) => {
            const body = new FormData();
            body.set("file", file);
            const result = await adminSetTeamLogo(teamId, body);
            if (!result.ok) return result.error;
            router.refresh();
            return null;
          }}
          onRemove={async () => {
            const result = await adminRemoveTeamLogo(teamId);
            if (!result.ok) return result.error;
            router.refresh();
            return null;
          }}
        />
      ) : null}

      {editable ? (
        <>
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
            inputLabel="What the team is about"
            maxLength={TEAM_DESCRIPTION_MAX}
            placeholder="What the team is about"
            required={false}
            onSave={save("description")}
          />
          <FieldRow
            label="Region"
            value={region ?? ""}
            inputLabel="Region"
            maxLength={40}
            placeholder="California, United States"
            required={false}
            onSave={save("region")}
          />
          <FieldRow
            label="Timezone"
            value={timezone ?? ""}
            inputLabel="Timezone"
            maxLength={60}
            placeholder="America/Los_Angeles"
            required={false}
            onSave={save("timezone")}
          />
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
        </>
      ) : (
        <>
          <BubbleRow label="Name" value={name} />
          {tag ? <BubbleRow label="Tag" value={tag} /> : null}
          {description ? <BubbleRow label="About" value={description} /> : null}
          <BubbleRow label="Region" value={region ?? "—"} />
          <BubbleRow label="Timezone" value={timezone ?? "—"} />
          {discordInviteUrl ? (
            <BubbleRow label="Discord invite" value={discordInviteUrl} />
          ) : null}
        </>
      )}

      <BubbleRow label="School" value={collegeName ?? "Unaffiliated"} />
    </>
  );
}
