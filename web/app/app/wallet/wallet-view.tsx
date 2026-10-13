"use client";

import { BadgeCheck, Landmark } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { entryLabel } from "@/components/app/dashboard";
import { ConfirmDialog } from "@/components/brand/confirm-dialog";
import { Btn, BtnLink, Card, MoneyDisplay } from "@/components/brand/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestWithdrawal } from "@/lib/actions";
import { dateTime, money, naira, pts } from "@/lib/format";
import type { Me } from "@/lib/me";
import type { LedgerEntry, Wallet, Withdrawal } from "@/lib/types";
import { cn } from "@/lib/utils";

const MIN_KOBO = 100_000;
const FILTERS = { all: "All", earned: "Earned", withdrawals: "Withdrawals" } as const;
type Filter = keyof typeof FILTERS;

const W_STATUS: Record<Withdrawal["status"], { label: string; tone: string }> = {
  PENDING: { label: "Waiting for approval", tone: "bg-cream text-warn" },
  PROCESSING: { label: "Sending", tone: "bg-info-soft text-info" },
  PAID: { label: "Paid", tone: "bg-mint text-primary" },
  FAILED: { label: "Failed, money returned", tone: "bg-bad-soft text-bad" },
  REJECTED: { label: "Rejected, money returned", tone: "bg-bad-soft text-bad" },
};

export function WalletView({ wallet, withdrawals, bank }: { wallet: Wallet; withdrawals: Withdrawal[]; bank: Me["bank"] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = wallet.entries.filter((e) =>
    filter === "all" ? true : filter === "earned" ? e.amount_kobo > 0 && e.type !== "WITHDRAWAL_REVERSAL" : e.type.startsWith("WITHDRAWAL"),
  );
  // Running balance, newest first: start from the current balance and walk back.
  let running = wallet.balance_kobo;
  const balances = new Map<string, number>();
  for (const e of wallet.entries) {
    balances.set(e.id, running);
    running -= e.amount_kobo;
  }

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[380px_1fr] lg:items-start">
      <div className="flex flex-col gap-5">
        <Card className="gap-4 border-warn-line bg-cream">
          <span className="eyebrow text-warn-strong">Balance</span>
          <MoneyDisplay kobo={wallet.balance_kobo} size="xl" />
        </Card>
        <BankRow bank={bank} />
        <WithdrawForm balance={wallet.balance_kobo} bank={bank} />
        {withdrawals.length > 0 && (
          <Card className="gap-0 p-0">
            <h3 className="px-[18px] pt-4 pb-2 text-[17px] font-bold">Withdrawals</h3>
            <ul>
              {withdrawals.map((w) => (
                <li key={w.id} className="flex items-center gap-3 border-t border-subtle px-[18px] py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <b className="tabular block">{money(w.amount_kobo)}</b>
                    <small className="tabular text-[11px] text-muted-foreground">
                      {dateTime(w.created_at)} · {w.bank_name} •••• {w.account_number_last4}
                    </small>
                    {w.failure_reason && <small className="block text-[11px] text-bad">{w.failure_reason}</small>}
                  </div>
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", W_STATUS[w.status].tone)}>{W_STATUS[w.status].label}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <Card className="gap-0 p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-[18px] pt-4 pb-3">
          <h3 className="text-[17px] font-bold">History</h3>
          <div className="flex gap-2" role="tablist" aria-label="Filter history">
            {(Object.keys(FILTERS) as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn("rounded-full px-3 py-1 text-sm font-semibold", filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-slate-600")}
              >
                {FILTERS[f]}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="px-[18px] pb-6 text-sm text-muted-foreground">Nothing here yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="eyebrow bg-canvas text-left text-muted-foreground">
              <tr>
                <th className="px-[18px] py-2.5 font-semibold">What</th>
                <th className="hidden px-2 py-2.5 font-semibold sm:table-cell">Date</th>
                <th className="px-2 py-2.5 text-right font-semibold">Points</th>
                <th className="hidden px-[18px] py-2.5 text-right font-semibold lg:table-cell">Balance</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <EntryRow key={e.id} entry={e} balance={balances.get(e.id)!} />
              ))}
            </tbody>
          </table>
        )}
        {wallet.total_entries > wallet.entries.length && (
          <p className="px-[18px] py-3 text-xs text-muted-foreground">Showing the latest {wallet.entries.length} of {wallet.total_entries}.</p>
        )}
      </Card>
    </div>
  );
}

function EntryRow({ entry, balance }: { entry: LedgerEntry; balance: number }) {
  return (
    <tr className="border-t border-subtle">
      <td className="px-[18px] py-3">
        {entry.pickup_id ? (
          <Link href={`/app/pickups/${entry.pickup_id}`} className="font-semibold hover:text-primary">
            {entryLabel(entry)}
          </Link>
        ) : (
          <span className="font-semibold">{entryLabel(entry)}</span>
        )}
        <small className="tabular block text-[11px] text-muted-foreground sm:hidden">{dateTime(entry.created_at)}</small>
      </td>
      <td className="tabular hidden px-2 py-3 text-muted-foreground sm:table-cell">{dateTime(entry.created_at)}</td>
      <td className={cn("tabular px-2 py-3 text-right font-semibold", entry.amount_kobo >= 0 ? "text-primary" : "text-warn")}>
        {entry.amount_kobo >= 0 ? "+" : "−"}
        {pts(Math.abs(entry.amount_kobo)).replace(" pts", "")}
      </td>
      <td className="tabular hidden px-[18px] py-3 text-right text-muted-foreground lg:table-cell">{pts(balance).replace(" pts", "")}</td>
    </tr>
  );
}

function BankRow({ bank }: { bank: Me["bank"] }) {
  if (!bank) {
    return (
      <Card className="flex-row items-center gap-3">
        <Landmark className="size-5 text-muted-foreground" aria-hidden />
        <p className="flex-1 text-sm">Add your bank account to withdraw.</p>
        <BtnLink href="/app/settings#bank" size="sm" variant="outline">
          Add bank
        </BtnLink>
      </Card>
    );
  }
  return (
    <Card className="flex-row items-center gap-3">
      <BadgeCheck className="size-5 text-primary" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <b className="block">{bank.account_name}</b>
        <span className="tabular text-xs text-muted-foreground">
          {bank.bank_name} •••• {bank.account_number_last4}
        </span>
      </div>
      <Link href="/app/settings#bank" className="text-sm font-bold text-primary">
        Change
      </Link>
    </Card>
  );
}

function WithdrawForm({ balance, bank }: { balance: number; bank: Me["bank"] }) {
  const router = useRouter();
  const [naira_, setNaira] = useState("");
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const amount = Math.round(Number(naira_ || 0) * 100);
  const error =
    !naira_ ? null : amount < MIN_KOBO ? "The minimum is ₦1,000." : amount > balance ? "That's more than your balance." : null;
  const quick = [100_000, 200_000, balance].filter((k, i, all) => k >= MIN_KOBO && k <= balance && all.indexOf(k) === i);

  async function withdraw() {
    setPending(true);
    const result = await requestWithdrawal(amount);
    setPending(false);
    setAsking(false);
    if (!result.ok) return toast.error(result.error.message);
    toast.success(`Withdrawal of ${naira(amount)} requested. We'll send it after approval.`);
    setNaira("");
    router.refresh();
  }

  return (
    <Card id="withdraw" className="gap-3">
      <h3 className="text-[17px] font-bold">Withdraw to your bank</h3>
      {!bank ? (
        <p className="text-sm text-muted-foreground">Add a bank account first.</p>
      ) : balance < MIN_KOBO ? (
        <p className="text-sm text-muted-foreground">You can withdraw once you have ₦1,000.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {quick.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setNaira(String(k / 100))}
                className="tabular rounded-full bg-mist px-3 py-1.5 text-sm font-semibold text-primary-ink ring-1 ring-mint-line"
              >
                {k === balance ? `All (${naira(k)})` : naira(k)}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="amount">Amount (₦)</Label>
            <Input
              id="amount"
              inputMode="numeric"
              value={naira_}
              onChange={(e) => setNaira(e.target.value.replace(/[^\d]/g, ""))}
              aria-invalid={!!error}
              className="tabular"
            />
            <p className={cn("text-sm", error ? "text-bad" : "text-muted-foreground")}>{error ?? "Minimum ₦1,000."}</p>
          </div>
          <Btn variant="accent" block disabled={!naira_ || !!error} onClick={() => setAsking(true)}>
            Withdraw
          </Btn>
          <ConfirmDialog
            open={asking}
            onOpenChange={setAsking}
            title={`Withdraw ${naira(amount)}?`}
            confirmLabel="Withdraw"
            onConfirm={withdraw}
            pending={pending}
          >
            <div className="rounded-xl bg-mist px-3 py-2.5 text-sm">
              <p>
                To <b>{bank.account_name}</b>
              </p>
              <p className="tabular text-muted-foreground">
                {bank.bank_name} •••• {bank.account_number_last4}
              </p>
              <p className="mt-1.5 text-muted-foreground">EcoCyclers approves it, then it arrives in minutes. The amount leaves your balance now.</p>
            </div>
          </ConfirmDialog>
        </>
      )}
    </Card>
  );
}
