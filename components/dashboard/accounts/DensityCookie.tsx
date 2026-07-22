"use client";

import { useEffect } from "react";

import { DENSITY_COOKIE, DENSITY_COOKIE_MAX_AGE, type Density } from "@/lib/density";

/**
 * Primes the ff-density cookie from the value the shell resolved.
 *
 * A server component can't call cookies().set(), so the first visit after
 * sign-in (or after the cookie expires) reads D1 and lands here to write the
 * cache. setDensity writes the cookie itself, so this is only ever the
 * cold-start path — it re-runs whenever the resolved value changes so a stale
 * cookie can't survive a preference set on another device.
 */
export function DensityCookie({ value }: { value: Density }) {
  useEffect(() => {
    document.cookie = `${DENSITY_COOKIE}=${value}; path=/; max-age=${DENSITY_COOKIE_MAX_AGE}; samesite=lax`;
  }, [value]);

  return null;
}
