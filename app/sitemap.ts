import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const BASE = "https://fault.foundation";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "/",
    "/about/",
    "/news/",
    "/policies/",
    "/bylaws/",
    "/disciplinary-policy/",
    "/privacy-policy/",
    "/roadmap/",
    "/overfault-rulebook/",
    "/2025/11/the-fault-foundation-who-we-are-and-whats-next/",
    "/2025/12/discord-and-sharing-personal-information/",
    "/2026/01/community-verification/",
    "/author/admin_saivw2jq/",
    "/tag/discussion/",
    "/tag/future/",
    "/tag/news/",
    "/tag/update/",
  ];
  return routes.map((route) => ({ url: `${BASE}${route}` }));
}
