import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";

// Step 3.3 placeholder: proves login and logout work. Step 3.4 adds the area layouts, role redirects and greeting.
export default function AppHome() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-4">
      <h1 className="text-2xl font-bold text-primary-dark">You&apos;re logged in</h1>
      <Suspense fallback={<Skeleton className="h-6 w-64" />}>
        <SignedInAs />
      </Suspense>
      <LogoutButton />
    </main>
  );
}

// Reads the session cookie, so it renders per request inside Suspense (Cache Components).
async function SignedInAs() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login?next=/app");

  return (
    <p className="text-muted-foreground">
      Signed in as <span className="font-medium text-ink">{String(data.claims.email ?? "")}</span>
    </p>
  );
}
