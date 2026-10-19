"use client";

import { LazyMotion, m, useInView, useReducedMotion, type Variants } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Landing page motion (DESIGN_BRIEF.md §12): 150–600 ms ease-out, used to explain things arriving, never in the way.
// Everything respects prefers-reduced-motion: design/theme.css forces [data-reveal] elements visible and still (works
// before any script runs, and the server can't know the setting), and numbers show their final value. Don't wrap the hero text or first image in these: hiding them until scripts load would delay LCP.

const EASE = [0.22, 1, 0.36, 1] as const;

// Wrap animated pages in this once. Only a small core loads with the page; the animation engine arrives afterwards,
// so the motion library doesn't compete with the page's first paint on slow connections.
const loadFeatures = () => import("./features").then((mod) => mod.default);

export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  );
}

// Fades and rises into place the first time it scrolls into view.
export function Reveal({ children, delay = 0, className, y = 24 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <m.div
      data-reveal
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </m.div>
  );
}

const list: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.08 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 20 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

// A grid or list whose children arrive one after another.
export function Stagger({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "ol" | "ul" }) {
  const Tag = as === "ol" ? m.ol : as === "ul" ? m.ul : m.div;
  return (
    <Tag data-reveal className={className} variants={list} initial="hidden" whileInView="shown" viewport={{ once: true, margin: "0px 0px -10% 0px" }}>
      {children}
    </Tag>
  );
}

export function StaggerItem({ children, className, as = "div" }: { children: ReactNode; className?: string; as?: "div" | "li" }) {
  const Tag = as === "li" ? m.li : m.div;
  return (
    <Tag data-reveal className={className} variants={item}>
      {children}
    </Tag>
  );
}

// Counts up from 0 to `value` when it scrolls into view (the impact numbers).
export function CountUp({ value, format }: { value: number; format: "number" | "naira" | "kg" }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  // Starts at 0 on the server and in the browser alike (no hydration mismatch); reduced motion jumps to the value.
  const [shown, setShown] = useState(0);
  const text = (n: number) => {
    const whole = Math.round(n).toLocaleString("en-NG");
    return format === "naira" ? `₦${whole}` : format === "kg" ? `${whole} kg` : whole;
  };

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      const frame = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(frame);
    }
    // A few lines of easing instead of the library's animate(), which would pull in the full engine up front.
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - started) / 1400, 1);
      setShown(value * (1 - Math.pow(1 - t, 4)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, reduce, value]);

  // Screen readers get the final number once; the counting digits are hidden from them.
  return (
    <span ref={ref}>
      <span className="sr-only">{text(value)}</span>
      <span aria-hidden>{text(shown)}</span>
    </span>
  );
}
