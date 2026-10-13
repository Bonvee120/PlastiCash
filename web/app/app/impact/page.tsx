import { Leaf } from "lucide-react";
import { Suspense } from "react";

import { EsgReport } from "@/app/app/impact/esg-report";
import { ImpactStats } from "@/components/app/dashboard";
import { BtnLink, Card, EmptyState, Money, PageTitle } from "@/components/brand/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { get } from "@/lib/api";
import { kg } from "@/lib/format";
import type { Me } from "@/lib/me";
import { materialLabel, type Impact } from "@/lib/types";

export default function YourImpactPage() {
  return (
    <main className="flex flex-1 flex-col gap-5 p-4 lg:p-8">
      <PageTitle title="Your impact" sub="From your completed pickups. CO₂ uses US EPA WARM factors per material; sachets use the mixed-plastics factor as an estimate." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <ImpactData />
      </Suspense>
    </main>
  );
}

async function ImpactData() {
  const [impact, me] = await Promise.all([get<Impact>("/impact"), get<Me>("/me")]);
  const most = Math.max(...impact.by_material.map((m) => Number(m.kg)), 1);

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1fr_380px] lg:items-start">
      <div className="flex flex-col gap-5">
        <ImpactStats impact={impact} />
        <Card>
          <h3 className="text-[17px] font-bold">Kg by material</h3>
          {impact.by_material.length === 0 ? (
            <EmptyState
              icon={Leaf}
              text="Your impact shows here after your first completed pickup."
              action={
                <BtnLink href="/app/request" variant="primary" size="sm">
                  Request a pickup
                </BtnLink>
              }
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {impact.by_material.map((m) => (
                <li key={m.material} className="flex flex-col gap-1.5">
                  <span className="flex flex-wrap justify-between gap-x-3 text-sm">
                    <b>{materialLabel(m.material)}</b>
                    <span className="tabular text-muted-foreground">
                      {kg(m.kg)} · {kg(m.co2_kg)} CO₂
                    </span>
                  </span>
                  <span className="h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max((Number(m.kg) / most) * 100, 2)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="flex flex-col gap-5">
        <Card className="gap-1 border-[#FDE68A] bg-cream">
          <span className="eyebrow text-[#92400E]">Points earned</span>
          <Money kobo={impact.earned_kobo} className="text-2xl font-bold whitespace-normal" />
          <span className="text-sm text-muted-foreground">from {impact.pickups} completed pickups</span>
        </Card>
        {me.account_type === "ORGANIZATION" && <EsgReport />}
      </div>
    </div>
  );
}
