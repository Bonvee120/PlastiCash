import { Suspense } from "react";

import { HeroAdmin } from "@/components/ops/hero-admin";
import { OpsPage } from "@/components/ops/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { get } from "@/lib/api";
import type { HeroSlide } from "@/lib/content";

export default function OpsHeroPage() {
  return (
    <OpsPage title="Hero slides" sub="Photos in the landing page carousel, in order. Real Enugu photos only (design brief §10).">
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-2xl" />}>
        <Slides />
      </Suspense>
    </OpsPage>
  );
}

async function Slides() {
  return <HeroAdmin slides={await get<HeroSlide[]>("/admin/hero-slides")} />;
}
