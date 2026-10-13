"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/brand/confirm-dialog";
import { Btn } from "@/components/brand/ui";
import { Field, useAdminAction } from "@/components/ops/ui";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { approveWithdrawal, rejectWithdrawal } from "@/lib/admin-actions";
import type { AdminWithdrawal } from "@/lib/admin-types";
import { dateTime, money } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONE: Record<AdminWithdrawal["status"], string> = {
  PENDING: "bg-cream text-warn",
  PROCESSING: "bg-info-soft text-info",
  PAID: "bg-mint text-primary",
  FAILED: "bg-bad-soft text-bad",
  REJECTED: "bg-bad-soft text-bad",
};

export function WithdrawalQueue({ rows }: { rows: AdminWithdrawal[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState<AdminWithdrawal[] | null>(null);
  const [rejecting, setRejecting] = useState<AdminWithdrawal | null>(null);
  const [sending, setSending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = sending || refreshing;
  const pending = rows.filter((r) => r.status === "PENDING");
  const chosen = pending.filter((r) => selected.has(r.id));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  // One at a time, so each transfer is sent once and a failure doesn't stop the others.
  async function approve(list: AdminWithdrawal[]) {
    setSending(true);
    let sent = 0;
    for (const w of list) {
      const result = await approveWithdrawal(w.id);
      if (!result.ok) toast.error(`${w.user_name}: ${result.error.message}`);
      else if (result.data.status === "FAILED") toast.error(`${w.user_name}: ${result.data.failure_reason ?? "Paystack refused"}. Money returned.`);
      else sent += 1;
    }
    setSending(false);
    setApproving(null);
    setSelected(new Set());
    if (sent) toast.success(`${sent} transfer${sent === 1 ? "" : "s"} sent to Paystack.`);
    startRefresh(() => router.refresh());
  }

  if (rows.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">Nothing here.</p>;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      {pending.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <span className="text-sm text-muted-foreground">
            {chosen.length ? `${chosen.length} selected · ${money(chosen.reduce((s, w) => s + w.amount_kobo, 0))}` : "Select rows to approve together."}
          </span>
          <Btn variant="primary" size="sm" className="ml-auto" disabled={!chosen.length || busy} onClick={() => setApproving(chosen)}>
            Approve selected
          </Btn>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {pending.length > 0 && (
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  className="size-4 accent-[#15803D]"
                  checked={chosen.length === pending.length}
                  onChange={(e) => setSelected(new Set(e.target.checked ? pending.map((p) => p.id) : []))}
                />
              </TableHead>
            )}
            <TableHead>Customer</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Bank</TableHead>
            <TableHead>Requested</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((w) => (
            <TableRow key={w.id}>
              {pending.length > 0 && (
                <TableCell>
                  {w.status === "PENDING" && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${w.user_name}`}
                      className="size-4 accent-[#15803D]"
                      checked={selected.has(w.id)}
                      onChange={() => toggle(w.id)}
                    />
                  )}
                </TableCell>
              )}
              <TableCell className="font-semibold">{w.user_name}</TableCell>
              <TableCell className="tabular text-right font-semibold">{money(w.amount_kobo)}</TableCell>
              <TableCell className="text-sm">
                {w.account_name}
                <span className="tabular block text-xs text-muted-foreground">
                  {w.bank_name} •••• {w.account_number_last4}
                </span>
              </TableCell>
              <TableCell className="tabular text-sm">{dateTime(w.created_at)}</TableCell>
              <TableCell>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", TONE[w.status])}>{w.status.toLowerCase()}</span>
                {w.failure_reason && <span className="mt-1 block max-w-56 text-xs text-bad">{w.failure_reason}</span>}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                {w.status === "PENDING" && (
                  <>
                    <Btn variant="primary" size="sm" disabled={busy} onClick={() => setApproving([w])}>
                      Approve
                    </Btn>
                    <Btn variant="ghost" size="sm" className="ml-1" disabled={busy} onClick={() => setRejecting(w)}>
                      Reject
                    </Btn>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {approving && <ApproveDialog list={approving} busy={busy} onConfirm={() => approve(approving)} onClose={() => setApproving(null)} />}
      {rejecting && <RejectDialog withdrawal={rejecting} onClose={() => setRejecting(null)} />}
    </section>
  );
}

function ApproveDialog({ list, busy, onConfirm, onClose }: { list: AdminWithdrawal[]; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  const [first] = list;
  const total = list.reduce((s, w) => s + w.amount_kobo, 0);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={list.length === 1 && first ? `Send ${money(first.amount_kobo)} to ${first.user_name}?` : `Send ${list.length} transfers, ${money(total)} in total?`}
      description="Paystack sends the money from the EcoCyclers balance. This can't be undone."
      confirmLabel="Approve and send"
      onConfirm={onConfirm}
      pending={busy}
    >
      {list.length === 1 && first && (
        <p className="rounded-xl bg-mist px-3 py-2.5 text-sm">
          {first.account_name} · {first.bank_name} •••• {first.account_number_last4}
        </p>
      )}
    </ConfirmDialog>
  );
}

function RejectDialog({ withdrawal, onClose }: { withdrawal: AdminWithdrawal; onClose: () => void }) {
  const { pending, run } = useAdminAction({ onDone: onClose });
  const [reason, setReason] = useState("");
  async function reject() {
    await run(() => rejectWithdrawal(withdrawal.id, reason.trim()), `Rejected. ${money(withdrawal.amount_kobo)} is back in ${withdrawal.user_name}'s wallet.`);
  }
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Reject ${money(withdrawal.amount_kobo)} for ${withdrawal.user_name}?`}
      description="The money goes back to their wallet. They see your reason."
      confirmLabel="Reject"
      tone="danger"
      onConfirm={reject}
      pending={pending}
      disabled={!reason.trim()}
    >
      <Field id="reject-reason" label="Reason">
        <Input id="reject-reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Account name doesn't match" />
      </Field>
    </ConfirmDialog>
  );
}
