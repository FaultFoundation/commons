"use client";

import { useId, useState, useTransition } from "react";

import { setRequirement } from "@/app/(dashboard)/forms/actions";
import { InfoTip } from "@/components/dashboard/bubbles/InfoTip";
import { Switch } from "@/components/dashboard/bubbles/Switch";
import {
  EVENT_PLATFORMS,
  REQUIREMENTS,
  academicConfig,
  discordServerConfig,
  requirementDef,
  type FormItem,
  type RequirementDef,
  type RequirementKind,
} from "@/lib/signup-forms-shared";

const GROUPS: RequirementDef["group"][] = ["Identity", "Discord", "Overwatch", "Platforms"];

/**
 * The bucket list, grouped under plain headings. Each requirement is a single
 * line — its name, an ⓘ with what it asks of players, a Required check and an
 * on/off switch — so the organizer scans names, not paragraphs. The two
 * buckets that need settings (school domains, Discord server) grow them under
 * their line while on. A requirement another one depends on (Blizzard under
 * Overwatch Rank) is locked on while that one is. This is the builder's
 * Verification tab; the Questions tab summarizes it as chips.
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // discord_server can't be switched on without a server id, so the switch
  // opens its settings first and Save is what turns it on.
  const [drafting, setDrafting] = useState<RequirementKind | null>(null);

  const byKind = new Map(items.map((i) => [i.kind, i]));
  const neededBy = (kind: RequirementKind) =>
    REQUIREMENTS.find((d) => byKind.has(d.kind) && d.implies?.includes(kind)) ?? null;

  function apply(
    kind: RequirementKind,
    enabled: boolean,
    required: boolean,
    config?: Record<string, unknown>,
  ) {
    setError(null);
    startTransition(async () => {
      // No config = keep what's stored (setRequirement falls back to it). The
      // action revalidates the builder, so its response already carries the
      // re-rendered page — no router.refresh() round trip after it.
      const result = await setRequirement(formId, kind, { enabled, required, config });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDrafting(null);
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
            const configurable = def.kind === "academic" || def.kind === "discord_server";
            return (
              <div key={def.kind} className="ff-row ff-req">
                <div className="ff-req__name">
                  <span className="ff-row__value">{def.label}</span>
                  <InfoTip
                    label={def.label}
                    text={
                      lockedBy
                        ? `${def.organizerNote} ${lockedBy.label} needs this, so it stays on while that's on.`
                        : def.organizerNote
                    }
                  />
                </div>
                <div className="ff-req__controls">
                  <label className="ff-form-check ff-req__required">
                    <input
                      type="checkbox"
                      checked={item?.required ?? false}
                      disabled={pending || !item}
                      onChange={(e) => apply(def.kind, true, e.target.checked)}
                    />
                    <span>Required</span>
                  </label>
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
                </div>
                {open && configurable ? (
                  <div className="ff-row__editor">
                    <RequirementSettings
                      def={def}
                      item={item}
                      pending={pending}
                      onSave={(config) => apply(def.kind, true, item?.required ?? true, config)}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

/** The settings of the two buckets that have any: school domains, Discord server. */
function RequirementSettings({
  def,
  item,
  pending,
  onSave,
}: {
  def: RequirementDef;
  item: FormItem | null;
  pending: boolean;
  onSave: (config: Record<string, unknown>) => void;
}) {
  const ids = useId();
  const academic = def.kind === "academic" ? academicConfig(item?.config ?? {}) : null;
  const server = def.kind === "discord_server" ? discordServerConfig(item?.config ?? {}) : null;
  const savedDomains = academic?.domains.join(", ") ?? "";

  const [domains, setDomains] = useState(savedDomains);
  const [guildId, setGuildId] = useState(server?.guildId ?? "");
  const [inviteUrl, setInviteUrl] = useState(server?.inviteUrl ?? "");
  const [serverName, setServerName] = useState(server?.serverName ?? "");

  if (def.kind === "academic") {
    return (
      <form
        className="ff-form-editor"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ domains });
        }}
      >
        <div className="ff-auth__field">
          <span className="ff-req__label">
            <label className="ff-auth__label" htmlFor={`${ids}-domains`}>
              Only these school email domains (optional)
            </label>
            <InfoTip
              label="school email domains"
              text="Subdomains count, so cs.uic.edu passes uic.edu. With a list set, players verified through a parent instead of a school email won't pass. Leave it empty to accept any school."
            />
          </span>
          <input
            id={`${ids}-domains`}
            className="ff-auth__input"
            value={domains}
            placeholder="uic.edu, illinois.edu"
            onChange={(e) => setDomains(e.target.value)}
          />
        </div>
        <div className="ff-row__buttons">
          <button
            className="ff-btn ff-btn--sm"
            type="submit"
            disabled={pending || domains.trim() === savedDomains}
          >
            Save Domains
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      className="ff-form-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ guildId, inviteUrl, serverName });
      }}
    >
      <div className="ff-auth__field">
        <span className="ff-req__label">
          <label className="ff-auth__label" htmlFor={`${ids}-guild`}>
            Server ID
          </label>
          <InfoTip
            label="the server ID"
            text="In Discord: Server Settings → Widget shows it, or turn on Developer Mode and right-click the server → Copy Server ID."
          />
        </span>
        <input
          id={`${ids}-guild`}
          className="ff-auth__input"
          value={guildId}
          inputMode="numeric"
          placeholder="123456789012345678"
          onChange={(e) => setGuildId(e.target.value)}
        />
      </div>
      <div className="ff-form-editor__pair">
        <div className="ff-auth__field">
          <label className="ff-auth__label" htmlFor={`${ids}-name`}>
            Server name
          </label>
          <input
            id={`${ids}-name`}
            className="ff-auth__input"
            value={serverName}
            maxLength={100}
            placeholder="Shown to players"
            onChange={(e) => setServerName(e.target.value)}
          />
        </div>
        <div className="ff-auth__field">
          <label className="ff-auth__label" htmlFor={`${ids}-invite`}>
            Invite link
          </label>
          <input
            id={`${ids}-invite`}
            className="ff-auth__input"
            type="url"
            value={inviteUrl}
            placeholder="https://discord.gg/…"
            onChange={(e) => setInviteUrl(e.target.value)}
          />
        </div>
      </div>
      <div className="ff-row__buttons">
        <button className="ff-btn ff-btn--sm" type="submit" disabled={pending || !guildId.trim()}>
          {item ? "Save Server" : "Turn On"}
        </button>
      </div>
    </form>
  );
}
