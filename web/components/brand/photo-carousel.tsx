"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type Slide = { title: string; highlight: string; line: string; shot: string };

// Sign-up/login photo carousel (docs/DESIGN_BRIEF.md §8): cross-fade, auto-advance every 4.5 s, dots
// (8 px, active 26 px gold on dark), keyboard reachable, paused when the user prefers reduced motion.
// Behind the text it shows the landing hero photos the admin uploads (ops portal, Hero slides), in turn; with no
// photos yet, a forest gradient. The text slides stay the same; with more photos than texts the texts repeat.
export function PhotoCarousel({
  slides,
  photos = [],
  interval = 4500,
}: {
  slides: Slide[];
  photos?: string[];
  interval?: number;
}) {
  const count = Math.max(slides.length, photos.length);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches || paused) return;
    const timer = window.setInterval(() => setActive((i) => (i + 1) % count), interval);
    return () => window.clearInterval(timer);
  }, [paused, count, interval]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="PlastiCash in Enugu"
      className="relative h-full overflow-hidden bg-forest text-white"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {Array.from({ length: count }, (_, i) => {
        const slide = slides[i % slides.length]!;
        const photo = photos.length ? photos[i % photos.length] : null;
        return (
        <div
          key={i}
          role="group"
          aria-roledescription="slide"
          aria-label={`Slide ${i + 1} of ${count}`}
          aria-hidden={i !== active}
          className={cn(
            "absolute inset-0 transition-opacity duration-700 ease-out motion-reduce:transition-none",
            i === active ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves a cropped WebP
            <img
              src={cloudinaryPanel(photo)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              // Lazy: the panel is hidden on phones, and hidden lazy images are never downloaded.
              loading="lazy"
            />
          ) : (
            // Photo slot: forest-to-green with a soft glow, until the admin adds photos
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 70% 30%, rgb(34 197 94 / 0.35), transparent 55%), linear-gradient(160deg, #166534, #052E16)",
              }}
              title={`Photo: ${slide.shot}`}
            />
          )}
          {/* Forest fade from the bottom keeps the text readable on any photo */}
          <div className="absolute inset-0 bg-gradient-to-b from-forest/10 from-30% via-forest/55 to-forest/95" />
          <div className="absolute inset-x-12 bottom-24">
            <p className="font-display text-5xl leading-none font-extrabold tracking-[-0.04em]">
              {slide.title}
              <br />
              <span className="text-gold">{slide.highlight}</span>
            </p>
            <p className="mt-3.5 max-w-[420px] text-[#DCFCE7]">{slide.line}</p>
          </div>
        </div>
        );
      })}
      <div className="absolute bottom-12 left-12 z-10 flex items-center gap-1.5" role="tablist" aria-label="Choose slide">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`Slide ${i + 1}`}
            onClick={() => setActive(i)}
            className={cn(
              "h-2 rounded-full transition-all duration-200 motion-reduce:transition-none",
              i === active ? "w-[26px] bg-gold" : "w-2 bg-white/40",
            )}
          />
        ))}
      </div>
    </section>
  );
}

// Tall crop for the 600 px side panel, chosen around the subject.
function cloudinaryPanel(url: string) {
  return url.includes("/upload/") ? url.replace("/upload/", "/upload/f_auto,q_auto,c_fill,g_auto,w_900,h_1350/") : url;
}

// Copy from docs/DESIGN_BRIEF.md §8 (welcome slides).
export const WELCOME_SLIDES: Slide[] = [
  {
    title: "Your plastic",
    highlight: "is money.",
    line: "Gather bottles, cans and sachets. We buy them by the kilo, and you see the price before we come.",
    shot: "Mother hands a sack of bottles to a collector at her gate, Independence Layout",
  },
  {
    title: "Weighed in",
    highlight: "front of you.",
    line: "A verified collector comes to your gate. Every kilo is weighed and photographed.",
    shot: "Collector in an amber vest weighs a sack on a hanging scale",
  },
  {
    title: "Paid in seconds.",
    highlight: "Withdraw anytime.",
    line: "Confirm the weight and points land in your wallet. 1 point = ₦1, sent to any Nigerian bank.",
    shot: "Young woman smiles at her phone on the porch as her points arrive",
  },
];
