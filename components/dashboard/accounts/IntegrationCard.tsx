"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { LinkProviderButton } from "@/components/dashboard/LinkProviderButton";
import { ProviderLogo } from "@/components/dashboard/accounts/ProviderLogo";
import { authClient } from "@/lib/auth-client";
import type { LinkableProvider } from "@/lib/integrations-shared";

/**
 * One connected-account card: link when disconnected, unlink when connected.
 * Sized as an even block so a set of them tiles into .ff-integrations rather
 * than each stretching the full width of its bubble.
 *
 * The provider name is the card's heading; connection state is secondary text
 * beneath it. Unlinking is a sensitive action, so better-auth requires a fresh
 * session for it.
 */
export function IntegrationCard({
  provider,
  label,
  linked,
  handle,
  enabled,
  reachable = null,
  note,
  linkLabel,
  callbackURL = "/account/",
}: {
  provider: LinkableProvider;
  /** Provider name, shown as the card heading, e.g. "Discord". */
  label: string;
  linked: boolean;
  /** Captured at link time; null for links made before that shipped. */
  handle: string | null;
  /** Server-decided: this provider's OAuth secrets are configured. */
  enabled: boolean;
  /** Public-API reachability (FACEIT/start.gg): false = private account, which
      we flag; true/null = fine, no message. */
  reachable?: boolean | null;
  /** Extra fine print — e.g. the Discord server-membership hint. */
  note?: string;
  /** Text on the connect button, e.g. "Link Discord". */
  linkLabel: string;
  /** Where the provider returns the member — pass the page this card is on. */
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

  const status = linked
    ? `${handle ?? "Connected"} ✓`
    : enabled
      ? "Not connected"
      : "Unavailable right now";

  return (
    <div className="ff-integration">
      <div className="ff-integration__head">
        <ProviderLogo provider={provider} />
        <span className="ff-integration__name">{label}</span>
      </div>

      <p className="ff-integration__status">{status}</p>
      {note ? <p className="ff-integration__note">{note}</p> : null}

      {linked && reachable === false ? (
        <p className="ff-integration__warn" role="status">
          We couldn&rsquo;t read this account through {label}&rsquo;s API. Set your
          {" "}
          {label} profile to public so it can sync with the Commons Project.
        </p>
      ) : null}

      {error ? (
        <div className="ff-auth__error" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <div className="ff-integration__action">
        {linked ? (
          <button
            className="ff-btn ff-btn--outline ff-btn--sm"
            type="button"
            onClick={onUnlink}
            disabled={pending}
          >
            Unlink
          </button>
        ) : enabled ? (
          <LinkProviderButton
            provider={provider}
            label={linkLabel}
            callbackURL={callbackURL}
          />
        ) : (
          <button className="ff-btn ff-btn--outline" type="button" disabled>
            {linkLabel}
          </button>
        )}
      </div>
    </div>
  );
}
