import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const BASE = "https://commons.fault.foundation";

export default function sitemap(): MetadataRoute.Sitemap {
  // Only the Commons landing page is indexable — login, signup, and the
  // dashboard all set robots: { index: false }.
  return [{ url: `${BASE}/` }];
}
