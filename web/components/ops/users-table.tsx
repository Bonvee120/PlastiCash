"use client";

import { BadgeCheck, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";

import { ConfirmDialog } from "@/components/brand/confirm-dialog";
import { Btn } from "@/components/brand/ui";
import { Field, nairaToKobo, selectClass, useAdminAction } from "@/components/ops/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adjustBalance, createCollector, updateUser } from "@/lib/admin-actions";
import type { Role, UserRow } from "@/lib/admin-types";
import { AREAS } from "@/lib/areas";
import { day, money } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<Role, string> = { USER: "Customer", COLLECTOR: "Collector", ADMIN: "Admin" };

type Pending = { kind: "active" | "role" | "adjust"; user: UserRow } | null;

export function UsersTable({ rows, meId }: { rows: UserRow[]; meId: string }) {
  const [open, setOpen] = useState<Pending>(null);
  const { pending, run } = useAdminAction();

  if (rows.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">No one matches.</p>;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Area</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((u) => {
            const self = u.id === meId;
            return (
              <TableRow key={u.id} className={cn(!u.is_active && "opacity-60")}>
                <TableCell>
                  <b className="flex items-center gap-1.5">
                    {u.name}
                    {u.verified_picker && <BadgeCheck className="size-4 text-primary" aria-label="Verified picker" />}
                  </b>
                  {u.name !== u.full_name && <span className="text-xs text-muted-foreground">{u.full_name}</span>}
                  {!u.is_active && <span className="ml-1 rounded bg-bad-soft px-1.5 py-0.5 text-[11px] font-bold text-bad">Deactivated</span>}
                </TableCell>
                <TableCell>{ROLE_LABEL[u.role]}</TableCell>
                <TableCell className="text-sm">
                  {u.email}
                  <span className="tabular block text-xs text-muted-foreground">{u.phone}</span>
                </TableCell>
                <TableCell>{u.area ?? "–"}</TableCell>
                <TableCell className="tabular text-right">{u.role === "USER" ? money(u.balance_kobo) : "–"}</TableCell>
                <TableCell className="tabular text-sm">{day(u.created_at)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {u.role === "USER" && (
                    <>
                      <Btn
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () => updateUser(u.id, { verified_picker: !u.verified_picker }),
                            u.verified_picker ? `${u.name} is no longer a verified picker.` : `${u.name} is now a verified picker.`,
                          )
                        }
                      >
                        {u.verified_picker ? "Unverify" : "Verify picker"}
                      </Btn>
                      <Btn variant="ghost" size="sm" onClick={() => setOpen({ kind: "adjust", user: u })}>
                        Adjust
                      </Btn>
                    </>
                  )}
                  {!self && (
                    <>
                      <Btn variant="ghost" size="sm" onClick={() => setOpen({ kind: "role", user: u })}>
                        Role
                      </Btn>
                      <Btn variant={u.is_active ? "danger" : "outline"} size="sm" className="ml-1" onClick={() => setOpen({ kind: "active", user: u })}>
                        {u.is_active ? "Deactivate" : "Reactivate"}
                      </Btn>
                    </>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {open?.kind === "active" && <ActiveDialog user={open.user} onClose={() => setOpen(null)} />}
      {open?.kind === "role" && <RoleDialog user={open.user} onClose={() => setOpen(null)} />}
      {open?.kind === "adjust" && <AdjustDialog user={open.user} onClose={() => setOpen(null)} />}
    </section>
  );
}

function ActiveDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const { pending, run } = useAdminAction({ onDone: onClose });
  const deactivate = user.is_active;
  async function confirm() {
    await run(() => updateUser(user.id, { is_active: !deactivate }), deactivate ? `${user.name} deactivated.` : `${user.name} reactivated.`);
  }
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={deactivate ? `Deactivate ${user.name}?` : `Reactivate ${user.name}?`}
      description={
        deactivate
          ? "They can't use PlastiCash until reactivated. Their balance and history stay."
          : "They can log in and use PlastiCash again."
      }
      confirmLabel={deactivate ? "Deactivate" : "Reactivate"}
      tone={deactivate ? "danger" : "primary"}
      onConfirm={confirm}
      pending={pending}
    />
  );
}

function RoleDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const { pending, run } = useAdminAction({ onDone: onClose });
  const [role, setRole] = useState<Role>(user.role);
  async function confirm() {
    await run(() => updateUser(user.id, { role }), `${user.name} is now ${ROLE_LABEL[role].toLowerCase()}.`);
  }
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Change ${user.name}'s role`}
      description="Their next page load shows the area for the new role. Admins can see and change everything."
      confirmLabel="Change role"
      onConfirm={confirm}
      pending={pending}
      disabled={role === user.role}
    >
      <Field id="role" label="Role">
        <select id="role" value={role} onChange={(e) => setRole(e.target.value as Role)} className={selectClass}>
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </Field>
    </ConfirmDialog>
  );
}

function AdjustDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const { pending, run } = useAdminAction({ onDone: onClose });
  const [direction, setDirection] = useState<"add" | "take">("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const kobo = nairaToKobo(amount);
  const signed = kobo === null ? null : direction === "add" ? kobo : -kobo;
  const tooMuch = signed !== null && user.balance_kobo + signed < 0;
  const valid = signed !== null && signed !== 0 && !tooMuch && note.trim().length >= 3;
  async function confirm() {
    await run(() => adjustBalance(user.id, signed!, note.trim()), `${user.name}: ${direction === "add" ? "added" : "took"} ${money(Math.abs(signed!))}.`);
  }
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Adjust ${user.name}'s balance`}
      description={`Now ${money(user.balance_kobo)}. A new ADJUSTMENT entry with your note; history is never edited.`}
      confirmLabel="Save adjustment"
      onConfirm={confirm}
      pending={pending}
      disabled={!valid}
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {(["add", "take"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={direction === d}
              onClick={() => setDirection(d)}
              className={cn("flex-1 rounded-xl border px-3 py-2 text-sm font-semibold", direction === d ? "border-primary bg-mist text-primary" : "border-border")}
            >
              {d === "add" ? "Add points" : "Take points"}
            </button>
          ))}
        </div>
        <Field id="adjust-amount" label="Amount (₦ = points)" error={tooMuch ? "That's more than their balance." : undefined}>
          <Input id="adjust-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="tabular" />
        </Field>
        <Field id="adjust-note" label="Note (required)">
          <Input id="adjust-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Complaint on PC-3F2A: 2 kg missed" />
        </Field>
      </div>
    </ConfirmDialog>
  );
}

export function CreateCollector() {
  const [open, setOpen] = useState(false);
  const { pending, run } = useAdminAction({ onDone: () => setOpen(false) });
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    setErrors({});
    await run(
      async () => {
        const result = await createCollector({
          full_name: text("full_name"),
          email: text("email"),
          phone: text("phone"),
          area: text("area") || null,
          password: String(form.get("password") ?? ""),
        });
        if (!result.ok) {
          const fields = result.error.details?.errors ?? [];
          setErrors(Object.fromEntries(fields.map((e) => [e.field.split(".").pop()!, e.message])));
        }
        return result;
      },
      (u) => `${u.full_name} can now log in as a collector.`,
    );
  }

  return (
    <>
      <Btn variant="primary" size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" aria-hidden /> Create collector
      </Btn>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="gap-4 rounded-2xl p-5 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold text-heading">Create collector</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
            <Field id="c-name" label="Full name" error={errors.full_name}>
              <Input id="c-name" name="full_name" required autoComplete="off" />
            </Field>
            <Field id="c-email" label="Email (their login)" error={errors.email}>
              <Input id="c-email" name="email" type="email" required autoComplete="off" />
            </Field>
            <Field id="c-phone" label="Phone" error={errors.phone}>
              <Input id="c-phone" name="phone" type="tel" placeholder="0803 123 4567" required />
            </Field>
            <Field id="c-area" label="Usual area" error={errors.area}>
              <select id="c-area" name="area" defaultValue="" className={selectClass}>
                <option value="">Any</option>
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="c-password" label="First password" hint="12+ characters. Give it to them in person, not by SMS." error={errors.password}>
              <Input id="c-password" name="password" type="password" minLength={12} required autoComplete="new-password" />
            </Field>
            <Btn type="submit" variant="primary" disabled={pending}>
              {pending ? "Creating…" : "Create collector"}
            </Btn>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
