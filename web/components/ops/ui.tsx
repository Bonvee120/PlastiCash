"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/actions";
import { cn } from "@/lib/utils";

// Ops portal building blocks (DESIGN_BRIEF.md §6.4): 30 px padding, 32 px title, filters top right, stat cards, tables.

export function OpsPage({ title, sub, filters, children }: { title: string; sub?: string; filters?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col gap-6 p-4 lg:p-[30px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] leading-tight font-bold lg:text-[32px]">{title}</h1>
          {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
        </div>
        {filters}
      </div>
      {children}
    </main>
  );
}

export function StatCard({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "alert" | "warn" }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-2xl border bg-white p-4",
        tone === "alert" ? "border-[#FCA5A5]" : tone === "warn" ? "border-[#FDE68A]" : "border-border",
      )}
    >
      <span className="eyebrow text-muted-foreground">{label}</span>
      <b className={cn("tabular text-2xl font-bold", tone === "alert" && "text-[#B91C1C]")}>{value}</b>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export const selectClass =
  "h-11 rounded-input border border-input bg-white px-3 text-sm font-medium outline-none focus-visible:border-2 focus-visible:border-primary";

export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {(error || hint) && <p className={cn("text-xs", error ? "text-danger" : "text-muted-foreground")}>{error ?? hint}</p>}
    </div>
  );
}

// Run a server action: toast on success or error, then refresh the server data (and the nav counts).
// `pending` stays true until the refreshed page has arrived, so nobody acts twice on a stale row.
// With `onDone` (e.g. closing a dialog), that runs once the refreshed data is on screen.
export function useAdminAction({ onDone }: { onDone?: () => void } = {}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const done = useRef(false);
  useEffect(() => {
    if (done.current && !refreshing) {
      done.current = false;
      onDone?.();
    }
  }, [refreshing, onDone]);
  async function run<T>(action: () => Promise<ActionResult<T>>, success: string | ((data: T) => string)): Promise<T | null> {
    setRunning(true);
    const result = await action();
    setRunning(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return null;
    }
    toast.success(typeof success === "string" ? success : success(result.data));
    done.current = true;
    startRefresh(() => router.refresh());
    return result.data;
  }
  return { pending: running || refreshing, run };
}

// "₦1,250.50" typed by an admin -> kobo, or null if it isn't a money amount.
export function nairaToKobo(text: string, { allowNegative = false } = {}): number | null {
  const clean = text.replace(/[₦,\s]/g, "");
  const pattern = allowNegative ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/;
  if (!pattern.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}
