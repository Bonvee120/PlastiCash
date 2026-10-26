"use client";

import { ChevronLeft, ChevronRight, Recycle, Scale, Wallet } from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import type { HeroSlide } from "@/lib/content";
import { cn } from "@/lib/utils";

// Landing hero carousel (DESIGN_BRIEF.md §8): photos the admin uploads in the ops portal, each with a headline;
// cross-fade, auto-advance every 5 s, arrows, dots and swipe; pauses on hover or focus and when the visitor prefers
// reduced motion. Until photos are added it shows three brand slides with the welcome lines from the brief.

const PLACEHOLDERS = [
  { id: "p1", headline: "Your plastic is money.", subline: "We buy bottles, cans and sachets by the kilo.", icon: Recycle },
  { id: "p2", headline: "We weigh it in front of you.", subline: "Every kilo weighed and photographed.", icon: Scale },
  { id: "p3", headline: "Paid in seconds.", subline: "Confirm the weight; withdraw to any Nigerian bank.", icon: Wallet },
];

function cloudinaryWidth(url: string, width: number) {
  return url.includes("/upload/") ? url.replace("/upload/", `/upload/f_auto,q_auto,c_fill,g_auto,w_${width},h_${Math.round(width * 0.8)}/`) : url;
}

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const reduce = useReducedMotion();
  const items = slides.length ? slides : null;
  const count = items ? items.length : PLACEHOLDERS.length;
  const [rawIndex, setIndex] = useState(0);
  // The slide list can change length while the page is open (API down, so placeholders; admin adds or removes a
  // photo), and the old index may then point past the end. Wrap it instead of reading a missing slide.
  const index = rawIndex % count;
  const [paused, setPaused] = useState(false);
  const go = (to: number) => setIndex((to + count) % count);
  // Swipe with plain touch events (the library's drag would need its larger feature bundle).
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    if (reduce || paused || count < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), 5000);
    return () => clearInterval(timer);
  }, [reduce, paused, count]);

  const current = items ? items[index] : null;
  const placeholder = items ? null : PLACEHOLDERS[index];

  return (
    <section
      aria-roledescription="carousel"
      aria-label="PlastiCash in Enugu"
      className="relative aspect-[5/4] w-full overflow-hidden rounded-3xl border border-white/15 bg-white/5 shadow-raised"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (start == null || end == null || count < 2) return;
        if (end - start < -50) go(index + 1);
        else if (end - start > 50) go(index - 1);
      }}
    >
      <AnimatePresence initial={false} mode="sync">
        <m.div
          key={current?.id ?? placeholder!.id}
          className="absolute inset-0"
          initial={reduce ? false : { opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          role="group"
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${count}`}
        >
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves a resized, cropped WebP
            <img
              src={cloudinaryWidth(current.image_url, 1000)}
              srcSet={`${cloudinaryWidth(current.image_url, 600)} 600w, ${cloudinaryWidth(current.image_url, 1000)} 1000w`}
              sizes="(min-width: 1024px) 560px, 100vw"
              alt={current.headline}
              className="pointer-events-none h-full w-full object-cover select-none"
              fetchPriority={index === 0 ? "high" : "auto"}
              draggable={false}
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_30%_20%,#16A34A_0%,#14532D_45%,#052E16_100%)]">
              {placeholder && <placeholder.icon className="size-28 text-white/25" strokeWidth={1.4} aria-hidden />}
            </div>
          )}
          {/* Forest gradient from the bottom keeps the caption readable on any photo (§10). */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#052E16]/95 via-[#052E16]/60 to-transparent px-6 pt-20 pb-14">
            <p className="font-display text-2xl leading-tight font-extrabold tracking-[-0.03em] text-white lg:text-3xl">
              {current?.headline ?? placeholder!.headline}
            </p>
            {(current?.subline ?? placeholder?.subline) && (
              <p className="mt-1.5 text-sm text-[#DCFCE7] lg:text-base">{current?.subline ?? placeholder!.subline}</p>
            )}
          </div>
        </m.div>
      </AnimatePresence>

      {count > 1 && (
        <>
          <div className="absolute right-4 bottom-4 z-10 flex gap-2">
            <button type="button" onClick={() => go(index - 1)} aria-label="Previous slide" className="grid size-9 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25">
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button type="button" onClick={() => go(index + 1)} aria-label="Next slide" className="grid size-9 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25">
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
          <div className="absolute bottom-4 left-4 z-10 flex">
            {Array.from({ length: count }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index}
                className="group grid h-6 min-w-6 place-items-center"
              >
                <span className={cn("h-2 rounded-full transition-all duration-300", i === index ? "w-[26px] bg-gold" : "w-2 bg-white/50 group-hover:bg-white/80")} />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
