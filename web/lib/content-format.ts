// Blog, event and hero slide shapes and their date formatting. Safe in client and server components;
// the cached fetchers live in lib/content.ts (server only).

export type PostSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  cover_url: string | null;
  /** What readers see: the byline when set, else the writing admin's account name. */
  author_name: string | null;
  byline: string | null;
  published_at: string | null;
  updated_at: string;
};
export type Post = PostSummary & { body_md: string };

export type ClimateEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  is_online: boolean;
  summary: string;
  cover_url: string | null;
  link_url: string | null;
  published: boolean;
};

export type HeroSlide = { id: string; image_url: string; headline: string; subline: string | null; position: number; active: boolean };

const LAGOS = "Africa/Lagos";

export function eventWhen(e: Pick<ClimateEvent, "starts_at" | "ends_at">): string {
  const start = new Date(e.starts_at);
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: LAGOS });
  const time = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", timeZone: LAGOS });
  if (!e.ends_at) return `${day.format(start)}, ${time.format(start)}`;
  const end = new Date(e.ends_at);
  const sameDay = day.format(start) === day.format(end);
  return sameDay ? `${day.format(start)}, ${time.format(start)} to ${time.format(end)}` : `${day.format(start)} to ${day.format(end)}`;
}

export function postDate(iso: string | null): string {
  if (!iso) return "Draft";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: LAGOS }).format(new Date(iso));
}
