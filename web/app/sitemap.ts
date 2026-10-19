import type { MetadataRoute } from "next";

import { getPosts } from "@/lib/content";
import { SITE_URL } from "@/lib/site";

// Public pages only. Prices change on the landing page and the guide, so they are marked as changing daily.
// Every published blog post is listed with its last edit.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getPosts(50);
  return [
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/events`, changeFrequency: "weekly", priority: 0.6 },
    ...posts.map((p) => ({ url: `${SITE_URL}/blog/${p.slug}`, lastModified: p.updated_at, changeFrequency: "monthly" as const, priority: 0.6 })),
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/guide`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/signup`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/login`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
