import { Suspense } from "react";

import { PriceEditor } from "@/components/ops/price-editor";
import { OpsPage } from "@/components/ops/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PriceVersion } from "@/lib/admin-types";
import { get } from "@/lib/api";
import { dateTime, naira } from "@/lib/format";
import { materialLabel } from "@/lib/types";

export default function PricesPage() {
  return (
    <OpsPage title="Prices" sub="A new price is a new version from now on. Pickups already weighed keep their price.">
      <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-2xl" />}>
        <Prices />
      </Suspense>
    </OpsPage>
  );
}

async function Prices() {
  const history = await get<PriceVersion[]>("/admin/prices");
  // History is newest first within each material, so the first row per material is the current one.
  const latest = new Map<string, PriceVersion>();
  for (const p of history) if (!latest.has(p.material)) latest.set(p.material, p);
  return (
    <>
      <PriceEditor current={[...latest.values()]} />
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <h2 className="px-4 pt-4 pb-3 text-lg font-bold">History</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead className="text-right">Price / kg</TableHead>
              <TableHead className="text-right">Kg per full sack</TableHead>
              <TableHead className="text-right">Items per kg</TableHead>
              <TableHead className="text-right">CO₂ kg saved / kg</TableHead>
              <TableHead>From</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular">
            {history.map((p) => (
              <TableRow key={p.id} className={latest.get(p.material)?.id === p.id ? "font-semibold" : "text-muted-foreground"}>
                <TableCell className="font-sans">
                  {materialLabel(p.material)}
                  {latest.get(p.material)?.id === p.id && (
                    <span className="ml-2 rounded bg-mint px-1.5 py-0.5 text-[11px] font-bold text-primary">Current</span>
                  )}
                </TableCell>
                <TableCell className="text-right">{naira(p.price_kobo_per_kg)}</TableCell>
                <TableCell className="text-right">{Number(p.kg_per_full_sack)}</TableCell>
                <TableCell className="text-right">{p.items_per_kg ?? "–"}</TableCell>
                <TableCell className="text-right">{Number(p.co2_kg_saved_per_kg)}</TableCell>
                <TableCell>{dateTime(p.effective_from)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  );
}
