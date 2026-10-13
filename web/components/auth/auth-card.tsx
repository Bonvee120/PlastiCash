import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { PhotoCarousel, WELCOME_SLIDES } from "@/components/brand/photo-carousel";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description: string;
  children: ReactNode;
  // Under the form and its buttons on every screen, e.g. "New here? Create an account".
  footer: ReactNode;
  // "Step 1 of 2" with segments, for sign-up.
  step?: { current: number; total: number };
};

// Auth pages (docs/DESIGN_BRIEF.md §6.1, §9): split screen on a laptop (600 px photo carousel, form max 560 px);
// on a phone a forest header with the logo, then the form on a rounded sheet.
export function AuthCard({ title, description, children, footer, step }: Props) {
  return (
    <div className="flex flex-1 flex-col bg-canvas lg:grid lg:min-h-svh lg:grid-cols-[600px_1fr] lg:bg-white">
      <div className="hidden lg:block">
        <PhotoCarousel slides={WELCOME_SLIDES} />
      </div>

      {/* Phone header */}
      <div
        className="relative flex h-44 shrink-0 items-start px-4 pt-6 lg:hidden"
        style={{ background: "linear-gradient(160deg, #052E16 10%, #166534)" }}
      >
        <Link href="/" aria-label="PlastiCash home">
          <Logo variant="white" size={36} />
        </Link>
      </div>

      <main className="relative -mt-9 flex flex-1 flex-col gap-5 rounded-t-[28px] bg-canvas px-4 pt-7 pb-10 lg:mt-0 lg:rounded-none lg:bg-white lg:px-[72px] lg:pt-10">
        <div className="hidden lg:flex">
          <Link href="/" aria-label="PlastiCash home">
            <Logo size={38} />
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-[440px] flex-col gap-6 lg:mt-10">
          {step && (
            <div>
              <span className="eyebrow text-primary">
                Step {step.current} of {step.total}
              </span>
              <div className="mt-2 flex gap-1.5" aria-hidden>
                {Array.from({ length: step.total }, (_, i) => (
                  <i key={i} className={cn("h-[5px] flex-1 rounded-full", i < step.current ? "bg-primary" : "bg-border")} />
                ))}
              </div>
            </div>
          )}
          <div>
            <h1 className="text-[26px] leading-tight font-bold lg:text-[38px] lg:leading-none lg:font-extrabold lg:tracking-[-0.03em]">
              {title}
            </h1>
            <p className="mt-2 text-[15px] text-muted-foreground">{description}</p>
          </div>
          {children}
          <p className="border-t border-border pt-5 text-center text-sm text-muted-foreground">{footer}</p>
        </div>
      </main>
    </div>
  );
}
