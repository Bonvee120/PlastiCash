import { Suspense } from "react";

import { BalesTable, CreateBale } from "@/components/ops/stock";
import { OpsPage, StatCard } from "@/components/ops/ui";
import { Skeleton } from "@/components/ui/skeleton";
import type { Stock } from "@/lib/admin-types";
import { get } from "@/lib/api";
import { kg, naira } from "@/lib/format";
import { materialLabel } from "@/lib/types";

export default function StockPage() {
  return (
    <OpsPage title="Stock and bales" sub="Raw stock = net kg from completed pickups − kg already in bales.">
      <Suspense fallback={<Skeleton className="h-[480px] w-full rounded-2xl" />}>
        <StockData />
      </Suspense>
    </OpsPage>
  );
}

async function StockData() {
  const stock = await get<Stock>("/admin/stock");
  const balesOf = (material: string, status: string) => stock.bales.filter((b) => b.material === material && b.status === status).length;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Raw kg in" value={kg(stock.raw_in_kg)} hint="All completed pickups" />
        <StatCard label="In bales" value={kg(stock.baled_kg)} />
        <StatCard label="Raw stock" value={kg(stock.raw_stock_kg)} />
        <StatCard
          label="Real loss %"
          value={stock.loss_pct === null ? "–" : `${stock.loss_pct}%`}
          hint="(raw in − bales) ÷ raw in; counts plastic not baled yet"
        />
        <StatCard label="Revenue" value={naira(stock.revenue_kobo)} hint={`${stock.bales_by_status.SOLD} bales sold`} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stock.materials.map((m) => (
          <section key={m.material} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
            <h2 className="font-bold">{materialLabel(m.material)}</h2>
            <b className="tabular text-2xl">{kg(m.raw_stock_kg)}</b>
            <span className="text-xs text-muted-foreground">raw stock of {kg(m.raw_in_kg)} in</span>
            <dl className="tabular grid grid-cols-3 gap-1 border-t border-subtle pt-2 text-center text-xs">
              <div>
                <dt className="text-muted-foreground">In store</dt>
                <dd className="font-bold">{balesOf(m.material, "IN_STORE")}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Processed</dt>
                <dd className="font-bold">{balesOf(m.material, "PROCESSED")}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Sold</dt>
                <dd className="font-bold">{balesOf(m.material, "SOLD")}</dd>
              </div>
            </dl>
            <span className="text-xs text-muted-foreground">Loss: {m.loss_pct === null ? "–" : `${m.loss_pct}%`}</span>
          </section>
        ))}
      </div>

      <CreateBale materials={stock.materials} />
      <BalesTable bales={stock.bales} />
    </>
  );
}
