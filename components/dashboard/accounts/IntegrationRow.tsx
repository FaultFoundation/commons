"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import {
  LinkProviderButton,
  type LinkableProvider,
} from "@/components/dashboard/LinkProviderButton";
import { authClient } from "@/lib/auth-client";

/**
 * One connected-account row (Discord, Blizzard, …): link when disconnected,
 * unlink when connected. Unlinking is a sensitive action, so better-auth
 * requires a fresh session for it.
 */
export function IntegrationRow({
  provider,
  label,
  linked,
  handle,
  enabled,
  note,
  linkLabel = "Connect",
  callbackURL = "/account/",
}: {
  provider: LinkableProvider;
  /** Row label, e.g. "Discord". */
  label: string;
  linked: boolean;
  /** Captured at link time; null for links made before that shipped. */
  handle: string | null;
  /** Server-decided: this provider's OAuth secrets are configured. */
  enabled: boolean;
  /** Fine print under the value — e.g. the Discord server-membership hint. */
  note?: string;
  /** Text on the connect button. */
  linkLabel?: string;
  /** Where the provider returns the member — pass the page this row is on. */
  callbackURL?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onUnlink() {
    if (pending) return;
    setError(null);
    setPending(true);
    const result = await authClient.unlinkAccount({ providerId: provider });
    setPending(false);
    if (result.error) {
      // 403 = the session isn't fresh enough for this sensitive action.
      setError(
        result.error.status === 403
          ? "For security, sign out and back in, then try unlinking again."
          : (result.error.message ?? "Something went wrong. Please try again."),
      );
      return;
    }
    router.refresh();
  }

  if (!linked) {
    return (
      <BubbleRow
        label={label}
        value="Not connected"
        note={enabled ? note : "Unavailable right now"}
        action={
          enabled ? (
            <LinkProviderButton
              provider={provider}
              label={linkLabel}
              callbackURL={callbackURL}
            />
          ) : undefined
        }
      />
    );
  }

  return (
    <BubbleRow
      label={label}
      value={`${handle ?? "Connected"} ✓`}
      note={note}
      action={
        <button
          className="ff-btn ff-btn--outline ff-btn--sm"
          type="button"
          onClick={onUnlink}
          disabled={pending}
        >
          Unlink
        </button>
      }
    >
      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : undefined}
    </BubbleRow>
  );
}
