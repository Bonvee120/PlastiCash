import { Suspense } from "react";

import { ActivePickupCard, activePickup, ImpactStats, RecentActivity, RequestCta, WalletCard } from "@/components/app/dashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { get } from "@/lib/api";
import type { Impact, Pickup, Wallet } from "@/lib/types";

export default function UserHome() {
  return (
    <main className="flex flex-1 flex-col gap-5 p-4 lg:p-8">
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </main>
  );
}

async function Dashboard() {
  // In parallel: each call is a round trip to the API and on to Supabase.
  const [wallet, pickups, impact] = await Promise.all([
    get<Wallet>("/wallet?limit=5"),
    get<Pickup[]>("/pickups?limit=10"),
    get<Impact>("/impact"),
  ]);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
      <div className="flex flex-col gap-5">
        <WalletCard wallet={wallet} />
        <RequestCta />
        <ImpactStats impact={impact} />
      </div>
      <div className="flex flex-col gap-5">
        <ActivePickupCard pickup={activePickup(pickups)} />
        <RecentActivity entries={wallet.entries} />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]" aria-busy="true" aria-label="Loading your dashboard">
      <div className="flex flex-col gap-5">
        <Skeleton className="h-56 rounded-3xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <div className="flex flex-col gap-5">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </div>
  );
}
