import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PickupDetail } from "@/components/app/pickup-detail";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Pickup } from "@/lib/types";

export default function PickupPage({ params }: PageProps<"/app/pickups/[id]">) {
  return (
    <main className="flex flex-1 flex-col gap-4 p-4 lg:p-8">
      <Link href="/app/pickups" className="flex items-center gap-1 text-sm font-bold text-primary">
        <ChevronLeft className="size-4" aria-hidden /> All pickups
      </Link>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

async function Detail({ params }: { params: PageProps<"/app/pickups/[id]">["params"] }) {
  const { id } = await params;
  const result = await api<Pickup>(`/pickups/${id}`);
  if (!result.ok && (result.status === 404 || result.status === 422)) notFound();
  if (!result.ok) throw new Error(`GET /pickups/${id} failed: ${result.status}`);
  return <PickupDetail initial={result.data} />;
}
