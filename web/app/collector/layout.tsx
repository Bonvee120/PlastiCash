import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import { AreaGate, AreaSkeleton } from "@/components/layout/area-gate";

// Collector area: only role COLLECTOR.
// Logged-in area: never in search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function CollectorLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AreaSkeleton />}>
      <AreaGate role="COLLECTOR">{children}</AreaGate>
    </Suspense>
  );
}
