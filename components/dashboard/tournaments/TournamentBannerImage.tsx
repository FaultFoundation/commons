"use client";

import { useState } from "react";

/** Repair artwork URLs saved before the LeagueOS storage namespace fix. */
export function normalizeTournamentArtwork(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "images.leagueos.gg" && parsed.pathname.startsWith("/leagues/")) {
      parsed.pathname = parsed.pathname.replace(/^\/leagues\//, "/league/");
      return parsed.href;
    }
  } catch { /* Leave other providers' URLs unchanged. */ }
  return url;
}

export function TournamentBannerImage({ url, eager = false, className = "ff-tcard__banner-img" }: {
  url: string | null;
  eager?: boolean;
  className?: string;
}) {
  const src = url ? normalizeTournamentArtwork(url) : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return null;
  return <img className={className} src={src} alt="" width={1280} height={720}
    loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : undefined}
    decoding="async" onError={() => setFailedSrc(src)} />;
}
