"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setRequirement } from "@/app/(dashboard)/forms/actions";
import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { Switch } from "@/components/dashboard/bubbles/Switch";
import {
  EVENT_PLATFORMS,
  REQUIREMENTS,
  academicConfig,
  discordServerConfig,
  requirementDef,
  requirementSummary,
  type FormItem,
  type RequirementDef,
  type RequirementKind,
} from "@/lib/signup-forms-shared";

const GROUPS: RequirementDef["group"][] = ["Identity", "Discord", "Overwatch", "Platforms"];

/**
 * The bucket list: every requirement a form can ask for, each a switch. On
 * rows grow a Required/Optional choice and, for the two that need one, their
 * settings. A requirement another one depends on (Blizzard under Overwatch
 * Rank) is locked on while that one is.
 */
export function RequirementsEditor({
  formId,
  items,
  eventPlatform,
}: {
  formId: string;
  items: FormItem[];
  eventPlatform: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // discord_server can't be switched on without a server id, so the switch
  // opens its settings first and Save is what turns it on.
  const [drafting, setDrafting] = useState<RequirementKind | null>(null);

  const byKind = new Map(items.map((i) => [i.kind, i]));
  const neededBy = (kind: RequirementKind) =>
    REQUIREMENTS.find((d) => byKind.has(d.kind) && d.implies?.includes(kind)) ?? null;

  function apply(kind: RequirementKind, enabled: boolean, required: boolean, config?: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      const result = await setRequirement(formId, kind, { enabled, required, config });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDrafting(null);
      router.refresh();
    });
  }

  const platform = EVENT_PLATFORMS.find((p) => p.value === eventPlatform);
  const suggested =
    platform?.account && !byKind.has(platform.account) ? requirementDef(platform.account) : null;

  return (
    <>
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}
      {suggested ? (
        <p className="ff-auth__hint">
          Your event runs on {platform?.label}. Turn on <strong>{suggested.label}</strong> to
          get a list you can paste into {platform?.label}.
        </p>
      ) : null}
      {GROUPS.map((group) => (
        <div key={group} className="ff-form-group">
          <h3 className="ff-form-group__title">{group}</h3>
          {REQUIREMENTS.filter((d) => d.group === group).map((def) => {
            const item = byKind.get(def.kind) ?? null;
            const lockedBy = item ? neededBy(def.kind) : null;
            const open = Boolean(item) || drafting === def.kind;
            const summary = item ? requirementSummary(item) : null;
            const value = !item
              ? "Off"
              : `${item.required ? "Required" : "Optional"}${summary ? ` · ${summary}` : ""}`;
            return (
              <BubbleRow
                key={def.kind}
                label={def.label}
                value={value}
                note={lockedBy ? `Needed by ${lockedBy.label}.` : def.organizerNote}
                action={
                  <Switch
                    checked={open}
                    disabled={pending || Boolean(lockedBy)}
                    label={def.label}
                    onChange={(next) => {
                      if (!next) {
                        if (item) apply(def.kind, false, true);
                        else setDrafting(null);
                        return;
                      }
                      if (def.kind === "discord_server") setDrafting(def.kind);
                      else apply(def.kind, true, true);
                    }}
                  />
                }
              >
                {open ? (
                  <RequirementSettings
                    def={def}
                    item={item}
                    pending={pending}
                    onSave={(required, config) => apply(def.kind, true, required, config)}
                  />
                ) : undefined}
              </BubbleRow>
            );
          })}
        </div>
      ))}
    </>
  );
}

function RequirementSettings({
  def,
  item,
  pending,
  onSave,
}: {
  def: RequirementDef;
  item: FormItem | null;
  pending: boolean;
  onSave: (required: boolean, config?: Record<string, unknown>) => void;
}) {
  const required = item?.required ?? true;
  const academic = def.kind === "academic" ? academicConfig(item?.config ?? {}) : null;
  const server = def.kind === "discord_server" ? discordServerConfig(item?.config ?? {}) : null;

  const [domains, setDomains] = useState(academic?.domains.join(", ") ?? "");
  const [guildId, setGuildId] = useState(server?.guildId ?? "");
  const [inviteUrl, setInviteUrl] = useState(server?.inviteUrl ?? "");
  const [serverName, setServerName] = useState(server?.serverName ?? "");

  const config =
    def.kind === "academic"
      ? { domains }
      : def.kind === "discord_server"
        ? { guildId, inviteUrl, serverName }
        : undefined;

  return (
    <div className="ff-form-editor">
      <div className="ff-segment" role="group" aria-label={`${def.label}: required or optional`}>
        <button
          type="button"
          className="ff-segment__btn"
          aria-pressed={required}
          disabled={pending || !item}
          onClick={() => onSave(true, config)}
        >
          Required
        </button>
        <button
          type="button"
          className="ff-segment__btn"
          aria-pressed={!required}
          disabled={pending || !item}
          onClick={() => onSave(false, config)}
        >
          Optional
        </button>
      </div>
      <p className="ff-row__hint">
        {required
          ? "Players can't sign up until this is done."
          : "Shared when players have it; never blocks a sign-up."}
      </p>

      {def.kind === "academic" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(required, config);
          }}
        >
          <label className="ff-auth__field">
            <span className="ff-auth__label">Only accept these school email domains (optional)</span>
            <input
              className="ff-auth__input"
              value={domains}
              placeholder="uic.edu, illinois.edu"
              onChange={(e) => setDomains(e.target.value)}
            />
          </label>
          <p className="ff-row__hint">
            Subdomains count (cs.uic.edu passes uic.edu). With a list set, players verified
            through a parent instead of a school email won&rsquo;t pass.
          </p>
          <div className="ff-row__buttons">
            <button
              className="ff-btn ff-btn--sm"
              type="submit"
              disabled={pending || domains.trim() === (academic?.domains.join(", ") ?? "")}
            >
              Save Domains
            </button>
          </div>
        </form>
      ) : null}

      {def.kind === "discord_server" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(required, config);
          }}
        >
          <label className="ff-auth__field">
            <span className="ff-auth__label">Server ID</span>
            <input
              className="ff-auth__input"
              value={guildId}
              inputMode="numeric"
              placeholder="123456789012345678"
              onChange={(e) => setGuildId(e.target.value)}
            />
          </label>
          <p className="ff-row__hint">
            In Discord: Server Settings → Widget shows it, or turn on Developer Mode and
            right-click the server → Copy Server ID.
          </p>
          <div className="ff-form-editor__pair">
            <label className="ff-auth__field">
              <span className="ff-auth__label">Server name</span>
              <input
                className="ff-auth__input"
                value={serverName}
                maxLength={100}
                placeholder="Shown to players"
                onChange={(e) => setServerName(e.target.value)}
              />
            </label>
            <label className="ff-auth__field">
              <span className="ff-auth__label">Invite link</span>
              <input
                className="ff-auth__input"
                type="url"
                value={inviteUrl}
                placeholder="https://discord.gg/…"
                onChange={(e) => setInviteUrl(e.target.value)}
              />
            </label>
          </div>
          <div className="ff-row__buttons">
            <button className="ff-btn ff-btn--sm" type="submit" disabled={pending || !guildId.trim()}>
              {item ? "Save Server" : "Turn On"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
