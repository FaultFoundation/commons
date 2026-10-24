"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Copy a share link (`path`, made absolute in the browser so no origin has to
 * be threaded through from the server) or a block of text (a platform list).
 * Like CopyInviteButton, a blocked Clipboard API reveals a selectable field
 * instead, so the value can never become uncopyable.
 */
export function CopyButton({
  path,
  text,
  label,
  small,
}: {
  path?: string;
  text?: string;
  label: string;
  small?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  const value = () =>
    path != null
      ? typeof window === "undefined"
        ? path
        : `${window.location.origin}${path}`
      : (text ?? "");

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (fallback) fieldRef.current?.select();
  }, [fallback]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value());
      setCopied(true);
      setFallback(false);
    } catch {
      setFallback(true);
    }
  }

  return (
    <>
      <button
        className={small ? "ff-btn ff-btn--outline ff-btn--sm" : "ff-btn ff-btn--outline"}
        type="button"
        onClick={onCopy}
      >
        {copied ? "Copied!" : label}
      </button>
      {fallback ? (
        <textarea
          ref={fieldRef}
          className="ff-auth__input ff-copy__input"
          value={value()}
          rows={path != null ? 1 : 6}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
          aria-label={label}
        />
      ) : null}
    </>
  );
}
