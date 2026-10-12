import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import { AreaGate, AreaSkeleton } from "@/components/layout/area-gate";

// Admin area: only role ADMIN. Not linked from the public site; the API still checks the role on every call.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AreaSkeleton />}>
      <AreaGate role="ADMIN">{children}</AreaGate>
    </Suspense>
  );
}
