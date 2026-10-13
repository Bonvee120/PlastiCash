"use client";

import { useState } from "react";

import { WeightTable } from "@/components/app/weight-table";
import { ConfirmDialog } from "@/components/brand/confirm-dialog";
import { Btn } from "@/components/brand/ui";
import { useAdminAction } from "@/components/ops/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveDispute } from "@/lib/admin-actions";
import type { AdminPickup } from "@/lib/admin-types";
import { dateTime, kg, money, ref } from "@/lib/format";
import { materialLabel } from "@/lib/types";
import { photo } from "@/lib/upload";

const KG = /^\d{1,4}(\.\d{1,2})?$/;

// Same rounding as the API: hundredths of a kg × kobo per kg, half up to the kobo.
function amountKobo(netKg: string, priceKoboPerKg: number) {
  const centi = Math.round(Number(netKg) * 100);
  return Math.floor((centi * priceKoboPerKg + 50) / 100);
}

// Collector photo and customer photo side by side, each weight, the customer's words; then the final kg per material
// (priced with the original snapshot) and a note (DESIGN_BRIEF.md, ops disputes).
export function DisputeCard({ pickup }: { pickup: AdminPickup }) {
  const { pending, run } = useAdminAction();
  const [finals, setFinals] = useState<Record<string, string>>(
    Object.fromEntries(pickup.items.map((i) => [i.material, Number(i.net_kg).toFixed(2)])),
  );
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const valid = pickup.items.every((i) => KG.test(finals[i.material] ?? "")) && note.trim().length >= 3;
  const total = valid ? pickup.items.reduce((sum, i) => sum + amountKobo(finals[i.material]!, i.price_kobo_per_kg), 0) : 0;
  const totalKg = valid ? pickup.items.reduce((sum, i) => sum + Number(finals[i.material]), 0) : 0;

  async function resolve() {
    const items = pickup.items.map((i) => ({ material: i.material, net_kg: finals[i.material]! }));
    await run(() => resolveDispute(pickup.id, items, note.trim()), `${ref(pickup.id)} resolved: ${pickup.user_name} paid ${money(total)}.`);
    setAsking(false);
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-[#FCA5A5] bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">
          {pickup.user_name} · <span className="tabular">{ref(pickup.id)}</span>
        </h2>
        <span className="text-sm text-muted-foreground">
          Weighed by {pickup.collector_name ?? "–"} · {dateTime(pickup.weighed_at)}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Side title="Collector" photoUrl={pickup.weigh_photo_url} alt="Collector's scale photo">
          <WeightTable items={pickup.items} totalKg={pickup.total_net_kg} totalKobo={pickup.total_amount_kobo} />
        </Side>
        <Side title="Customer" photoUrl={pickup.dispute_photo_url} alt="Customer's photo">
          <div className="rounded-2xl border border-border p-4">
            <span className="eyebrow text-muted-foreground">Claims</span>
            <b className="tabular block text-2xl">{kg(pickup.dispute_claimed_kg)}</b>
            <span className="tabular text-sm text-muted-foreground">Collector said {kg(pickup.total_net_kg)} net</span>
            <p className="mt-3 text-[15px]">&ldquo;{pickup.dispute_reason}&rdquo;</p>
          </div>
        </Side>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-canvas p-4">
        <h3 className="font-bold">Decision: final kg per material</h3>
        <div className="flex flex-wrap gap-4">
          {pickup.items.map((i) => {
            const id = `${pickup.id}-${i.material}`;
            return (
              <div key={i.material} className="flex w-44 flex-col gap-1.5">
                <Label htmlFor={id}>
                  {materialLabel(i.material)} <span className="text-muted-foreground">(₦{i.price_kobo_per_kg / 100}/kg)</span>
                </Label>
                <Input
                  id={id}
                  inputMode="decimal"
                  value={finals[i.material] ?? ""}
                  onChange={(e) => setFinals({ ...finals, [i.material]: e.target.value.replace(",", ".") })}
                  aria-invalid={!KG.test(finals[i.material] ?? "")}
                  className="tabular"
                />
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${pickup.id}-note`}>Note to the customer</Label>
          <Input
            id={`${pickup.id}-note`}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Reweighed at the hub: 14.2 kg after drying"
          />
        </div>
        <Btn variant="primary" className="self-start" disabled={!valid || pending} onClick={() => setAsking(true)}>
          Resolve and pay {valid ? money(total) : "…"}
        </Btn>
      </div>

      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={`Pay ${pickup.user_name} ${money(total)}?`}
        description={`${totalKg.toFixed(2)} kg net at the prices on the day of weighing. This completes the pickup and can't be undone; later corrections are adjustments.`}
        confirmLabel="Resolve and pay"
        onConfirm={resolve}
        pending={pending}
      />
    </section>
  );
}

function Side({ title, photoUrl, alt, children }: { title: string; photoUrl: string | null; alt: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="eyebrow text-muted-foreground">{title}</h3>
      {photoUrl ? (
        <a href={photo(photoUrl, 1600)} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary already resizes it */}
          <img src={photo(photoUrl, 800)} alt={alt} className="h-64 w-full rounded-xl bg-muted object-cover" />
        </a>
      ) : (
        <div className="grid h-64 place-items-center rounded-xl bg-muted text-sm text-muted-foreground">No photo</div>
      )}
      {children}
    </div>
  );
}
