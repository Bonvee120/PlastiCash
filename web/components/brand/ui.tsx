import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Hourglass,
  type LucideIcon,
  Scale,
  Truck,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { naira, pts } from "@/lib/format";
import type { PickupStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

// Shared building blocks from docs/DESIGN_BRIEF.md §7 (daisyUI d- classes for buttons and badges).

// ----- Btn: d-btn variants as a button or a link -----

type Variant = "primary" | "accent" | "outline" | "ghost" | "danger" | "glass";
const VARIANT: Record<Variant, string> = {
  primary: "d-btn-primary",
  accent: "d-btn-accent",
  outline: "d-btn-outline",
  ghost: "d-btn-ghost",
  danger: "d-btn-danger",
  glass: "d-btn-glass",
};

type BtnProps = { variant?: Variant; size?: "sm" | "md" | "lg"; block?: boolean; className?: string };

function btnClass({ variant = "primary", size = "md", block, className }: BtnProps) {
  return cn("d-btn", VARIANT[variant], size === "sm" && "d-btn-sm", size === "lg" && "d-btn-lg", block && "w-full", className);
}

export function Btn({ variant, size, block, className, ...props }: BtnProps & ComponentProps<"button">) {
  return <button type="button" {...props} className={btnClass({ variant, size, block, className })} />;
}

export function BtnLink({ variant, size, block, className, ...props }: BtnProps & ComponentProps<typeof Link>) {
  return <Link {...props} className={btnClass({ variant, size, block, className })} />;
}

// ----- Card -----

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section {...props} className={cn("flex flex-col gap-3 rounded-2xl border border-border bg-card p-[18px]", className)} />;
}

// ----- StatusBadge: label + icon, never colour alone (§5.3) -----

const STATUS: Record<PickupStatus, { label: string; icon: LucideIcon; className: string }> = {
  REQUESTED: { label: "Requested", icon: Clock, className: "bg-muted text-slate-600" },
  ASSIGNED: { label: "Assigned", icon: UserCheck, className: "bg-info-soft text-info" },
  EN_ROUTE: { label: "On the way", icon: Truck, className: "bg-route-soft text-route" },
  AWAITING_CONFIRMATION: { label: "Please confirm", icon: Scale, className: "bg-cream text-warn" },
  DISPUTED: { label: "Under review", icon: AlertTriangle, className: "bg-bad-soft text-bad" },
  COMPLETED: { label: "Paid", icon: CheckCircle2, className: "bg-mint text-primary" },
  CANCELLED: { label: "Cancelled", icon: Ban, className: "bg-muted text-slate-400" },
};

export function statusLabel(status: PickupStatus) {
  return STATUS[status].label;
}

export function StatusBadge({ status, className }: { status: PickupStatus; className?: string }) {
  const { label, icon: Icon, className: tone } = STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap", tone, className)}>
      <Icon className="size-3.5" strokeWidth={2.6} aria-hidden />
      <span className={status === "CANCELLED" ? "line-through" : undefined}>{label}</span>
    </span>
  );
}

// ----- MoneyDisplay: big figure + "pts" + mono naira line (§7) -----

export function MoneyDisplay({
  kobo,
  size = "lg",
  dark = false,
  className,
}: {
  kobo: number;
  size?: "md" | "lg" | "xl";
  dark?: boolean;
  className?: string;
}) {
  const figure = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(kobo / 100);
  return (
    <div className={className}>
      <p
        className={cn(
          "font-display leading-none font-extrabold tracking-[-0.04em]",
          size === "xl" && "text-5xl lg:text-6xl",
          size === "lg" && "text-[30px]",
          size === "md" && "text-[22px]",
          dark ? "text-white" : "text-heading",
        )}
      >
        {figure}
        <small className={cn("ml-1.5 align-baseline text-[0.42em] font-bold tracking-normal", dark ? "text-gold" : "text-amber")}>
          pts
        </small>
      </p>
      <p className={cn("tabular mt-1.5 text-[13px]", dark ? "text-[#BBF7D0]" : "text-muted-foreground")}>≈ {naira(kobo)}</p>
    </div>
  );
}

export function Money({ kobo, className }: { kobo: number; className?: string }) {
  return (
    <span className={cn("tabular whitespace-nowrap", className)}>
      {pts(kobo)} <span className="text-muted-foreground">({naira(kobo)})</span>
    </span>
  );
}

// ----- Timeline: the 5-step pickup track; vertical on phone, horizontal on laptop (§7) -----

const STEPS = ["Requested", "Assigned", "On the way", "Weighed", "Paid"] as const;
const REACHED: Record<PickupStatus, number> = {
  REQUESTED: 0,
  ASSIGNED: 1,
  EN_ROUTE: 2,
  AWAITING_CONFIRMATION: 3,
  DISPUTED: 3,
  COMPLETED: 4,
  CANCELLED: -1,
};

export function Timeline({ status, compact = false }: { status: PickupStatus; compact?: boolean }) {
  const reached = REACHED[status];
  if (compact) {
    return (
      <ol className="flex gap-1.5" aria-label={`Progress: ${STEPS[Math.max(reached, 0)]}`}>
        {STEPS.map((step, i) => (
          <li key={step} className="flex-1">
            <div className={cn("h-1.5 rounded-full", i <= reached ? "bg-primary" : "bg-border")} />
            <small className={cn("text-[11px]", i <= reached ? "font-bold text-primary" : "text-slate-400", i === reached && "font-extrabold")}>
              {step}
            </small>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className="flex flex-col lg:flex-row lg:items-start" aria-label="Pickup progress">
      {STEPS.map((step, i) => {
        const done = i < reached || (i === reached && status === "COMPLETED");
        const current = i === reached && status !== "COMPLETED";
        return (
          <li key={step} className="flex gap-3 lg:flex-1 lg:flex-col lg:items-center lg:gap-2 lg:text-center">
            <div className="flex flex-col items-center lg:w-full lg:flex-row">
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full",
                  done && "bg-primary text-primary-foreground",
                  current && "bg-amber text-heading ring-4 ring-amber/25",
                  !done && !current && "bg-border text-white",
                )}
                aria-hidden
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : current ? <Hourglass className="size-3" /> : null}
              </span>
              {i < STEPS.length - 1 && (
                <span className={cn("min-h-6 w-0.5 flex-1 lg:h-0.5 lg:min-h-0 lg:w-auto", i < reached ? "bg-primary" : "bg-border")} />
              )}
            </div>
            <span className={cn("pb-4 text-sm lg:pb-0", done || current ? "font-semibold text-ink" : "text-muted-foreground")}>
              {step}
              {current && <span className="sr-only"> (current step)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ----- Stepper: phone segments + "Step n of N"; laptop numbered circles (§7) -----

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div>
      <div className="lg:hidden">
        <p className="eyebrow text-primary">
          Step {current + 1} of {steps.length} · {steps[current]}
        </p>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {steps.map((s, i) => (
            <i key={s} className={cn("h-[5px] flex-1 rounded-full", i <= current ? "bg-primary" : "bg-border")} />
          ))}
        </div>
      </div>
      <ol className="hidden items-center gap-2.5 lg:flex">
        {steps.map((s, i) => (
          <li key={s} className="contents">
            <span className={cn("flex items-center gap-2.5 text-sm font-semibold", i < current ? "text-primary" : i === current ? "text-heading" : "text-slate-400")}>
              <i
                className={cn(
                  "tabular grid size-7 place-items-center rounded-full text-[13px] font-bold not-italic",
                  i < current ? "bg-mint text-primary" : i === current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {i < current ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : i + 1}
              </i>
              {s}
            </span>
            {i < steps.length - 1 && <span className={cn("h-0.5 min-w-5 flex-1", i < current ? "bg-primary" : "bg-border")} />}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ----- EmptyState: icon, one line, one action (§13) -----

export function EmptyState({ icon: Icon, text, action }: { icon: LucideIcon; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-xl bg-mint text-primary">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="max-w-xs text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}

// ----- Page heading inside an area -----

export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-[26px] leading-tight font-bold lg:text-2xl">{title}</h2>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
