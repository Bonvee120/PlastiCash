import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// Public pages are indexed; the logged-in areas, the ops portal and auth routes are not. (The ops portal also sends
// noindex; robots.txt is not security, the API checks roles on every call.)
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/app", "/collector", "/ops-portal", "/auth", "/signup/details"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
