import { Suspense, type ReactNode } from "react";

import { AreaGate, AreaSkeleton } from "@/components/layout/area-gate";

// User area: only role USER. Collectors and admins are sent to their own area.
export default function UserLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AreaSkeleton />}>
      <AreaGate role="USER">{children}</AreaGate>
    </Suspense>
  );
}
