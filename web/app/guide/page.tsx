import type { Metadata } from "next";
import { Suspense } from "react";

import { BtnLink, Card } from "@/components/brand/ui";
import { SiteFooter, SiteHeader } from "@/components/public/site-chrome";
import { Skeleton } from "@/components/ui/skeleton";
import { naira } from "@/lib/format";
import { getCurrentPrices } from "@/lib/public-data";
import { HUB } from "@/lib/site";
import { MATERIALS } from "@/lib/types";

export const metadata: Metadata = {
  title: "Bottle guide: how much is my plastic worth?",
  description: "Today's price per kg for PET bottles, hard plastic, sachets, cans and tins in Enugu, how many items make a kilo and what a full sack is worth.",
  alternates: { canonical: "/guide" },
};

// Public page: bottles per kg and the sack guide, at today's prices (03-screens-and-routes.md).
export default function GuidePage() {
  return (
    <div className="flex min-h-svh flex-col bg-canvas">
      <SiteHeader />
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
              Door pickup starts at 50 kg. Less than that? Join your area&apos;s pickup day, or bring it to the hub: {HUB.address}, {HUB.hours}.
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
      <SiteFooter />
    </div>
  );
}

async function Prices() {
  const prices = await getCurrentPrices();
  if (!prices) return <p className="text-muted-foreground">Prices are not available right now. Try again shortly.</p>;
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
            <p className="tabular font-display text-3xl font-extrabold tracking-[-0.03em] text-primary-ink">
              {naira(perKg)}
              <small className="ml-1 text-base font-semibold text-muted-foreground">/ kg</small>
            </p>
            <ul className="tabular space-y-1 border-t border-subtle pt-2 text-sm">
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
