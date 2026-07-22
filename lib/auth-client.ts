"use client";

import { createAuthClient } from "better-auth/react";
import { genericOAuthClient, twoFactorClient } from "better-auth/client/plugins";

// Same-origin /api/auth — no baseURL needed. The generic-OAuth plugin types
// authClient.oauth2.link(), which is how Battle.net links (it has no built-in
// better-auth provider, so linkSocial() doesn't know about it).
//
// twoFactorClient is passed *without* onTwoFactorRedirect/twoFactorPage on
// purpose. Those options exist to bounce the browser to a dedicated challenge
// page; AuthForm instead reads `twoFactorRedirect` off the sign-in response and
// swaps in the challenge step in place, which keeps the pending `?next=`
// destination in component state rather than threading it through a redirect.
export const authClient = createAuthClient({
  plugins: [genericOAuthClient(), twoFactorClient()],
});
