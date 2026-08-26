"use client";

import { useEffect, useRef, useState } from "react";

/** The full URL for an invite token. Built in the browser so the component
    doesn't need the deployment's origin threaded through from the server. */
export function inviteUrl(token: string): string {
  if (typeof window === "undefined") return `/join/${token}/`;
  return `${window.location.origin}/join/${token}/`;
}

/**
 * One-click "copy the invite link". Falls back to revealing a selectable
 * input when the Clipboard API is unavailable or blocked (insecure origin,
 * denied permission) — the link must never become uncopyable.
 */
export function CopyInviteButton({
  token,
  label = "Copy Invite Link",
  small,
}: {
  token: string;
  label?: string;
  small?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (fallback) inputRef.current?.select();
  }, [fallback]);

  async function onCopy() {
    const url = inviteUrl(token);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setFallback(false);
    } catch {
      setFallback(true);
    }
  }

  return (
    <>
      <button
        className={
          small
            ? "ff-btn ff-btn--outline ff-btn--sm"
            : "ff-btn ff-btn--outline"
        }
        type="button"
        onClick={onCopy}
      >
        {copied ? "Copied!" : label}
      </button>
      {fallback ? (
        <input
          ref={inputRef}
          className="ff-auth__input ff-copy__input"
          type="text"
          value={inviteUrl(token)}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
          aria-label="Invite link"
        />
      ) : null}
    </>
  );
}
