import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pure static export for Cloudflare Pages.
  output: "export",
  // WordPress permalinks all end in "/" — emit out/about/index.html etc.
  trailingSlash: true,
  // Required for `output: export`; markup uses plain <img> ported from WP anyway.
  images: { unoptimized: true },
};

export default nextConfig;
