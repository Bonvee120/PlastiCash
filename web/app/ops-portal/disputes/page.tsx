import { CheckCircle2 } from "lucide-react";
import { Suspense } from "react";

import { EmptyState } from "@/components/brand/ui";
import { DisputeCard } from "@/components/ops/dispute-card";
import { OpsPage } from "@/components/ops/ui";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminPickup } from "@/lib/admin-types";
import { get } from "@/lib/api";

export default function DisputesPage() {
  return (
    <OpsPage title="Disputes" sub="Oldest first. Nothing is paid until you resolve; the customer is paid once.">
      <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-2xl" />}>
        <Disputes />
      </Suspense>
    </OpsPage>
  );
}

async function Disputes() {
  const disputes = await get<AdminPickup[]>("/admin/disputes");
  if (disputes.length === 0) return <EmptyState icon={CheckCircle2} text="No open disputes." />;
  return (
    <div className="flex flex-col gap-6">
      {disputes.map((d) => (
        <DisputeCard key={d.id} pickup={d} />
      ))}
    </div>
  );
}
