"use client";

import { createAuthClient } from "better-auth/react";

// Same-origin /api/auth — no baseURL needed.
export const authClient = createAuthClient();
