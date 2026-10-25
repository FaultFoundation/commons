"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Routes that render as pages of their own, with the standard footer but no
 * site header. A public sign-up form (/f/<id>/) is a link an organizer hands to
 * players who may never have seen the portal, so the site's nav has nothing to
 * offer them there. The bare /f/ path (a 404) keeps the header.
 */
const STANDALONE = /^\/f\/[^/]+/;

/**
 * Drops the site header on standalone routes. The decision is made here, on the
 * client's pathname, rather than in the root layout: reading the request there
 * (headers()) would make every route dynamic, including the static landing
 * page. usePathname is available during the server render, so the header is
 * absent from the first paint rather than removed after hydration.
 */
export function SiteHeaderGate({ children }: { children: ReactNode }) {
  return STANDALONE.test(usePathname()) ? null : children;
}
