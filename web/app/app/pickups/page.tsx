import { ChevronRight, PackageOpen } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { BtnLink, EmptyState, PageTitle, StatusBadge } from "@/components/brand/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { get } from "@/lib/api";
import { day, kg, pts, ref } from "@/lib/format";
import type { Pickup } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS = { all: "All", active: "Active", paid: "Paid" } as const;
type Filter = keyof typeof FILTERS;
const ACTIVE = new Set(["REQUESTED", "ASSIGNED", "EN_ROUTE", "AWAITING_CONFIRMATION", "DISPUTED"]);

export default function PickupsPage({ searchParams }: PageProps<"/app/pickups">) {
  return (
    <main className="flex flex-1 flex-col gap-5 p-4 lg:p-8">
      <PageTitle title="Your pickups" action={<BtnLink href="/app/request" size="sm">Request a pickup</BtnLink>} />
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-2xl" />}>
        <List searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/app/pickups">["searchParams"] }) {
  const raw = (await searchParams).show;
  const filter: Filter = raw === "active" || raw === "paid" ? raw : "all";
  const all = await get<Pickup[]>("/pickups?limit=50");
  const shown = all.filter((p) => (filter === "all" ? true : filter === "paid" ? p.status === "COMPLETED" : ACTIVE.has(p.status)));

  const months = new Map<string, Pickup[]>();
  for (const p of shown) {
    const month = new Date(p.created_at).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Africa/Lagos" });
    months.set(month, [...(months.get(month) ?? []), p]);
  }

  return (
    <>
      <nav className="flex gap-2" aria-label="Filter pickups">
        {(Object.keys(FILTERS) as Filter[]).map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/app/pickups" : `/app/pickups?show=${f}`}
            aria-current={filter === f ? "page" : undefined}
            className={cn("rounded-full px-4 py-1.5 text-sm font-semibold", filter === f ? "bg-primary text-primary-foreground" : "bg-card text-slate-600 ring-1 ring-border")}
          >
            {FILTERS[f]}
          </Link>
        ))}
      </nav>
      {shown.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          text={filter === "all" ? "No pickups yet. Gather your plastic and request your first pickup." : `No ${FILTERS[filter].toLowerCase()} pickups.`}
          action={<BtnLink href="/app/request">Request a pickup</BtnLink>}
        />
      ) : (
        [...months.entries()].map(([month, rows]) => (
          <section key={month} aria-label={month} className="flex flex-col gap-2">
            <h3 className="eyebrow text-muted-foreground">{month}</h3>
            <ul className="overflow-hidden rounded-2xl border border-border bg-card">
              {rows.map((p) => (
                <li key={p.id} className="border-t border-subtle first:border-t-0">
                  <Link href={`/app/pickups/${p.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-mist">
                    <div className="min-w-0 flex-1">
                      <b className="block text-sm">
                        {p.channel === "HUB" ? "Hub drop-off" : "Door pickup"} <span className="tabular font-normal text-muted-foreground">· {ref(p.id)}</span>
                      </b>
                      <small className="tabular text-xs text-muted-foreground">
                        {day(p.created_at)} · {p.total_net_kg ? kg(p.total_net_kg) : `est. ${kg(p.estimated_kg)}`}
                        {p.total_amount_kobo !== null && ` · ${pts(p.total_amount_kobo)}`}
                      </small>
                    </div>
                    <StatusBadge status={p.status} />
                    <ChevronRight className="size-4 text-slate-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
