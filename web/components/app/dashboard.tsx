import { ArrowUpRight, Cloud, History, PackageOpen, QrCode, Scale, Truck } from "lucide-react";
import Link from "next/link";

import { LogoMark } from "@/components/brand/logo";
import { BtnLink, Card, EmptyState, MoneyDisplay, StatusBadge, Timeline } from "@/components/brand/ui";
import { dateTime, day, kg, pts, ref, WINDOW_LABEL } from "@/lib/format";
import type { Impact, LedgerEntry, Pickup, Wallet } from "@/lib/types";
import { cn } from "@/lib/utils";

// Dashboard pieces (DESIGN_BRIEF.md §9 /app): wallet first, then the pickup in motion, then one big ask.

export function WalletCard({ wallet }: { wallet: Wallet }) {
  return (
    <section
      className="relative flex flex-col gap-4 overflow-hidden rounded-3xl p-[22px] text-white shadow-raised"
      style={{ background: "linear-gradient(135deg, #15803D, #052E16)" }}
      aria-label="Wallet"
    >
      <LogoMark variant="white" size={180} className="pointer-events-none absolute -top-4 -right-8 rotate-[-14deg] opacity-[0.08]" />
      <div className="flex items-center justify-between">
        <span className="eyebrow text-[#BBF7D0]">Wallet balance</span>
        <span className="tabular rounded-full bg-white/12 px-2.5 py-1 text-xs text-mint">1 pt = ₦1</span>
      </div>
      <MoneyDisplay kobo={wallet.balance_kobo} size="xl" dark />
      <div className="flex gap-2.5">
        <BtnLink href="/app/wallet#withdraw" variant="accent" className="h-12 flex-1">
          <ArrowUpRight className="size-5" aria-hidden /> Withdraw
        </BtnLink>
        <BtnLink href="/app/wallet" variant="glass" className="h-12 flex-1">
          <History className="size-5" aria-hidden /> History
        </BtnLink>
      </div>
    </section>
  );
}

export function RequestCta() {
  return (
    <Card className="flex-row items-center gap-4 border-[#FDE68A] bg-cream">
      <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-amber text-heading">
        <Truck className="size-6" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <b className="font-display text-lg text-heading">Got another sack ready?</b>
        <p className="text-[13px] text-muted-foreground">Door pickup from 50 kg, or drop it at the hub.</p>
      </div>
      <BtnLink href="/app/request" className="hidden sm:inline-flex">
        Request a pickup
      </BtnLink>
    </Card>
  );
}

export function ImpactStats({ impact }: { impact: Impact }) {
  const stats = [
    { label: "recycled", value: Number(impact.total_kg).toLocaleString("en-NG"), unit: "kg", icon: Scale, tone: "bg-mint text-primary" },
    { label: "CO₂ saved", value: Number(impact.co2_kg).toLocaleString("en-NG"), unit: "kg", icon: Cloud, tone: "bg-[#E0F2FE] text-[#0369A1]" },
    { label: "pickups", value: String(impact.pickups), unit: "", icon: Truck, tone: "bg-cream text-[#B45309]" },
  ];
  return (
    <div className="grid grid-cols-3 gap-3.5">
      {stats.map(({ label, value, unit, icon: Icon, tone }) => (
        <div key={label} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-white p-3.5">
          <span className={cn("grid size-8 place-items-center rounded-[10px]", tone)}>
            <Icon className="size-[17px]" aria-hidden />
          </span>
          <span className="font-display text-[22px] font-extrabold tracking-[-0.03em]">
            {value}
            {unit && <small className="ml-0.5 font-sans text-xs font-semibold tracking-normal text-muted-foreground">{unit}</small>}
          </span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}

const ACTIVE: Pickup["status"][] = ["REQUESTED", "ASSIGNED", "EN_ROUTE", "AWAITING_CONFIRMATION", "DISPUTED"];

export function activePickup(pickups: Pickup[]) {
  return pickups.find((p) => ACTIVE.includes(p.status)) ?? null;
}

export function ActivePickupCard({ pickup }: { pickup: Pickup | null }) {
  if (!pickup) {
    return (
      <EmptyState
        icon={PackageOpen}
        text="No pickup in progress. Gather your plastic and request your next pickup."
        action={<BtnLink href="/app/request">Request a pickup</BtnLink>}
      />
    );
  }
  const when = pickup.scheduled_date ?? pickup.preferred_date;
  return (
    <Card className="gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-bold">Active pickup</h3>
          <p className="tabular text-xs text-muted-foreground">
            {ref(pickup.id)}
            {pickup.estimated_kg ? ` · est. ${kg(pickup.estimated_kg)}` : ""}
            {when ? ` · ${day(when)}` : ""}
            {pickup.preferred_window ? ` ${WINDOW_LABEL[pickup.preferred_window]}` : ""}
          </p>
        </div>
        <StatusBadge status={pickup.status} />
      </div>
      {pickup.status === "AWAITING_CONFIRMATION" && pickup.total_amount_kobo !== null && (
        <p className="rounded-xl bg-cream px-3 py-2 text-sm text-heading">
          Weighed {kg(pickup.total_net_kg)} = <b>{pts(pickup.total_amount_kobo)}</b>. Please confirm or tell us what&apos;s wrong.
        </p>
      )}
      {pickup.collector_first_name && pickup.status !== "AWAITING_CONFIRMATION" && (
        <p className="text-sm text-muted-foreground">
          Collector: <b className="text-ink">{pickup.collector_first_name}</b>
        </p>
      )}
      <Timeline status={pickup.status} compact />
      <div className="flex flex-wrap gap-2.5">
        <BtnLink href={`/app/pickups/${pickup.id}`} variant={pickup.status === "AWAITING_CONFIRMATION" ? "primary" : "outline"} size="sm">
          {pickup.status === "AWAITING_CONFIRMATION" ? "Check the weight" : "Open pickup"}
        </BtnLink>
        {pickup.qr_token && (
          <BtnLink href={`/app/pickups/${pickup.id}#qr`} variant="primary" size="sm">
            <QrCode className="size-4" aria-hidden /> Show my QR code
          </BtnLink>
        )}
      </div>
    </Card>
  );
}

const ENTRY_LABEL: Record<LedgerEntry["type"], string> = {
  PICKUP_CREDIT: "Pickup paid",
  WITHDRAWAL_HOLD: "Withdrawal",
  WITHDRAWAL_REVERSAL: "Withdrawal returned",
  ADJUSTMENT: "Adjustment",
};

export function entryLabel(entry: LedgerEntry) {
  return entry.type === "ADJUSTMENT" && entry.note ? entry.note : ENTRY_LABEL[entry.type];
}

export function RecentActivity({ entries }: { entries: LedgerEntry[] }) {
  return (
    <Card className="gap-0 p-0">
      <div className="flex items-center justify-between px-[18px] pt-4 pb-2">
        <h3 className="text-[17px] font-bold">Recent activity</h3>
        <Link href="/app/wallet" className="text-sm font-bold text-primary">
          See all
        </Link>
      </div>
      {entries.length === 0 ? (
        <p className="px-[18px] pb-5 text-sm text-muted-foreground">Nothing yet. Your first pickup will show here.</p>
      ) : (
        <ul>
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 border-t border-[#F1F5F9] px-[18px] py-3">
              <div className="min-w-0 flex-1">
                <b className="block truncate text-sm">{entryLabel(e)}</b>
                <small className="tabular text-[11px] text-muted-foreground">{dateTime(e.created_at)}</small>
              </div>
              <span className={cn("tabular text-[15px] font-semibold", e.amount_kobo >= 0 ? "text-primary" : "text-[#B45309]")}>
                {e.amount_kobo >= 0 ? "+" : "−"}
                {pts(Math.abs(e.amount_kobo))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
