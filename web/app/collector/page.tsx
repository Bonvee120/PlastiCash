import { ChevronRight, MapPin, PackageOpen, Store } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { BtnLink, EmptyState, StatusBadge } from "@/components/brand/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { get } from "@/lib/api";
import { kg, place, ref, WINDOW_LABEL } from "@/lib/format";
import type { CollectorPickup } from "@/lib/types";
import { cn } from "@/lib/utils";

const DONE: CollectorPickup["status"][] = ["AWAITING_CONFIRMATION", "DISPUTED", "COMPLETED", "CANCELLED"];

// Today's jobs, oldest request first (the API's order). The first job not yet weighed is NEXT (DESIGN_BRIEF.md §6.3).
export default function TodaysPickupsPage() {
  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <BtnLink href="/collector/walk-in" variant="outline" block className="d-btn-collector">
        <Store className="size-5" aria-hidden /> Hub walk-in
      </BtnLink>
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-2xl" />}>
        <Day />
      </Suspense>
    </main>
  );
}

async function Day() {
  const jobs = await get<CollectorPickup[]>("/collector/pickups");
  const doors = jobs.filter((j) => j.channel === "DOOR");
  const done = doors.filter((j) => DONE.includes(j.status)).length;
  const toCollect = doors
    .filter((j) => !DONE.includes(j.status))
    .reduce((sum, j) => sum + Number(j.estimated_kg ?? 0), 0);
  const next = doors.find((j) => !DONE.includes(j.status));

  return (
    <>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat value={`${done}/${doors.length}`} label="Done" />
        <Stat value={kg(toCollect)} label="To collect" />
        <Stat value={String(doors.length - done)} label="To go" />
      </div>
      <h2 className="text-xl font-bold">Today</h2>
      {doors.length === 0 ? (
        <EmptyState icon={PackageOpen} text="No pickups for you today. EcoCyclers assigns them in the ops portal." />
      ) : (
        <ol className="flex flex-col gap-3">
          {doors.map((job, i) => (
            <li key={job.id}>
              <Link
                href={`/collector/pickups/${job.id}`}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border bg-white p-4",
                  job.id === next?.id ? "border-2 border-primary" : "border-border",
                  DONE.includes(job.status) && "opacity-70",
                )}
              >
                <span className="tabular grid size-9 shrink-0 place-items-center rounded-full bg-muted font-bold">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <b className="text-base">{job.customer_name || "Customer"}</b>
                    {job.id === next?.id && <span className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-extrabold text-white">NEXT</span>}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-sm text-slate-700">
                    <MapPin className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{place(job)}</span>
                  </span>
                  <span className="tabular mt-1 block text-xs text-muted-foreground">
                    {ref(job.id)} · est. {kg(job.estimated_kg)}
                    {job.preferred_window && ` · ${WINDOW_LABEL[job.preferred_window]}`}
                  </span>
                  <StatusBadge status={job.status} className="mt-2" />
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-white px-2 py-3">
      <b className="tabular block text-lg">{value}</b>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
