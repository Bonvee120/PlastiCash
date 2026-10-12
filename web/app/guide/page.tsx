import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { BtnLink, Card } from "@/components/brand/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { get } from "@/lib/api";
import { naira } from "@/lib/format";
import { HUB } from "@/lib/site";
import { MATERIALS, type CurrentPrice } from "@/lib/types";

export const metadata: Metadata = { title: "How much is my plastic? · PlastiCash" };

// Public page: bottles per kg and the sack guide, at today's prices (03-screens-and-routes.md).
export default function GuidePage() {
  return (
    <div className="flex min-h-svh flex-col bg-canvas">
      <header className="flex items-center justify-between border-b border-border bg-white px-4 py-3 lg:px-8">
        <Link href="/" aria-label="PlastiCash home">
          <Logo size={32} />
        </Link>
        <BtnLink href="/login" prefetch={false} size="sm" variant="outline">
          Log in
        </BtnLink>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 p-4 lg:p-8">
        <div>
          <span className="eyebrow text-primary">Guide</span>
          <h1 className="mt-1 text-[28px] leading-tight font-bold lg:text-4xl">How much is my plastic worth?</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            We pay by weight. The collector weighs your plastic in front of you, and you confirm before we pay. These counts help
            you guess the weight before pickup.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
          <Prices />
        </Suspense>
        <Card className="gap-2">
          <h2 className="text-[17px] font-bold">Tips for a better price</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>Empty the bottles and squeeze out water. Water and dirt are taken off the weight.</li>
            <li>Keep each kind in its own sack: bottles, hard plastic, sachets, cans, tins.</li>
            <li>Remove caps if you can and keep them with hard plastic.</li>
            <li>
              Door pickup needs at least 10 kg. Less than that? Bring it to the hub: {HUB.address}, {HUB.hours}.
            </li>
          </ul>
        </Card>
        <div className="flex flex-wrap gap-3">
          <BtnLink href="/signup" prefetch={false} variant="primary">
            Start selling
          </BtnLink>
          <BtnLink href="/app/request" prefetch={false} variant="outline">
            Request a pickup
          </BtnLink>
        </div>
      </main>
    </div>
  );
}

async function Prices() {
  const prices = await get<CurrentPrice[]>("/prices/current");
  const byMaterial = new Map(prices.map((p) => [p.material, p]));
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {MATERIALS.map(({ value, label, hint }) => {
        const p = byMaterial.get(value);
        if (!p) return null;
        const perKg = p.price_kobo_per_kg;
        const sackKg = Number(p.kg_per_full_sack);
        return (
          <Card key={value} className="gap-2">
            <h2 className="text-lg font-bold">{label}</h2>
            <p className="text-sm text-muted-foreground">{hint}</p>
            <p className="tabular font-display text-3xl font-extrabold tracking-[-0.03em] text-primary-dark">
              {naira(perKg)}
              <small className="ml-1 text-base font-semibold text-muted-foreground">/ kg</small>
            </p>
            <ul className="tabular space-y-1 border-t border-[#F1F5F9] pt-2 text-sm">
              {p.items_per_kg && (
                <li>
                  About <b>{p.items_per_kg}</b> {value === "SACHET" ? "sachets" : "items"} = 1 kg = <b>{naira(perKg)}</b>
                </li>
              )}
              <li>
                1 full sack ≈ <b>{sackKg} kg</b> = about <b>{naira(Math.round(sackKg * perKg))}</b>
              </li>
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
