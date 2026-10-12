import { Suspense, type ReactNode } from "react";

import { AreaGate, AreaSkeleton } from "@/components/layout/area-gate";

// Collector area: only role COLLECTOR.
export default function CollectorLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AreaSkeleton />}>
      <AreaGate role="COLLECTOR">{children}</AreaGate>
    </Suspense>
  );
}
