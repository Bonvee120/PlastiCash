import { CalendarDays, ExternalLink, Globe, MapPin, Newspaper } from "lucide-react";
import Link from "next/link";

import { eventWhen, postDate, type ClimateEvent, type PostSummary } from "@/lib/content";
import { cn } from "@/lib/utils";

function cover(url: string, width: number, height: number) {
  return url.includes("/upload/") ? url.replace("/upload/", `/upload/f_auto,q_auto,c_fill,g_auto,w_${width},h_${height}/`) : url;
}

export function PostCard({ post, large = false }: { post: PostSummary; large?: boolean }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-raised"
    >
      <div className={cn("relative w-full overflow-hidden bg-mint", large ? "aspect-[2/1]" : "aspect-[16/9]")}>
        {post.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves a resized, cropped WebP
          <img
            src={cover(post.cover_url, large ? 1200 : 720, large ? 600 : 405)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <Newspaper className="size-10 text-primary/40" aria-hidden />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <span className="tabular text-xs text-muted-foreground">
          {postDate(post.published_at)}
          {post.author_name ? ` · ${post.author_name}` : ""}
        </span>
        <h3 className={cn("font-bold group-hover:text-primary", large ? "text-2xl" : "text-lg")}>{post.title}</h3>
        <p className="line-clamp-3 text-[15px] text-slate-700">{post.excerpt}</p>
      </div>
    </Link>
  );
}

export function EventRow({ event }: { event: ClimateEvent }) {
  const start = new Date(event.starts_at);
  const month = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "Africa/Lagos" }).format(start);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "Africa/Lagos" }).format(start);
  return (
    <article className="flex gap-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-mint py-2 text-primary-ink">
        <span className="eyebrow">{month}</span>
        <b className="font-display text-2xl leading-none font-extrabold">{day}</b>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h4 className="font-bold">{event.title}</h4>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5 shrink-0" aria-hidden /> {eventWhen(event)}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {event.is_online ? <Globe className="size-3.5 shrink-0" aria-hidden /> : <MapPin className="size-3.5 shrink-0" aria-hidden />}
          {event.location}
        </p>
        <p className="mt-1 line-clamp-3 text-sm text-slate-700">{event.summary}</p>
        {event.link_url && (
          <a
            href={event.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex w-fit items-center gap-1 text-sm font-bold text-primary"
          >
            Details and registration <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
    </article>
  );
}
