import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every URL ends in "/", matching fault.foundation.
  trailingSlash: true,
  // But handle the actual redirect in middleware.ts: Next's built-in one
  // also rewrites /api/* to trailing-slash URLs, which better-auth's router
  // 404s (breaking sign-in/out under `next dev`). Middleware exempts /api/.
  skipTrailingSlashRedirect: true,
  // Markup uses plain <img>; no Next image optimization.
  images: { unoptimized: true },
  // Skip the in-build type-check and lint to shorten the deploy: `npx tsc
  // --noEmit` is the verification gate we run separately, and ESLint isn't
  // installed (see CLAUDE.md), so `next build` re-running them only adds time.
  // Keep running `npx tsc --noEmit` before deploying — it's still the gate.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
