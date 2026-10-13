import Link from "next/link";
import { Suspense } from "react";

import { OpsPage, StatCard } from "@/components/ops/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Stats } from "@/lib/admin-types";
import { get } from "@/lib/api";
import { kg, money, naira, pts } from "@/lib/format";
import { cn } from "@/lib/utils";

const LOW = 0.6; // same threshold as the API's "low estimate accuracy" flag

export default function OverviewPage() {
  return (
    <OpsPage title="Overview" sub="This month in Lagos time; queues are live.">
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <Overview />
      </Suspense>
    </OpsPage>
  );
}

async function Overview() {
  const stats = await get<Stats>("/admin/stats");
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Kg this month" value={kg(stats.kg_this_month)} />
        <StatCard label="Points paid" value={pts(stats.points_paid_kobo)} hint={`${naira(stats.points_paid_kobo)} in pickup credits`} />
        <Link href="/ops-portal/withdrawals">
          <StatCard
            label="Pending withdrawals"
            value={stats.pending_withdrawals.count}
            hint={money(stats.pending_withdrawals.amount_kobo)}
            tone={stats.pending_withdrawals.count ? "warn" : undefined}
          />
        </Link>
        <Link href="/ops-portal/disputes">
          <StatCard label="Open disputes" value={stats.open_disputes} tone={stats.open_disputes ? "alert" : undefined} />
        </Link>
        <Link href="/ops-portal/pickups?status=REQUESTED">
          <StatCard label="Waiting requests" value={stats.waiting_requests} />
        </Link>
        <Link href="/ops-portal/stock">
          <StatCard label="Raw stock" value={kg(stats.raw_stock_kg)} />
        </Link>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <h2 className="px-4 pt-4 pb-1 text-lg font-bold">Estimate accuracy</h2>
          <p className="px-4 pb-3 text-sm text-muted-foreground">Actual kg ÷ estimated kg on completed door pickups, worst first.</p>
          {stats.estimate_accuracy.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">No completed pickups with an estimate yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Pickups</TableHead>
                  <TableHead className="text-right">Estimated</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Accuracy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="tabular">
                {stats.estimate_accuracy.map((row) => (
                  <TableRow key={row.user_id}>
                    <TableCell className="font-sans font-semibold">{row.name}</TableCell>
                    <TableCell className="text-right">{row.pickups}</TableCell>
                    <TableCell className="text-right">{kg(row.estimated_kg)}</TableCell>
                    <TableCell className="text-right">{kg(row.actual_kg)}</TableCell>
                    <TableCell className={cn("text-right font-semibold", Number(row.accuracy) < LOW && "text-warn")}>
                      {Math.round(Number(row.accuracy) * 100)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <h2 className="px-4 pt-4 pb-1 text-lg font-bold">Disputes per collector</h2>
          <p className="px-4 pb-3 text-sm text-muted-foreground">All time. A high share is worth a look at their scale photos.</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Collector</TableHead>
                <TableHead className="text-right">Weighed</TableHead>
                <TableHead className="text-right">Disputed</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="tabular">
              {stats.disputes_per_collector.map((row) => (
                <TableRow key={row.collector_id}>
                  <TableCell className="font-sans font-semibold">{row.name}</TableCell>
                  <TableCell className="text-right">{row.weighed}</TableCell>
                  <TableCell className="text-right">{row.disputes}</TableCell>
                  <TableCell className="text-right">{row.weighed ? `${Math.round((row.disputes / row.weighed) * 100)}%` : "–"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>
    </>
  );
}
