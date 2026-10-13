import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

// Public pages only. Prices change on the landing page and the guide, so they are marked as changing daily.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/guide`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/signup`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/login`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
