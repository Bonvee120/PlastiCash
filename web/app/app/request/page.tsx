import { Suspense } from "react";

import { PageTitle } from "@/components/brand/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { loadMe } from "@/lib/me";
import { pricesOrThrow } from "@/lib/public-data";

import { RequestForm } from "./request-form";

export default function RequestPage() {
  return (
    <main className="flex flex-1 flex-col gap-5 p-4 lg:p-8">
      <PageTitle title="Request a pickup" sub="Five quick steps. You see the estimate before you send." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <Form />
      </Suspense>
    </main>
  );
}

async function Form() {
  const [prices, state] = await Promise.all([pricesOrThrow(), loadMe()]);
  const me = state.kind === "ok" ? state.me : null;
  return <RequestForm prices={prices} defaults={{ address: me?.address ?? "", area: me?.area ?? "" }} />;
}
