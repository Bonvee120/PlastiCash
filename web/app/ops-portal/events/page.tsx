import { Suspense } from "react";

import { EventsAdmin } from "@/components/ops/events-admin";
import { OpsPage } from "@/components/ops/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { get } from "@/lib/api";
import type { ClimateEvent } from "@/lib/content";

export default function OpsEventsPage() {
  return (
    <OpsPage title="Events" sub="Climate and recycling events for the public events page and the landing page. Times are Lagos time.">
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-2xl" />}>
        <Events />
      </Suspense>
    </OpsPage>
  );
}

async function Events() {
  return <EventsAdmin events={await get<ClimateEvent[]>("/admin/events")} />;
}
