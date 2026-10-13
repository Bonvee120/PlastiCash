import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { LogoutButton } from "@/components/auth/logout-button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadMe, ROLE_HOME } from "@/lib/me";

import { DetailsForm } from "./details-form";

export const metadata: Metadata = { title: "Finish signing up", robots: { index: false, follow: false } };

// Sign-up step 2 (after email + password and the first login): Individual or Organization details.
export default function DetailsPage() {
  return (
    <AuthCard
      title="Who's recycling?"
      description="This decides what you see. Organizations also get a monthly ESG report."
      step={{ current: 2, total: 2 }}
      footer={<LogoutButton />}
    >
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <OnlyWithoutProfile />
      </Suspense>
    </AuthCard>
  );
}

// Reads the session, so it runs per request inside Suspense.
async function OnlyWithoutProfile() {
  const state = await loadMe();
  if (state.kind === "logged-out") redirect("/login?next=/signup/details");
  if (state.kind === "ok") redirect(ROLE_HOME[state.me.role]);
  if (state.kind === "inactive") redirect("/app");
  return <DetailsForm />;
}
