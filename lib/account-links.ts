import { cache } from "react";
import { eq } from "drizzle-orm";

import { account } from "@/db/schema";
import { getDb } from "@/lib/db";

/**
 * Non-secret Better Auth account metadata used to render linked-provider state.
 * Tokens, password hashes, and other credentials are deliberately not selected.
 */
export async function getAccountLinks(userId: string) {
  return getDb()
    .select({
      providerId: account.providerId,
      accountId: account.accountId,
      scope: account.scope,
    })
    .from(account)
    .where(eq(account.userId, userId));
}

/** One account metadata read shared by all server components in a request. */
export const getAccountLinksCached = cache(getAccountLinks);