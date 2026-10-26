import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { EmptyState } from "@/components/brand/ui";
import { EventRow } from "@/components/content/cards";
import { MotionRoot, Stagger, StaggerItem } from "@/components/motion/reveal";
import { SiteFooter, SiteHeader } from "@/components/public/site-chrome";
import { Skeleton } from "@/components/ui/skeleton";
import { getEvents } from "@/lib/content";

export const metadata: Metadata = {
  title: "Climate and recycling events",
  description:
    "Upcoming climate, recycling and clean-up events in Enugu and online, shared by EcoCyclers.",
  alternates: { canonical: "/events" },
};

export default function EventsPage() {
  return (
    <MotionRoot>
      <div className="flex min-h-svh flex-col bg-canvas">
        <SiteHeader />
        <main className="container-site flex flex-1 flex-col gap-8 py-10">
          <div>
            <span className="eyebrow text-primary">Events</span>
            <h1 className="mt-2 font-display text-4xl leading-tight font-extrabold tracking-[-0.03em] lg:text-5xl">
              Climate and recycling events
            </h1>
            <p className="mt-3 text-muted-foreground">
              Clean-ups, talks and trainings in Enugu and online. Times are
              Lagos time.
            </p>
          </div>
          <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
            <EventLists />
          </Suspense>
        </main>
        <SiteFooter />
      </div>
    </MotionRoot>
  );
}

async function EventLists() {
  const [upcoming, past] = await Promise.all([
    getEvents("upcoming", 50),
    getEvents("past", 12),
  ]);
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Coming up</h2>
        {upcoming.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            text="No upcoming events right now. Check back soon."
          />
        ) : (
          <Stagger as="ul" className="grid gap-3 lg:grid-cols-2">
            {upcoming.map((e) => (
              <StaggerItem key={e.id} as="li">
                <EventRow event={e} />
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </section>
      {past.length > 0 && (
        <section className="flex flex-col gap-3 opacity-80">
          <h2 className="text-xl font-bold">Past events</h2>
          <ul className="grid gap-3 lg:grid-cols-2">
            {past.map((e) => (
              <li key={e.id}>
                <EventRow event={e} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
