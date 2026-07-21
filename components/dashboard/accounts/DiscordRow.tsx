"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BubbleRow } from "@/components/dashboard/bubbles/BubbleRow";
import { LinkDiscordButton } from "@/components/dashboard/LinkDiscordButton";
import { authClient } from "@/lib/auth-client";

export function DiscordRow({
  linked,
  username,
  discordEnabled,
  callbackURL = "/account/",
}: {
  linked: boolean;
  /** Captured at link time; null for links made before that shipped. */
  username: string | null;
  /** Server-decided: Discord OAuth secrets are configured. */
  discordEnabled: boolean;
  /** Where Discord returns the member — pass the page this row is on. */
  callbackURL?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onUnlink() {
    if (pending) return;
    setError(null);
    setPending(true);
    const result = await authClient.unlinkAccount({ providerId: "discord" });
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
        label="Discord"
        value="Not connected"
        note={discordEnabled ? undefined : "Unavailable right now"}
        action={
          discordEnabled ? (
            <LinkDiscordButton callbackURL={callbackURL} />
          ) : undefined
        }
      />
    );
  }

  return (
    <BubbleRow
      label="Discord"
      value={`${username ?? "Connected"} ✓`}
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
