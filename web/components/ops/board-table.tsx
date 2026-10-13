"use client";

import { Image as ImageIcon } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/brand/confirm-dialog";
import { Btn, StatusBadge } from "@/components/brand/ui";
import { Field, selectClass, useAdminAction } from "@/components/ops/ui";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminCancelPickup, assignPickup } from "@/lib/admin-actions";
import type { AdminPickup, UserRow } from "@/lib/admin-types";
import { day, kg, money, ref, WINDOW_LABEL } from "@/lib/format";
import { photo } from "@/lib/upload";

const LOW_ACCURACY = 0.6;
const CANCELLABLE: AdminPickup["status"][] = ["REQUESTED", "ASSIGNED", "EN_ROUTE"];

function lagosToday() {
  return new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
}

export function BoardTable({ pickups, collectors }: { pickups: AdminPickup[]; collectors: UserRow[] }) {
  const [assigning, setAssigning] = useState<AdminPickup | null>(null);
  const [cancelling, setCancelling] = useState<AdminPickup | null>(null);

  if (pickups.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border bg-white p-8 text-center text-muted-foreground">No pickups match these filters.</p>;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pickup</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Area</TableHead>
            <TableHead className="text-right">Kg</TableHead>
            <TableHead>When</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Collector</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pickups.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="tabular">
                {ref(p.id)}
                <span className="block text-xs text-muted-foreground">{p.channel === "HUB" ? "Hub" : "Door"}</span>
              </TableCell>
              <TableCell>
                <b>{p.user_name}</b>
                <Flags pickup={p} />
              </TableCell>
              <TableCell>{p.area ?? "–"}</TableCell>
              <TableCell className="tabular text-right">
                {p.total_net_kg ? (
                  <>
                    {kg(p.total_net_kg)}
                    <span className="block text-xs text-muted-foreground">{money(p.total_amount_kobo ?? 0)}</span>
                  </>
                ) : (
                  <>est. {kg(p.estimated_kg)}</>
                )}
                {p.request_photo_url && (
                  <a href={photo(p.request_photo_url, 1200)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    <ImageIcon className="size-3" aria-hidden /> Photo
                  </a>
                )}
              </TableCell>
              <TableCell className="tabular text-sm">
                {p.scheduled_date ? (
                  <>
                    {day(p.scheduled_date)} <span className="text-xs text-muted-foreground">(set)</span>
                  </>
                ) : (
                  <>
                    {day(p.preferred_date)}
                    {p.preferred_window && <span className="block text-xs text-muted-foreground">{WINDOW_LABEL[p.preferred_window]}</span>}
                  </>
                )}
              </TableCell>
              <TableCell>
                <StatusBadge status={p.status} />
              </TableCell>
              <TableCell>{p.collector_name ?? "–"}</TableCell>
              <TableCell className="text-right whitespace-nowrap">
                {p.status === "REQUESTED" && (
                  <Btn variant="primary" size="sm" onClick={() => setAssigning(p)}>
                    Assign
                  </Btn>
                )}
                {CANCELLABLE.includes(p.status) && (
                  <Btn variant="ghost" size="sm" className="ml-1" onClick={() => setCancelling(p)}>
                    Cancel
                  </Btn>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {assigning && <AssignDialog pickup={assigning} collectors={collectors} onClose={() => setAssigning(null)} />}
      {cancelling && <CancelDialog pickup={cancelling} onClose={() => setCancelling(null)} />}
    </section>
  );
}

function Flags({ pickup }: { pickup: AdminPickup }) {
  const accuracy = pickup.user_estimate_accuracy === null ? null : Number(pickup.user_estimate_accuracy);
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {pickup.pooled && <span className="rounded bg-[#DBEAFE] px-1.5 py-0.5 text-[11px] font-bold text-[#1D4ED8]">Pool</span>}
      {pickup.under_minimum && <span className="rounded bg-cream px-1.5 py-0.5 text-[11px] font-bold text-[#B45309]">Under minimum</span>}
      {accuracy !== null && accuracy < LOW_ACCURACY && (
        <span className="rounded bg-cream px-1.5 py-0.5 text-[11px] font-bold text-[#B45309]" title="Past actual kg ÷ estimated kg">
          Low estimates ({Math.round(accuracy * 100)}%)
        </span>
      )}
    </span>
  );
}

function AssignDialog({ pickup, collectors, onClose }: { pickup: AdminPickup; collectors: UserRow[]; onClose: () => void }) {
  const { pending, run } = useAdminAction({ onDone: onClose });
  const preferred = pickup.preferred_date && pickup.preferred_date >= lagosToday() ? pickup.preferred_date : lagosToday();
  const [collector, setCollector] = useState(collectors.find((c) => c.area === pickup.area)?.id ?? "");
  const [date, setDate] = useState(preferred);

  async function assign() {
    await run(() => assignPickup(pickup.id, collector, date), `${ref(pickup.id)} assigned.`);
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Assign ${ref(pickup.id)}`}
      description={`${pickup.user_name} · ${pickup.address ?? ""}${pickup.area ? `, ${pickup.area}` : ""} · est. ${kg(pickup.estimated_kg)}`}
      confirmLabel="Assign"
      onConfirm={assign}
      pending={pending}
      disabled={!collector || !date}
    >
      <div className="flex flex-col gap-3">
        <Field id="collector" label="Collector">
          <select id="collector" value={collector} onChange={(e) => setCollector(e.target.value)} className={selectClass}>
            <option value="" disabled>
              Choose a collector
            </option>
            {collectors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
                {c.area ? ` (${c.area})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field id="date" label="Pickup date" hint={pickup.preferred_window ? `Customer prefers ${WINDOW_LABEL[pickup.preferred_window]}` : undefined}>
          <Input id="date" type="date" min={lagosToday()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </ConfirmDialog>
  );
}

function CancelDialog({ pickup, onClose }: { pickup: AdminPickup; onClose: () => void }) {
  const { pending, run } = useAdminAction({ onDone: onClose });
  const [reason, setReason] = useState("");
  async function cancel() {
    await run(() => adminCancelPickup(pickup.id, reason.trim()), `${ref(pickup.id)} cancelled.`);
  }
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Cancel ${ref(pickup.id)}?`}
      description="The customer sees the reason on their pickup."
      confirmLabel="Cancel pickup"
      tone="danger"
      onConfirm={cancel}
      pending={pending}
    >
      <Field id="reason" label="Reason">
        <Input id="reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Collector unavailable this week" />
      </Field>
    </ConfirmDialog>
  );
}
