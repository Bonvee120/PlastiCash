import { cacheLife, cacheTag } from "next/cache";

import type { ClimateEvent, HeroSlide, Post, PostSummary } from "@/lib/content-format";

export type { ClimateEvent, HeroSlide, Post, PostSummary } from "@/lib/content-format";
export { eventWhen, postDate } from "@/lib/content-format";

// Blog, climate events and hero slides for the public pages (api/app/routers/content.py). Fetched without cookies and
// cached, so /, /blog and /events are prerendered; the admin actions expire the tags when something is published.

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

async function publicGet<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; status: number }> {
  try {
    // no-store: the "use cache" layer above is the only cache (expired by tags); a second fetch cache could keep stale data.
    const response = await fetch(`${API_URL}${path}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    return response.ok ? { ok: true, data: (await response.json()) as T } : { ok: false, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export async function getPosts(limit = 12): Promise<PostSummary[]> {
  "use cache";
  cacheTag("blog");
  const result = await publicGet<PostSummary[]>(`/blog?limit=${limit}`);
  if (result.ok) cacheLife("hours");
  else cacheLife("seconds");
  return result.ok ? result.data : [];
}

// null: no such published post (404 page); throws on other failures so the error page shows instead of a false 404.
export async function getPost(slug: string): Promise<Post | null> {
  "use cache";
  cacheTag("blog", `blog-${slug}`);
  const result = await publicGet<Post>(`/blog/${encodeURIComponent(slug)}`);
  if (!result.ok && result.status === 404) {
    cacheLife("minutes");
    return null;
  }
  if (!result.ok) {
    cacheLife("seconds");
    throw new Error(`GET /blog/${slug} failed: ${result.status}`);
  }
  cacheLife("hours");
  return result.data;
}

export async function getEvents(when: "upcoming" | "past" = "upcoming", limit = 20): Promise<ClimateEvent[]> {
  "use cache";
  cacheTag("events");
  const result = await publicGet<ClimateEvent[]>(`/events?when=${when}&limit=${limit}`);
  // An event becomes "past" when it ends, so refresh at least hourly.
  if (result.ok) cacheLife("hours");
  else cacheLife("seconds");
  return result.ok ? result.data : [];
}

export async function getHeroSlides(): Promise<HeroSlide[]> {
  "use cache";
  cacheTag("hero");
  const result = await publicGet<HeroSlide[]>("/hero-slides");
  if (result.ok) cacheLife("hours");
  else cacheLife("seconds");
  return result.ok ? result.data : [];
}
