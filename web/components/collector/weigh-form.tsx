"use client";

import { Camera, Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Btn } from "@/components/brand/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money } from "@/lib/format";
import { MATERIALS, type CurrentPrice, type Material, type WeighItemIn } from "@/lib/types";
import { photo, uploadPhoto } from "@/lib/upload";
import { cn } from "@/lib/utils";

type Row = { gross: string; deduct: boolean; deduction: string; reason: string };
const EMPTY: Row = { gross: "", deduct: false, deduction: "", reason: "" };
const KG = /^\d{1,4}(\.\d{0,2})?$/;

// Hundredths of a kg as an integer, so the running total uses the same half-up rounding as the API.
const centi = (value: string) => (KG.test(value) ? Math.round(Number(value) * 100) : 0);

function rowError(row: Row): string | null {
  if (!KG.test(row.gross) || centi(row.gross) === 0) return "Enter the weight.";
  if (!row.deduct) return null;
  if (!KG.test(row.deduction) || centi(row.deduction) === 0) return "Enter the deduction, or turn it off.";
  if (centi(row.deduction) > centi(row.gross)) return "The deduction can't be more than the weight.";
  if (!row.reason.trim()) return "Say why (wet, caps on, dirt…).";
  return null;
}

// Weigh step for a door job or a hub walk-in: one row per material, big numeric inputs, an optional deduction with a
// reason, a scale photo, and a running total pinned at the bottom (DESIGN_BRIEF.md §6.3).
export function WeighForm({
  prices,
  submitLabel,
  onSubmit,
}: {
  prices: CurrentPrice[];
  submitLabel: string;
  onSubmit: (photoUrl: string, items: WeighItemIn[]) => Promise<boolean>;
}) {
  const [rows, setRows] = useState<Partial<Record<Material, Row>>>({});
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [tried, setTried] = useState(false);
  const priceOf = new Map(prices.map((p) => [p.material, p.price_kobo_per_kg]));

  const picked = MATERIALS.filter((m) => rows[m.value]);
  const totalKobo = picked.reduce((sum, m) => {
    const row = rows[m.value]!;
    const net = centi(row.gross) - (row.deduct ? centi(row.deduction) : 0);
    return sum + (net > 0 ? Math.floor((net * (priceOf.get(m.value) ?? 0) + 50) / 100) : 0);
  }, 0);
  const totalKg = picked.reduce((sum, m) => {
    const row = rows[m.value]!;
    return sum + Math.max(centi(row.gross) - (row.deduct ? centi(row.deduction) : 0), 0);
  }, 0);
  const errors = picked.map((m) => rowError(rows[m.value]!));
  const valid = picked.length > 0 && errors.every((e) => !e) && !!photoUrl;

  function toggle(material: Material) {
    setRows((current) => {
      const next = { ...current };
      if (next[material]) delete next[material];
      else next[material] = { ...EMPTY };
      return next;
    });
  }

  function update(material: Material, patch: Partial<Row>) {
    setRows((current) => ({ ...current, [material]: { ...current[material]!, ...patch } }));
  }

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      setPhotoUrl(await uploadPhoto(file, "weigh"));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setTried(true);
    if (!valid) return toast.error(!photoUrl ? "Take a photo of the scale." : "Check the weights.");
    setPending(true);
    const items = picked.map(({ value }) => {
      const row = rows[value]!;
      return {
        material: value,
        gross_kg: row.gross,
        deduction_kg: row.deduct ? row.deduction : "0",
        deduction_reason: row.deduct ? row.reason.trim() : null,
      };
    });
    const ok = await onSubmit(photoUrl!, items);
    if (!ok) setPending(false);
  }

  return (
    <div className="flex flex-col gap-4 pb-28">
      <fieldset>
        <legend className="mb-2 font-bold">What did you weigh?</legend>
        <div className="flex flex-wrap gap-2">
          {MATERIALS.map((m) => {
            const on = !!rows[m.value];
            return (
              <button
                key={m.value}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(m.value)}
                className={cn(
                  "flex min-h-12 items-center gap-1.5 rounded-full border px-4 text-base font-semibold",
                  on ? "border-primary bg-primary text-white" : "border-border bg-white",
                )}
              >
                {on && <Check className="size-4" strokeWidth={3} aria-hidden />}
                {m.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {picked.map((m, i) => {
        const row = rows[m.value]!;
        const error = tried ? errors[i] : null;
        const id = `w-${m.value}`;
        return (
          <section key={m.value} className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4">
            <div className="flex items-baseline justify-between">
              <b className="text-lg">{m.label}</b>
              <span className="tabular text-sm text-muted-foreground">₦{(priceOf.get(m.value) ?? 0) / 100}/kg</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id}>Weight on the scale (kg)</Label>
              <Input
                id={id}
                inputMode="decimal"
                placeholder="0.00"
                value={row.gross}
                onChange={(e) => update(m.value, { gross: e.target.value.replace(",", ".") })}
                aria-invalid={!!error && !row.deduct}
                className="tabular h-14 text-2xl font-bold"
              />
            </div>
            <label className="flex min-h-12 items-center gap-3 text-base">
              <input
                type="checkbox"
                checked={row.deduct}
                onChange={(e) => update(m.value, { deduct: e.target.checked })}
                className="size-6 accent-[#B45309]"
              />
              Take off weight (water, dirt, caps)
            </label>
            {row.deduct && (
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <Input
                  aria-label={`${m.label}: kg to take off`}
                  inputMode="decimal"
                  placeholder="kg"
                  value={row.deduction}
                  onChange={(e) => update(m.value, { deduction: e.target.value.replace(",", ".") })}
                  className="tabular h-12 text-lg"
                />
                <Input
                  aria-label={`${m.label}: why`}
                  placeholder="Why? e.g. wet"
                  maxLength={200}
                  value={row.reason}
                  onChange={(e) => update(m.value, { reason: e.target.value })}
                  className="h-12"
                />
              </div>
            )}
            {error && <p className="text-sm font-semibold text-danger">{error}</p>}
          </section>
        );
      })}

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4">
        <b className="text-lg">Photo of the scale</b>
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudinary already resizes it
          <img src={photo(photoUrl, 480)} alt="Scale photo" className="max-h-56 w-full rounded-xl object-cover" />
        )}
        <label
          className={cn(
            "d-btn d-btn-outline d-btn-block d-btn-collector",
            tried && !photoUrl && "border-2 border-destructive",
            uploading && "pointer-events-none opacity-70",
          )}
        >
          {uploading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Camera className="size-5" aria-hidden />}
          {uploading ? "Uploading…" : photoUrl ? "Retake photo" : "Take photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => choosePhoto(e.target.files?.[0])}
          />
        </label>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-md border-t border-border bg-white p-3">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <span className="tabular text-sm text-muted-foreground">{(totalKg / 100).toFixed(2)} kg net</span>
          <b className="tabular text-lg">{money(totalKobo)}</b>
        </div>
        <Btn variant="primary" block className="d-btn-collector" disabled={pending || uploading || picked.length === 0} onClick={submit}>
          {pending ? "Saving…" : submitLabel}
        </Btn>
      </div>
    </div>
  );
}
