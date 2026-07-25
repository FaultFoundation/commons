"use server";

import { headers } from "next/headers";

import { consumeConsentToken } from "@/lib/parental-consent";

export type ConsentActionResult = { ok: true } | { ok: false; error: string };

/**
 * Record a parent/guardian's consent from the emailed link. Public — the parent
 * has no account — so authorization is the unguessable token itself, consumed
 * server-side. Requires an explicit click (never a GET side effect) so an email
 * scanner prefetching the link can't approve on the parent's behalf.
 */
export async function confirmParentalConsent(
  token: string,
): Promise<ConsentActionResult> {
  const h = await headers();
  const ip =
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  return consumeConsentToken(token, ip, h);
}
