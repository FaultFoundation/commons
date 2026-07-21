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
};

export default nextConfig;

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
