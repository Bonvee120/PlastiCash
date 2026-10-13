import Link from "next/link";
import { Suspense } from "react";

import { WithdrawalQueue } from "@/components/ops/withdrawal-queue";
import { OpsPage } from "@/components/ops/ui";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminWithdrawal } from "@/lib/admin-types";
import { get } from "@/lib/api";
import { cn } from "@/lib/utils";

const TABS = [
  { status: "PENDING", label: "To review" },
  { status: "PROCESSING", label: "Sending" },
  { status: "PAID", label: "Paid" },
  { status: "FAILED", label: "Failed" },
  { status: "REJECTED", label: "Rejected" },
  { status: "ALL", label: "All" },
] as const;

export default function WithdrawalsPage({ searchParams }: PageProps<"/ops-portal/withdrawals">) {
  return (
    <OpsPage
      title="Withdrawals"
      sub="Approve sends the Paystack transfer; PAID or FAILED arrives by webhook. Reject returns the money to the wallet."
      filters={
        <Suspense>
          <Tabs searchParams={searchParams} />
        </Suspense>
      }
    >
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </OpsPage>
  );
}

async function statusOf(searchParams: PageProps<"/ops-portal/withdrawals">["searchParams"]) {
  const value = (await searchParams).status;
  const status = Array.isArray(value) ? value[0] : value;
  return TABS.find((t) => t.status === status)?.status ?? "PENDING";
}

async function Tabs({ searchParams }: { searchParams: PageProps<"/ops-portal/withdrawals">["searchParams"] }) {
  const current = await statusOf(searchParams);
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
      {TABS.map((t) => (
        <Link
          key={t.status}
          href={`/ops-portal/withdrawals?status=${t.status}`}
          aria-current={current === t.status ? "page" : undefined}
          className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", current === t.status ? "bg-primary text-white" : "bg-white text-slate-600 ring-1 ring-border")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

async function Queue({ searchParams }: { searchParams: PageProps<"/ops-portal/withdrawals">["searchParams"] }) {
  const status = await statusOf(searchParams);
  const rows = await get<AdminWithdrawal[]>(status === "ALL" ? "/admin/withdrawals" : `/admin/withdrawals?status=${status}`);
  return <WithdrawalQueue rows={status === "ALL" ? [...rows].reverse() : rows} />;
}
