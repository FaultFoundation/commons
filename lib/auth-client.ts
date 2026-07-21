"use client";

import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";

// Same-origin /api/auth — no baseURL needed. The generic-OAuth plugin types
// authClient.oauth2.link(), which is how Battle.net links (it has no built-in
// better-auth provider, so linkSocial() doesn't know about it).
export const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
});
