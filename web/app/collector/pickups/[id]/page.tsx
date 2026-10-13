import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { JobFlow } from "@/components/collector/job-flow";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { pricesOrThrow } from "@/lib/public-data";
import type { CollectorPickup } from "@/lib/types";

export default function JobPage({ params }: PageProps<"/collector/pickups/[id]">) {
  return (
    <main className="flex flex-1 flex-col gap-4 p-4">
      <Link href="/collector" className="flex min-h-12 items-center gap-1 text-base font-bold text-primary">
        <ChevronLeft className="size-5" aria-hidden /> Today
      </Link>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <Job params={params} />
      </Suspense>
    </main>
  );
}

async function Job({ params }: { params: PageProps<"/collector/pickups/[id]">["params"] }) {
  const { id } = await params;
  const [result, prices] = await Promise.all([
    api<CollectorPickup>(`/collector/pickups/${id}`),
    pricesOrThrow(),
  ]);
  if (!result.ok && (result.status === 404 || result.status === 422)) notFound();
  if (!result.ok) throw new Error(`GET /collector/pickups/${id} failed: ${result.status}`);
  return <JobFlow initial={result.data} prices={prices} />;
}
