"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type Slide = { title: string; highlight: string; line: string; shot: string };

// Sign-up/login photo carousel (docs/DESIGN_BRIEF.md §8): cross-fade, auto-advance every 4.5 s, dots
// (8 px, active 26 px gold on dark), keyboard reachable, paused when the user prefers reduced motion.
// Photo slots show a forest gradient until the real Enugu photos (shot list §10) arrive.
export function PhotoCarousel({ slides, interval = 4500 }: { slides: Slide[]; interval?: number }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches || paused) return;
    const timer = window.setInterval(() => setActive((i) => (i + 1) % slides.length), interval);
    return () => window.clearInterval(timer);
  }, [paused, slides.length, interval]);

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
      {slides.map((slide, i) => (
        <div
          key={slide.title}
          role="group"
          aria-roledescription="slide"
          aria-label={`Slide ${i + 1} of ${slides.length}`}
          aria-hidden={i !== active}
          className={cn(
            "absolute inset-0 transition-opacity duration-700 ease-out motion-reduce:transition-none",
            i === active ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          {/* Photo slot: forest-to-green with a soft glow, until the real photo is in */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 70% 30%, rgb(34 197 94 / 0.35), transparent 55%), linear-gradient(160deg, #166534, #052E16)",
            }}
            title={`Photo: ${slide.shot}`}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-forest/10 from-35% to-forest/90" />
          <div className="absolute inset-x-12 bottom-24">
            <p className="font-display text-5xl leading-none font-extrabold tracking-[-0.04em]">
              {slide.title}
              <br />
              <span className="text-gold">{slide.highlight}</span>
            </p>
            <p className="mt-3.5 max-w-[420px] text-mint">{slide.line}</p>
          </div>
        </div>
      ))}
      <div className="absolute bottom-12 left-12 z-10 flex items-center gap-1.5" role="tablist" aria-label="Choose slide">
        {slides.map((slide, i) => (
          <button
            key={slide.title}
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
