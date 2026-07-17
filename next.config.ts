import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // WordPress permalinks all end in "/" — keep /about/ style URLs.
  trailingSlash: true,
  // But handle the actual redirect in middleware.ts: Next's built-in one
  // also rewrites /api/* to trailing-slash URLs, which better-auth's router
  // 404s (breaking sign-in/out under `next dev`). Middleware exempts /api/.
  skipTrailingSlashRedirect: true,
  // Markup uses plain <img> ported from WP; no Next image optimization.
  images: { unoptimized: true },
  // Formerly public/_redirects (Pages-style); served by the app now that the
  // Worker runs OpenNext instead of bare static assets.
  async redirects() {
    return [
      {
        source: "/sitemap_index.xml",
        destination: "/sitemap.xml",
        permanent: true,
      },
      {
        source: "/home",
        destination: "/",
        permanent: true,
      },
      // pre-rename slug of the Discord post (301'd on the live WP site too)
      {
        source: "/2025/12/taboo-discord-and-sharing-personal-information",
        destination: "/2025/12/discord-and-sharing-personal-information/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
