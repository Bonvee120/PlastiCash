"use client";

import { CheckCircle2, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { WeightTable } from "@/components/app/weight-table";
import { Btn, Card } from "@/components/brand/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmWithCode, resendCode } from "@/lib/actions";
import type { CollectorPickup } from "@/lib/types";

// After weighing: the customer reads the 6-digit SMS code to the collector, or confirms in the app themselves.
export function OtpStep({
  pickup,
  smsSent,
  onDone,
}: {
  pickup: CollectorPickup;
  smsSent: boolean | null;
  onDone: (pickup: CollectorPickup) => void;
}) {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [locked, setLocked] = useState(pickup.otp_locked);
  const name = pickup.customer_name || "The customer";

  async function confirm() {
    setPending(true);
    const result = await confirmWithCode(pickup.id, code);
    setPending(false);
    if (result.ok) {
      toast.success(`Done. ${name} has been paid.`);
      return onDone(result.data);
    }
    setCode("");
    if (result.error.code === "OTP_LOCKED") setLocked(true);
    toast.error(result.error.message);
  }

  async function resend() {
    setPending(true);
    const result = await resendCode(pickup.id);
    setPending(false);
    if (!result.ok) return toast.error(result.error.message);
    toast.success(result.data.sms_sent ? "New code sent by SMS." : "SMS is off; the customer can confirm in the app.");
  }

  return (
    <div className="flex flex-col gap-4">
      <WeightTable items={pickup.items} totalKg={pickup.total_net_kg} totalKobo={pickup.total_amount_kobo} />

      {locked ? (
        <Card className="flex-row items-start gap-3">
          <Smartphone className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
          <p className="text-base">
            Too many wrong codes. <b>{name} will confirm on PlastiCash.</b> You can go to the next job.
          </p>
        </Card>
      ) : (
        <Card className="gap-3">
          <h3 className="text-lg font-bold">Get the code</h3>
          <p className="text-base text-slate-700">
            {smsSent === false
              ? `SMS is not sending right now. ${name} can confirm on PlastiCash instead.`
              : `Ask ${name} for the 6-digit code we sent by SMS.`}
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="otp">SMS code</Label>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="tabular h-16 text-center text-3xl font-bold tracking-[0.4em]"
            />
          </div>
          <Btn variant="primary" block className="d-btn-collector" disabled={code.length !== 6 || pending} onClick={confirm}>
            {pending ? "Checking…" : "Confirm and pay"}
          </Btn>
          <Btn variant="ghost" block disabled={pending} onClick={resend}>
            Send a new code
          </Btn>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" aria-hidden /> Or {name} confirms on PlastiCash; it pays the same.
          </p>
        </Card>
      )}
    </div>
  );
}
