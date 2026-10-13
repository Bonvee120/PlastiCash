"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components/brand/confirm-dialog";
import { Btn } from "@/components/brand/ui";
import { Field, nairaToKobo, selectClass, useAdminAction } from "@/components/ops/ui";
import { Input } from "@/components/ui/input";
import { addPrice } from "@/lib/admin-actions";
import type { PriceVersion } from "@/lib/admin-types";
import { naira } from "@/lib/format";
import { MATERIALS, materialLabel, type Material } from "@/lib/types";

type Draft = { price: string; sack: string; items: string; co2: string };

function draftOf(p: PriceVersion | undefined): Draft {
  return p
    ? { price: String(p.price_kobo_per_kg / 100), sack: String(Number(p.kg_per_full_sack)), items: p.items_per_kg ? String(p.items_per_kg) : "", co2: String(Number(p.co2_kg_saved_per_kg)) }
    : { price: "", sack: "", items: "", co2: "0" };
}

// Current price per material, and a form for a new version prefilled with the current values.
export function PriceEditor({ current }: { current: PriceVersion[] }) {
  const byMaterial = new Map(current.map((p) => [p.material, p]));
  const [material, setMaterial] = useState<Material>("PET");
  const [draft, setDraft] = useState<Draft>(draftOf(byMaterial.get("PET")));
  const [asking, setAsking] = useState(false);
  const { pending, run } = useAdminAction();

  const priceKobo = nairaToKobo(draft.price);
  const errors = {
    price: priceKobo === null ? "Enter the price in naira, e.g. 185" : undefined,
    sack: !/^\d{1,4}(\.\d{1,2})?$/.test(draft.sack) || Number(draft.sack) <= 0 ? "Kg in one full sack, e.g. 10" : undefined,
    items: draft.items && !/^[1-9]\d{0,4}$/.test(draft.items) ? "A whole number, or leave empty" : undefined,
    co2: !/^\d{1,2}(\.\d{1,3})?$/.test(draft.co2) ? "Kg CO₂ saved per kg, e.g. 1.146" : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);
  const old = byMaterial.get(material);

  function pick(next: Material) {
    setMaterial(next);
    setDraft(draftOf(byMaterial.get(next)));
  }

  async function save() {
    const done = await run(
      () =>
        addPrice({
          material,
          price_kobo_per_kg: priceKobo!,
          kg_per_full_sack: draft.sack,
          items_per_kg: draft.items ? Number(draft.items) : null,
          co2_kg_saved_per_kg: draft.co2,
        }),
      `New ${materialLabel(material)} price saved.`,
    );
    setAsking(false);
    if (done) setDraft(draftOf(done));
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[1fr_420px]">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {MATERIALS.map((m) => {
          const p = byMaterial.get(m.value);
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => pick(m.value)}
              aria-pressed={material === m.value}
              className={`flex flex-col gap-1 rounded-2xl border bg-card p-4 text-left ${material === m.value ? "border-2 border-primary" : "border-border"}`}
            >
              <span className="eyebrow text-muted-foreground">{m.label}</span>
              <b className="tabular text-2xl">{p ? naira(p.price_kobo_per_kg) : "–"}</b>
              <span className="text-xs text-muted-foreground">per kg</span>
            </button>
          );
        })}
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-lg font-bold">New version</h2>
        <Field id="material" label="Material">
          <select id="material" value={material} onChange={(e) => pick(e.target.value as Material)} className={selectClass}>
            {MATERIALS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="price" label="Price per kg (₦)" error={errors.price}>
            <Input id="price" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} className="tabular" />
          </Field>
          <Field id="sack" label="Kg per full sack" error={errors.sack}>
            <Input id="sack" inputMode="decimal" value={draft.sack} onChange={(e) => setDraft({ ...draft, sack: e.target.value })} className="tabular" />
          </Field>
          <Field id="items" label="Items per kg" error={errors.items} hint="For the guide; optional">
            <Input id="items" inputMode="numeric" value={draft.items} onChange={(e) => setDraft({ ...draft, items: e.target.value })} className="tabular" />
          </Field>
          <Field id="co2" label="CO₂ kg saved per kg" error={errors.co2}>
            <Input id="co2" inputMode="decimal" value={draft.co2} onChange={(e) => setDraft({ ...draft, co2: e.target.value })} className="tabular" />
          </Field>
        </div>
        <Btn variant="primary" disabled={!valid || pending} onClick={() => setAsking(true)}>
          Save new version
        </Btn>
      </section>

      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={`${materialLabel(material)}: ${old ? naira(old.price_kobo_per_kg) : "–"} → ${priceKobo !== null ? naira(priceKobo) : "–"} per kg?`}
        description="Applies to every weighing from now on, and to estimates and the guide. Pickups already weighed keep their price."
        confirmLabel="Save price"
        onConfirm={save}
        pending={pending}
      />
    </div>
  );
}
