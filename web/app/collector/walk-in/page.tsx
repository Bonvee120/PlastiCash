import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { WalkInFlow } from "@/components/collector/walk-in-flow";
import { Skeleton } from "@/components/ui/skeleton";
import { pricesOrThrow } from "@/lib/public-data";

// Hub walk-in: find the customer by phone, weigh, then the SMS code (spec 03).
export default function HubWalkInPage() {
  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <Link href="/collector" className="flex min-h-12 items-center gap-1 text-base font-bold text-primary">
        <ChevronLeft className="size-5" aria-hidden /> Today
      </Link>
      <h2 className="text-xl font-bold">Hub walk-in</h2>
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <Flow />
      </Suspense>
    </main>
  );
}

async function Flow() {
  const prices = await pricesOrThrow();
  return <WalkInFlow prices={prices} />;
}
