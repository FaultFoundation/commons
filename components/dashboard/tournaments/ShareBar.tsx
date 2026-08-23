"use client";

import { useState } from "react";

/** simple-icons brand glyphs (24×24), currentColor. */
const GLYPH: Record<string, string> = {
  x: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  bluesky:
    "M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z",
  linkedin:
    "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z",
  facebook:
    "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
};

/**
 * A share bar in the marketing site's social style: flat gray icons (no button
 * bubbles) with a divider between the native Share action and the platforms.
 * X / Bluesky / LinkedIn / Facebook open prefilled share intents; Discord and
 * Instagram have no web share, so they copy the link to paste; the tray icon
 * opens the OS share sheet (or copies) as the catch-all. Every target carries
 * the default `message` plus the public tournament link.
 */
export function ShareBar({
  url,
  title,
  message,
}: {
  url: string;
  title: string;
  message: string;
}) {
  const [copied, setCopied] = useState(false);
  const enc = encodeURIComponent;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  }

  async function nativeShare() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text: message, url });
      } catch {
        /* dismissed */
      }
    } else {
      void copy();
    }
  }

  const intents = [
    { key: "x", label: "Share on X", href: `https://twitter.com/intent/tweet?text=${enc(message)}&url=${enc(url)}` },
    { key: "bluesky", label: "Share on Bluesky", href: `https://bsky.app/intent/compose?text=${enc(`${message} ${url}`)}` },
    { key: "linkedin", label: "Share on LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}` },
    { key: "facebook", label: "Share on Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
  ] as const;

  return (
    <div className="ff-share" role="group" aria-label="Share this tournament">
      <button
        className="ff-share__icon"
        type="button"
        onClick={nativeShare}
        title="Share"
        aria-label="Share"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
          <path d="M12 15V3" />
          <path d="M8 7l4-4 4 4" />
        </svg>
      </button>

      <span className="ff-share__divider" aria-hidden="true" />

      {intents.map((t) => (
        <a
          key={t.key}
          className="ff-share__icon"
          href={t.href}
          target="_blank"
          rel="noreferrer noopener"
          title={t.label}
          aria-label={t.label}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d={GLYPH[t.key]} />
          </svg>
        </a>
      ))}

      {copied ? (
        <span className="ff-share__copied" role="status">
          Link copied
        </span>
      ) : null}
    </div>
  );
}
