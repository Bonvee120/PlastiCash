"use client";

import { BadgeCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { Btn, Card } from "@/components/brand/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveBank, saveBank, updateProfile } from "@/lib/actions";
import { AREAS, ORG_TYPES } from "@/lib/areas";
import type { Me } from "@/lib/me";
import { cn } from "@/lib/utils";

export type BankOption = { name: string; code: string };

const selectClass =
  "h-13 w-full rounded-input border border-input bg-card px-3.5 text-base font-medium outline-none focus-visible:border-2 focus-visible:border-primary aria-invalid:border-2 aria-invalid:border-destructive";

// ----- Profile: PATCH /me with only the fields that changed -----

export function ProfileForm({ me }: { me: Me }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isOrganization = me.account_type === "ORGANIZATION";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const current: Record<string, string> = {
      full_name: me.full_name,
      phone: me.phone,
      address: me.address ?? "",
      area: me.area ?? "",
      org_name: me.org_name ?? "",
      org_type: me.org_type ?? "",
      cac_number: me.cac_number ?? "",
    };
    const changed: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      const text = String(value).trim();
      if (text !== current[key]) changed[key] = text;
    }
    if (Object.keys(changed).length === 0) return toast("Nothing to save.");

    setPending(true);
    const result = await updateProfile(changed);
    setPending(false);
    if (!result.ok) {
      const fields = (result.error.details?.errors ?? []) as { field: string; message: string }[];
      setErrors(Object.fromEntries(fields.map((e) => [e.field, e.message])));
      return toast.error(result.error.message);
    }
    setErrors({});
    toast.success("Profile saved.");
    router.refresh();
  }

  return (
    <Card>
      <h3 className="text-[17px] font-bold">Your details</h3>
      <p className="text-sm text-muted-foreground">
        {me.email} · {isOrganization ? "Organization" : "Individual"} account
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {isOrganization && (
          <>
            <Field id="org_name" label="Organization name" error={errors.org_name}>
              <Input id="org_name" name="org_name" defaultValue={me.org_name ?? ""} aria-invalid={!!errors.org_name} />
            </Field>
            <Field id="org_type" label="Type of organization" error={errors.org_type}>
              <select id="org_type" name="org_type" defaultValue={me.org_type ?? ""} className={selectClass}>
                {ORG_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        <Field id="full_name" label={isOrganization ? "Contact person" : "Full name"} error={errors.full_name}>
          <Input id="full_name" name="full_name" autoComplete="name" defaultValue={me.full_name} aria-invalid={!!errors.full_name} />
        </Field>
        <Field id="phone" label="Phone number" hint="We text your pickup codes here." error={errors.phone}>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={me.phone}
            aria-invalid={!!errors.phone}
            className="tabular"
          />
        </Field>
        <Field id="address" label="Street address" error={errors.address}>
          <Input id="address" name="address" autoComplete="street-address" defaultValue={me.address ?? ""} aria-invalid={!!errors.address} />
        </Field>
        <Field id="area" label="Area" error={errors.area}>
          <select id="area" name="area" defaultValue={me.area ?? ""} className={selectClass}>
            {AREAS.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </Field>
        {isOrganization && (
          <Field id="cac_number" label="CAC number (optional)" error={errors.cac_number}>
            <Input id="cac_number" name="cac_number" defaultValue={me.cac_number ?? ""} />
          </Field>
        )}
        <Btn type="submit" variant="primary" block disabled={pending}>
          {pending ? "Saving…" : "Save details"}
        </Btn>
      </form>
    </Card>
  );
}

// ----- Bank: pick bank, type NUBAN, Paystack resolves the name, user saves -----

export function BankForm({ bank, banks }: { bank: Me["bank"]; banks: BankOption[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!bank);
  const [code, setCode] = useState("");
  const [number, setNumber] = useState("");
  const [resolved, setResolved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const ready = !!code && /^\d{10}$/.test(number);

  function reset() {
    setResolved(null);
    setError(null);
  }

  async function check() {
    setPending(true);
    const result = await resolveBank(code, number);
    setPending(false);
    if (!result.ok) return setError(result.error.message);
    setResolved(result.data.account_name);
  }

  async function save() {
    setPending(true);
    const result = await saveBank(code, number);
    setPending(false);
    if (!result.ok) return toast.error(result.error.message);
    toast.success("Bank account saved.");
    setEditing(false);
    setCode("");
    setNumber("");
    reset();
    router.refresh();
  }

  return (
    <Card id="bank">
      <h3 className="text-[17px] font-bold">Bank account</h3>
      {bank && (
        <div className="flex items-center gap-3 rounded-xl bg-mist px-3 py-2.5">
          <BadgeCheck className="size-5 text-primary" aria-hidden />
          <div className="min-w-0 flex-1 text-sm">
            <b className="block">{bank.account_name}</b>
            <span className="tabular text-xs text-muted-foreground">
              {bank.bank_name} •••• {bank.account_number_last4}
            </span>
          </div>
          {!editing && (
            <button type="button" onClick={() => setEditing(true)} className="text-sm font-bold text-primary">
              Change
            </button>
          )}
        </div>
      )}
      {editing && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">Withdrawals go only to an account in your name. We check the name with your bank.</p>
          <Field id="bank_code" label="Bank">
            <select
              id="bank_code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                reset();
              }}
              className={selectClass}
            >
              <option value="" disabled>
                Choose your bank
              </option>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="account_number" label="Account number" hint="10 digits (NUBAN)." error={error ?? undefined}>
            <Input
              id="account_number"
              inputMode="numeric"
              maxLength={10}
              value={number}
              onChange={(e) => {
                setNumber(e.target.value.replace(/\D/g, ""));
                reset();
              }}
              aria-invalid={!!error}
              className="tabular"
            />
          </Field>
          {resolved ? (
            <>
              <div className="flex items-center gap-2 rounded-xl bg-mist px-3 py-2.5 text-sm">
                <BadgeCheck className="size-5 text-primary" aria-hidden />
                <span>
                  Account name: <b>{resolved}</b>
                </span>
              </div>
              <Btn variant="primary" block disabled={pending} onClick={save}>
                {pending ? "Saving…" : "Yes, save this account"}
              </Btn>
            </>
          ) : (
            <Btn variant="primary" block disabled={!ready || pending} onClick={check}>
              {pending ? "Checking…" : "Check account"}
            </Btn>
          )}
          {bank && (
            <Btn
              variant="ghost"
              block
              onClick={() => {
                setEditing(false);
                reset();
              }}
            >
              Keep current account
            </Btn>
          )}
        </div>
      )}
    </Card>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {(error || hint) && <p className={cn("text-sm", error ? "text-bad" : "text-muted-foreground")}>{error ?? hint}</p>}
    </div>
  );
}
