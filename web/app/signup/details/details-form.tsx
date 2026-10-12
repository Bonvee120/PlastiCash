"use client";

import { Check, School, User } from "lucide-react";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AREAS, ORG_TYPES } from "@/lib/areas";
import { cn } from "@/lib/utils";

import { createProfile, type DetailsState } from "./actions";

const INITIAL: DetailsState = { attempt: 0, values: {}, fieldErrors: {}, message: null };

// Native <select> styled like the shadcn Input: easiest to use on a cheap Android phone.
const selectClass =
  "h-13 w-full rounded-input border border-input bg-white px-3.5 text-base font-medium outline-none focus-visible:border-2 focus-visible:border-primary aria-invalid:border-2 aria-invalid:border-destructive";

export function DetailsForm() {
  const [state, action, pending] = useActionState(createProfile, INITIAL);
  const [accountType, setAccountType] = useState(state.values.account_type || "INDIVIDUAL");
  const isOrganization = accountType === "ORGANIZATION";
  const { values, fieldErrors: errors } = state;

  useEffect(() => {
    if (state.message) toast.error(state.message);
  }, [state]);

  return (
    <form key={state.attempt} action={action} className="flex flex-col gap-5" noValidate>
      <fieldset>
        <legend className="sr-only">Who&apos;s recycling?</legend>
        <div className="grid grid-cols-2 gap-3.5">
          <TypeOption value="INDIVIDUAL" current={accountType} onPick={setAccountType} icon={User} title="Just me">
            Home, waste picker or trader
          </TypeOption>
          <TypeOption value="ORGANIZATION" current={accountType} onPick={setAccountType} icon={School} title="Organization">
            School, office or estate
          </TypeOption>
        </div>
      </fieldset>

      {isOrganization && (
        <>
          <Field id="org_name" label="Organization name" error={errors.org_name}>
            <Input id="org_name" name="org_name" defaultValue={values.org_name} aria-invalid={!!errors.org_name} />
          </Field>
          <Field id="org_type" label="Type of organization" error={errors.org_type}>
            <select
              id="org_type"
              name="org_type"
              defaultValue={values.org_type ?? ""}
              aria-invalid={!!errors.org_type}
              className={selectClass}
            >
              <option value="" disabled>
                Choose one
              </option>
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
        <Input
          id="full_name"
          name="full_name"
          autoComplete="name"
          defaultValue={values.full_name}
          aria-invalid={!!errors.full_name}
        />
      </Field>

      <Field
        id="phone"
        label="Phone number"
        hint="We text your pickup code to this number. You can add your bank later, before your first withdrawal."
        error={errors.phone}
      >
        <div className="relative">
          <span className="tabular pointer-events-none absolute inset-y-0 left-3.5 flex items-center border-r border-border pr-2.5 text-muted-foreground">
            +234
          </span>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="803 123 4567"
            defaultValue={values.phone}
            aria-invalid={!!errors.phone}
            className="tabular pl-[84px]"
          />
        </div>
      </Field>

      <Field id="address" label="Street address" error={errors.address}>
        <Input
          id="address"
          name="address"
          autoComplete="street-address"
          placeholder="e.g. 7 Ezillo Street"
          defaultValue={values.address}
          aria-invalid={!!errors.address}
        />
      </Field>

      <Field id="area" label="Area" error={errors.area}>
        <select
          id="area"
          name="area"
          defaultValue={values.area ?? ""}
          aria-invalid={!!errors.area}
          className={selectClass}
        >
          <option value="" disabled>
            Choose your area
          </option>
          {AREAS.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </select>
      </Field>

      {isOrganization && (
        <Field id="cac_number" label="CAC number (optional)" error={errors.cac_number}>
          <Input id="cac_number" name="cac_number" defaultValue={values.cac_number} />
        </Field>
      )}

      <button type="submit" className="d-btn d-btn-primary d-btn-block" disabled={pending}>
        {pending ? "Saving…" : "Create my account"}
      </button>
    </form>
  );
}

function TypeOption({
  value,
  current,
  onPick,
  icon: Icon,
  title,
  children,
}: {
  value: string;
  current: string;
  onPick: (value: string) => void;
  icon: typeof User;
  title: string;
  children: ReactNode;
}) {
  const checked = value === current;
  return (
    <label
      className={cn(
        "relative flex cursor-pointer flex-col gap-2 rounded-2xl border bg-white p-4 transition-colors",
        "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-leaf",
        checked ? "border-2 border-primary bg-mist p-[15px]" : "border-border hover:border-primary/50",
      )}
    >
      <input
        type="radio"
        name="account_type"
        value={value}
        checked={checked}
        onChange={() => onPick(value)}
        className="sr-only"
      />
      {checked && (
        <span className="absolute top-2.5 right-2.5 grid size-[22px] place-items-center rounded-full bg-primary text-white">
          <Check className="size-3.5" strokeWidth={3.4} aria-hidden />
        </span>
      )}
      <span className={cn("grid size-10 place-items-center rounded-xl", checked ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
        <Icon className="size-5" aria-hidden />
      </span>
      <b className="text-base">{title}</b>
      <small className="text-[13px] text-muted-foreground">{children}</small>
    </label>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-sm text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
