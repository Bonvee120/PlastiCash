import { Suspense } from "react";

import { BoardTable } from "@/components/ops/board-table";
import { OpsPage, selectClass, StatCard } from "@/components/ops/ui";
import { Skeleton } from "@/components/ui/skeleton";
import type { Board, Stats, UserRow } from "@/lib/admin-types";
import { get } from "@/lib/api";
import { AREAS } from "@/lib/areas";
import { kg, naira, pts } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUSES = ["REQUESTED", "ASSIGNED", "EN_ROUTE", "AWAITING_CONFIRMATION", "DISPUTED", "COMPLETED", "CANCELLED"] as const;
const POOL_MIN_KG = 50; // an area day is worth a trip from about 50 kg (DESIGN_BRIEF.md: bars under 50 kg are amber)

type Filters = { status?: string; area?: string; date?: string };

export default function PickupsBoardPage({ searchParams }: PageProps<"/ops-portal/pickups">) {
  return (
    <OpsPage
      title="Pickups"
      filters={
        <Suspense>
          <FilterForm searchParams={searchParams} />
        </Suspense>
      }
    >
      <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-2xl" />}>
        <BoardData searchParams={searchParams} />
      </Suspense>
    </OpsPage>
  );
}

async function filtersOf(searchParams: PageProps<"/ops-portal/pickups">["searchParams"]): Promise<Filters> {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  return { status: one(params.status), area: one(params.area), date: one(params.date) };
}

async function FilterForm({ searchParams }: { searchParams: PageProps<"/ops-portal/pickups">["searchParams"] }) {
  const f = await filtersOf(searchParams);
  return (
    <form className="flex flex-wrap items-end gap-2" action="/ops-portal/pickups">
      <select name="status" defaultValue={f.status ?? ""} aria-label="Status" className={selectClass}>
        <option value="">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace("_", " ").toLowerCase()}
          </option>
        ))}
      </select>
      <select name="area" defaultValue={f.area ?? ""} aria-label="Area" className={selectClass}>
        <option value="">All areas</option>
        {AREAS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <input type="date" name="date" defaultValue={f.date ?? ""} aria-label="Date" className={selectClass} />
      <button type="submit" className="d-btn d-btn-primary d-btn-sm">
        Filter
      </button>
    </form>
  );
}

async function BoardData({ searchParams }: { searchParams: PageProps<"/ops-portal/pickups">["searchParams"] }) {
  const f = await filtersOf(searchParams);
  const query = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  const [board, stats, collectors] = await Promise.all([
    get<Board>(`/admin/pickups${query ? `?${query}` : ""}`),
    get<Stats>("/admin/stats"),
    get<UserRow[]>("/admin/users?role=COLLECTOR"),
  ]);
  const most = Math.max(...board.area_totals.map((a) => Number(a.estimated_kg)), POOL_MIN_KG);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Kg this month" value={kg(stats.kg_this_month)} />
        <StatCard label="Points paid" value={pts(stats.points_paid_kobo)} hint={naira(stats.points_paid_kobo)} />
        <StatCard label="Pending withdrawals" value={stats.pending_withdrawals.count} />
        <StatCard label="Open disputes" value={stats.open_disputes} tone={stats.open_disputes ? "alert" : undefined} />
        <StatCard label="Raw stock" value={kg(stats.raw_stock_kg)} />
      </div>

      <section className="rounded-2xl border border-border bg-white p-4">
        <h2 className="text-lg font-bold">Waiting requests by area</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Estimated kg of REQUESTED pickups, for planning pooled area days. Amber: under {POOL_MIN_KG} kg.
        </p>
        {board.area_totals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No waiting requests.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {board.area_totals.map((a) => {
              const value = Number(a.estimated_kg);
              return (
                <li key={a.area} className="grid grid-cols-[150px_1fr_150px] items-center gap-3 text-sm">
                  <span className="truncate font-semibold">{a.area}</span>
                  <span className="h-3 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn("block h-full rounded-full", value < POOL_MIN_KG ? "bg-[#F59E0B]" : "bg-primary")}
                      style={{ width: `${Math.max((value / most) * 100, 2)}%` }}
                    />
                  </span>
                  <span className="tabular text-right text-muted-foreground">
                    {kg(a.estimated_kg)} · {a.requests} req{a.pooled ? ` · ${a.pooled} pool` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <BoardTable pickups={board.pickups} collectors={collectors.filter((c) => c.is_active)} />
    </>
  );
}
