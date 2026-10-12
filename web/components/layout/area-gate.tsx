import { CircleAlert } from "lucide-react";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { CollectorShell, OpsShell, UserShell } from "@/components/layout/shells";
import { Skeleton } from "@/components/ui/skeleton";
import { loadMe, ROLE_HOME, type Role } from "@/lib/me";

const SHELL = { USER: UserShell, COLLECTOR: CollectorShell, ADMIN: OpsShell } as const;

// Shared gate for /app, /collector and /ops-portal: loads /me, sends people to the right place,
// then renders the area's shell (DESIGN_BRIEF §6) and the page. Reads cookies, so it must sit inside <Suspense>.
export async function AreaGate({ role, children }: { role: Role; children: ReactNode }) {
  const state = await loadMe();
  if (state.kind === "logged-out") redirect("/login");
  if (state.kind === "no-profile") redirect("/signup/details");
  if (state.kind === "inactive") return <InactiveNotice message={state.message} />;

  const { me } = state;
  if (me.role !== role) redirect(ROLE_HOME[me.role]);

  const Shell = SHELL[role];
  return <Shell me={me}>{children}</Shell>;
}

function InactiveNotice({ message }: { message: string }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-4 text-center">
      <CircleAlert className="mx-auto size-10 text-danger" aria-hidden />
      <h1 className="text-[26px] font-bold">Account deactivated</h1>
      <p className="text-muted-foreground">{message}</p>
      <LogoutButton />
    </main>
  );
}

export function AreaSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-14 w-full rounded-2xl" />
      <Skeleton className="h-44 w-full rounded-3xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  );
}
