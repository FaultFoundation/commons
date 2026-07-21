import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard/", "/login/", "/signup/", "/api/"],
      },
    ],
    sitemap: "https://commons.fault.foundation/sitemap.xml",
  };
}
