"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components/brand/confirm-dialog";
import { Btn } from "@/components/brand/ui";
import { Field, nairaToKobo, selectClass, useAdminAction } from "@/components/ops/ui";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createBale, processBale, sellBale } from "@/lib/admin-actions";
import type { Bale, Stock } from "@/lib/admin-types";
import { day, kg, naira } from "@/lib/format";
import { materialLabel, type Material } from "@/lib/types";
import { cn } from "@/lib/utils";

const KG = /^\d{1,5}(\.\d{1,2})?$/;
const TONE: Record<Bale["status"], string> = {
  IN_STORE: "bg-info-soft text-info",
  PROCESSED: "bg-cream text-warn",
  SOLD: "bg-mint text-primary",
};

// New bale: material and weight, never more than that material's raw stock (the API refuses it too, test 19).
export function CreateBale({ materials }: { materials: Stock["materials"] }) {
  const { pending, run } = useAdminAction();
  const [material, setMaterial] = useState<Material>(materials.find((m) => Number(m.raw_stock_kg) > 0)?.material ?? "PET");
  const [weight, setWeight] = useState("");
  const available = Number(materials.find((m) => m.material === material)?.raw_stock_kg ?? 0);
  const error = !weight ? undefined : !KG.test(weight) || Number(weight) <= 0 ? "Kg with up to 2 decimals" : Number(weight) > available ? `Only ${kg(available)} in raw stock` : undefined;

  async function create() {
    const bale = await run(() => createBale(material, weight), (b) => `Bale ${b.code} created.`);
    if (bale) setWeight("");
  }

  return (
    <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="w-full text-lg font-bold">New bale</h2>
      <Field id="bale-material" label="Material">
        <select id="bale-material" value={material} onChange={(e) => setMaterial(e.target.value as Material)} className={selectClass}>
          {materials.map((m) => (
            <option key={m.material} value={m.material}>
              {materialLabel(m.material)} ({kg(m.raw_stock_kg)} raw)
            </option>
          ))}
        </select>
      </Field>
      <Field id="bale-weight" label="Weight (kg)" error={error}>
        <Input id="bale-weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(",", "."))} aria-invalid={!!error} className="tabular w-36" />
      </Field>
      <Btn variant="primary" disabled={!weight || !!error || pending} onClick={create}>
        {pending ? "Creating…" : "Create bale"}
      </Btn>
    </section>
  );
}

export function BalesTable({ bales }: { bales: Bale[] }) {
  const { pending, run } = useAdminAction();
  const [selling, setSelling] = useState<Bale | null>(null);

  if (bales.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">No bales yet.</p>;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <h2 className="px-4 pt-4 pb-3 text-lg font-bold">Bales</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Material</TableHead>
            <TableHead className="text-right">Weight</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Made</TableHead>
            <TableHead>Sold to</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bales.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="tabular font-semibold">{b.code}</TableCell>
              <TableCell>{materialLabel(b.material)}</TableCell>
              <TableCell className="tabular text-right">{kg(b.weight_kg)}</TableCell>
              <TableCell>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", TONE[b.status])}>{b.status.replace("_", " ").toLowerCase()}</span>
              </TableCell>
              <TableCell className="tabular text-sm">{day(b.created_at)}</TableCell>
              <TableCell className="text-sm">{b.buyer ?? "–"}</TableCell>
              <TableCell className="tabular text-right">{b.sale_price_kobo !== null ? naira(b.sale_price_kobo) : "–"}</TableCell>
              <TableCell className="text-right">
                {b.status === "IN_STORE" && (
                  <Btn variant="outline" size="sm" disabled={pending} onClick={() => run(() => processBale(b.id), `${b.code} marked processed.`)}>
                    Mark processed
                  </Btn>
                )}
                {b.status === "PROCESSED" && (
                  <Btn variant="primary" size="sm" onClick={() => setSelling(b)}>
                    Sell
                  </Btn>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {selling && <SellDialog bale={selling} onClose={() => setSelling(null)} />}
    </section>
  );
}

function SellDialog({ bale, onClose }: { bale: Bale; onClose: () => void }) {
  const { pending, run } = useAdminAction({ onDone: onClose });
  const [buyer, setBuyer] = useState("");
  const [price, setPrice] = useState("");
  const kobo = nairaToKobo(price);
  async function sell() {
    await run(() => sellBale(bale.id, buyer.trim(), kobo!), `${bale.code} sold to ${buyer.trim()}.`);
  }
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Sell ${bale.code}`}
      description={`${materialLabel(bale.material)}, ${kg(bale.weight_kg)}.`}
      confirmLabel="Record sale"
      onConfirm={sell}
      pending={pending}
      disabled={buyer.trim().length < 2 || kobo === null}
    >
      <div className="flex flex-col gap-3">
        <Field id="buyer" label="Buyer">
          <Input id="buyer" maxLength={200} value={buyer} onChange={(e) => setBuyer(e.target.value)} />
        </Field>
        <Field id="sale-price" label="Sale price (₦, whole bale)" error={price && kobo === null ? "Enter an amount in naira" : undefined}>
          <Input id="sale-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="tabular" />
        </Field>
      </div>
    </ConfirmDialog>
  );
}
