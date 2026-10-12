"use client";

import { CheckCircle2, UserCheck } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Btn, Card } from "@/components/brand/ui";
import { OtpStep } from "@/components/collector/otp-step";
import { WeighForm } from "@/components/collector/weigh-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { findCustomer, walkIn } from "@/lib/actions";
import type { CollectorPickup, CurrentPrice, WeighItemIn } from "@/lib/types";

export function WalkInFlow({ prices }: { prices: CurrentPrice[] }) {
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [job, setJob] = useState<CollectorPickup | null>(null);
  const [smsSent, setSmsSent] = useState<boolean | null>(null);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function search(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await findCustomer(phone);
    setPending(false);
    if (!result.ok) return setError(result.error.message);
    setError(null);
    setCustomer(result.data);
  }

  async function weigh(photoUrl: string, items: WeighItemIn[]) {
    // No `customer!.id` here: the React Compiler memoizes on it during render, when customer is still null.
    if (!customer) return false;
    const result = await walkIn(customer.id, photoUrl, items);
    if (!result.ok) {
      toast.error(result.error.message);
      return false;
    }
    setSmsSent(result.data.sms_sent);
    setJob(result.data.pickup);
    window.scrollTo({ top: 0 });
    return true;
  }

  if (job?.status === "COMPLETED") {
    return (
      <div className="flex flex-col gap-4">
        <p className="flex items-center gap-2 rounded-xl bg-mint px-3 py-3 text-base font-semibold text-primary">
          <CheckCircle2 className="size-5" aria-hidden /> Paid. {customer?.name} has the points in their wallet.
        </p>
        <Btn variant="primary" block className="d-btn-collector" onClick={() => window.location.reload()}>
          Next walk-in
        </Btn>
        <Link href="/collector" className="d-btn d-btn-outline d-btn-block d-btn-collector">
          Back to today
        </Link>
      </div>
    );
  }

  if (job) return <OtpStep pickup={{ ...job, customer_name: job.customer_name || customer?.name || "" }} smsSent={smsSent} onDone={setJob} />;

  if (customer) {
    return (
      <div className="flex flex-col gap-4">
        <Card className="flex-row items-center gap-3">
          <UserCheck className="size-6 text-primary" aria-hidden />
          <b className="flex-1 text-lg">{customer.name || "Customer found"}</b>
          <button type="button" onClick={() => setCustomer(null)} className="min-h-12 text-base font-bold text-primary">
            Change
          </button>
        </Card>
        <WeighForm prices={prices} submitLabel="Save weights" onSubmit={weigh} />
      </div>
    );
  }

  return (
    <Card>
      <form onSubmit={search} className="flex flex-col gap-3" noValidate>
        <Label htmlFor="phone">Customer&apos;s phone number</Label>
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          placeholder="0803 123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-invalid={!!error}
          className="tabular h-14 text-xl"
        />
        {error && <p className="text-sm font-semibold text-danger">{error}</p>}
        <Btn type="submit" variant="primary" block className="d-btn-collector" disabled={!phone.trim() || pending}>
          {pending ? "Searching…" : "Find customer"}
        </Btn>
      </form>
    </Card>
  );
}
