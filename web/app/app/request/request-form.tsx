"use client";

import { Camera, Check, Loader2, LocateFixed, MapPin, Minus, Plus, Store, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ENUGU, PinPicker } from "@/components/app/maps";
import { Btn, Card, Money, Stepper } from "@/components/brand/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPickup } from "@/lib/actions";
import { AREAS } from "@/lib/areas";
import { kg, WINDOW_LABEL } from "@/lib/format";
import { HUB } from "@/lib/site";
import { MATERIALS, type CurrentPrice, type Estimate, type Material } from "@/lib/types";
import { photo as resized, uploadPhoto } from "@/lib/upload";
import { cn } from "@/lib/utils";

const STEPS = ["Materials", "Estimate", "Photo", "Place and time", "Review"];
const API = process.env.NEXT_PUBLIC_API_URL!;

type Qty = { mode: "sacks" | "count"; sacks: number; count: number };

function lagosToday() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10); // Nigeria is UTC+1
}

const selectClass =
  "h-13 w-full rounded-input border border-input bg-card px-3.5 text-base font-medium outline-none focus-visible:border-2 focus-visible:border-primary";

export function RequestForm({
  prices,
  defaults,
}: {
  prices: CurrentPrice[];
  defaults: { address: string; area: string };
}) {
  const router = useRouter();
  const priceOf = (m: Material) => prices.find((p) => p.material === m);
  const sellable = MATERIALS.filter((m) => priceOf(m.value));

  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<Material[]>([]);
  const [qty, setQty] = useState<Partial<Record<Material, Qty>>>({});
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [choice, setChoice] = useState<"pool" | "hub" | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pin, setPin] = useState<[number, number]>(ENUGU);
  const [address, setAddress] = useState(defaults.address);
  const [area, setArea] = useState(defaults.area);
  const [date, setDate] = useState(lagosToday());
  const [slot, setSlot] = useState<"MORNING" | "AFTERNOON">("MORNING");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const items = useMemo(
    () =>
      selected
        .map((m) => {
          const q = qty[m] ?? { mode: "sacks", sacks: 1, count: 0 };
          return q.mode === "sacks" ? { material: m, sacks: q.sacks.toFixed(1) } : { material: m, item_count: q.count };
        })
        .filter((i) => ("sacks" in i ? Number(i.sacks) > 0 : (i.item_count ?? 0) > 0)),
    [selected, qty],
  );

  // Live estimate from the API (public endpoint), a moment after the last change.
  useEffect(() => {
    if (items.length === 0) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setEstimating(true);
      try {
        const response = await fetch(`${API}/estimate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
          signal: controller.signal,
        });
        if (response.ok) setEstimate(await response.json());
      } catch {
        /* aborted or offline: keep the last estimate */
      } finally {
        setEstimating(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [items]);

  const underMinimum = estimate !== null && !estimate.meets_door_minimum;

  function toggle(m: Material) {
    setSelected((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));
    setQty((q) => ({ ...q, [m]: q[m] ?? { mode: "sacks", sacks: 1, count: 0 } }));
  }

  function setQ(m: Material, change: Partial<Qty>) {
    setQty((q) => ({ ...q, [m]: { ...(q[m] ?? { mode: "sacks", sacks: 1, count: 0 }), ...change } }));
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      setPhotoUrl(await uploadPhoto(file, "request"));
      toast.success("Photo added.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The photo didn't upload.");
    } finally {
      setUploading(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) return toast.error("Your phone didn't share a location. Drag the pin instead.");
    navigator.geolocation.getCurrentPosition(
      (pos) => setPin([pos.coords.latitude, pos.coords.longitude]),
      () => toast.error("We couldn't get your location. Drag the pin to your gate instead."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const canNext = [
    selected.length > 0,
    items.length === selected.length && estimate !== null && !estimating && (!underMinimum || choice === "pool"),
    photoUrl !== null,
    address.trim().length >= 3 && area !== "" && date >= lagosToday(),
    true,
  ][step];

  async function submit() {
    setSubmitting(true);
    const result = await createPickup({
      items,
      request_photo_url: photoUrl,
      lat: pin[0].toFixed(6),
      lng: pin[1].toFixed(6),
      address: address.trim(),
      area,
      preferred_date: date,
      preferred_window: slot,
      pool: underMinimum && choice === "pool",
      ...(note.trim() ? { estimate_note: note.trim() } : {}),
    });
    if (!result.ok) {
      setSubmitting(false);
      const fieldError = result.error.details?.errors?.[0]?.message;
      toast.error(fieldError ? `${result.error.message} ${fieldError}` : result.error.message);
      return;
    }
    toast.success(result.data.pooled ? "Added to your area's next pickup day." : "Pickup requested. We'll assign a collector.");
    router.push(`/app/pickups/${result.data.id}`);
  }

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-6">
      <div className="flex flex-col gap-5">
        <Stepper steps={STEPS} current={step} />

        {step === 0 && (
          <section aria-labelledby="materials-h" className="flex flex-col gap-3">
            <h3 id="materials-h" className="text-lg font-bold">
              What are you selling?
            </h3>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {sellable.map((m) => {
                const on = selected.includes(m.value);
                const price = priceOf(m.value)!;
                return (
                  <button
                    key={m.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(m.value)}
                    className={cn(
                      "relative flex flex-col items-start gap-1.5 rounded-2xl border bg-card p-3.5 text-left transition-colors",
                      on ? "border-2 border-primary bg-mist p-[13px]" : "border-border hover:border-primary/50",
                    )}
                  >
                    {on && (
                      <span className="absolute top-2.5 right-2.5 grid size-[22px] place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3.5" strokeWidth={3.4} aria-hidden />
                      </span>
                    )}
                    <b>{m.label}</b>
                    <small className="text-xs text-muted-foreground">{m.hint}</small>
                    <span className="tabular text-sm font-semibold text-primary">{price.points_per_kg} pts/kg</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === 1 && (
          <section aria-labelledby="estimate-h" className="flex flex-col gap-3">
            <h3 id="estimate-h" className="text-lg font-bold">
              About how much?
            </h3>
            <p className="text-sm text-muted-foreground">Count full EcoCyclers sacks, or bottles and cans. The collector weighs it exactly.</p>
            {selected.map((m) => {
              const q = qty[m] ?? { mode: "sacks", sacks: 1, count: 0 };
              const price = priceOf(m)!;
              const countable = price.items_per_kg !== null;
              const line = estimate?.items.find((i) => i.material === m);
              return (
                <Card key={m} className="gap-3">
                  <div className="flex items-center justify-between">
                    <b>{MATERIALS.find((x) => x.value === m)!.label}</b>
                    <span className="tabular text-sm text-muted-foreground">{line ? `≈ ${kg(line.kg)}` : ""}</span>
                  </div>
                  {countable && (
                    <div className="flex gap-2 text-sm" role="radiogroup" aria-label="Count in">
                      {(["sacks", "count"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          role="radio"
                          aria-checked={q.mode === mode}
                          onClick={() => setQ(m, { mode })}
                          className={cn("rounded-full px-3 py-1 font-semibold", q.mode === mode ? "bg-mint text-primary" : "bg-muted text-muted-foreground")}
                        >
                          {mode === "sacks" ? "Sacks" : m === "CAN" ? "Cans" : "Bottles"}
                        </button>
                      ))}
                    </div>
                  )}
                  <Counter
                    label={q.mode === "sacks" ? "full sacks" : m === "CAN" ? "cans" : "bottles"}
                    value={q.mode === "sacks" ? q.sacks : q.count}
                    step={q.mode === "sacks" ? 0.5 : 10}
                    onChange={(v) => setQ(m, q.mode === "sacks" ? { sacks: v } : { count: v })}
                  />
                </Card>
              );
            })}
            {underMinimum && estimate && (
              <div className="flex flex-col gap-2.5">
                <p className="text-sm">
                  <b>{kg(estimate.kg_to_minimum)} more for a door pickup.</b> You can still sell it:
                </p>
                <Option on={choice === "pool"} onClick={() => setChoice("pool")} icon={Users} title="Join the next area pickup day">
                  We collect small loads in {area || "your area"} on one day. We&apos;ll tell you the date.
                </Option>
                <Option on={choice === "hub"} onClick={() => setChoice("hub")} icon={Store} title="Drop it at the hub">
                  {HUB.address}, {HUB.hours}. We weigh it while you wait and pay the same.
                </Option>
                {choice === "hub" && (
                  <p className="rounded-xl bg-mist px-3 py-2 text-sm text-primary-ink">
                    No request needed: bring it to {HUB.address} and give the collector your phone number.
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {step === 2 && (
          <section aria-labelledby="photo-h" className="flex flex-col gap-3">
            <h3 id="photo-h" className="text-lg font-bold">
              Add a photo of your plastic
            </h3>
            <p className="text-sm text-muted-foreground">It helps us send the right vehicle. One clear photo of the pile is enough.</p>
            <label
              className={cn(
                "flex min-h-52 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed bg-card text-center",
                photoUrl ? "border-primary" : "border-input",
              )}
            >
              {uploading ? (
                <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
              ) : photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- Cloudinary already serves a resized WebP
                <img src={resized(photoUrl, 720)} alt="Your plastic" className="max-h-72 w-full object-cover" />
              ) : (
                <>
                  <Camera className="size-8 text-primary" aria-hidden />
                  <b>Take a photo</b>
                  <small className="text-muted-foreground">or choose one from your phone</small>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => onPhoto(e.target.files?.[0])}
                disabled={uploading}
              />
            </label>
            {photoUrl && <p className="text-sm text-muted-foreground">Tap the photo to change it.</p>}
          </section>
        )}

        {step === 3 && (
          <section aria-labelledby="place-h" className="flex flex-col gap-4">
            <h3 id="place-h" className="text-lg font-bold">
              Where and when?
            </h3>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Pin your gate</Label>
                <button type="button" onClick={useMyLocation} className="flex items-center gap-1.5 text-sm font-bold text-primary">
                  <LocateFixed className="size-4" aria-hidden /> Use my location
                </button>
              </div>
              <PinPicker value={pin} onChange={(lat, lng) => setPin([lat, lng])} />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="size-3.5" aria-hidden /> Drag the pin or tap the map.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="address">Street address</Label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 7 Ezillo Street" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="area">Area</Label>
              <select id="area" value={area} onChange={(e) => setArea(e.target.value)} className={selectClass}>
                <option value="" disabled>
                  Choose your area
                </option>
                {AREAS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="date">Day</Label>
                <Input id="date" type="date" min={lagosToday()} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">Time</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(["MORNING", "AFTERNOON"] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      aria-pressed={slot === w}
                      onClick={() => setSlot(w)}
                      className={cn(
                        "rounded-xl border px-2 py-2.5 text-sm font-semibold",
                        slot === w ? "border-2 border-primary bg-mist text-primary-ink" : "border-border bg-card",
                      )}
                    >
                      {w === "MORNING" ? "Morning" : "Afternoon"}
                      <small className="block text-xs font-normal text-muted-foreground">{WINDOW_LABEL[w]}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="note">Note for the collector (optional)</Label>
              <Input id="note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Blue gate opposite the church" />
            </div>
          </section>
        )}

        {step === 4 && estimate && (
          <section aria-labelledby="review-h" className="flex flex-col gap-3">
            <h3 id="review-h" className="text-lg font-bold">
              Check and send
            </h3>
            <Card className="gap-2 text-sm">
              {estimate.items.map((i) => (
                <div key={i.material} className="flex justify-between gap-3">
                  <span>{MATERIALS.find((x) => x.value === i.material)!.label}</span>
                  <span className="tabular">≈ {kg(i.kg)}</span>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
                <span>Estimate</span>
                <Money kobo={estimate.amount_kobo} />
              </div>
              <p className="text-xs text-muted-foreground">You&apos;re paid for the weight the collector records in front of you.</p>
            </Card>
            <Card className="gap-1.5 text-sm">
              <p>
                <b>{address}</b>, {area}
              </p>
              <p className="text-muted-foreground">
                {new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })},{" "}
                {WINDOW_LABEL[slot]}
              </p>
              {underMinimum && <p className="font-semibold text-primary">Area pickup day: we&apos;ll confirm the date.</p>}
            </Card>
          </section>
        )}

        <div className="flex gap-3">
          {step > 0 && (
            <Btn variant="outline" className="w-28" onClick={() => setStep(step - 1)} disabled={submitting}>
              Back
            </Btn>
          )}
          {step < STEPS.length - 1 ? (
            <Btn className="flex-1" onClick={() => setStep(step + 1)} disabled={!canNext || (step === 1 && choice === "hub" && underMinimum)}>
              Next
            </Btn>
          ) : (
            <Btn className="flex-1" onClick={submit} disabled={submitting}>
              {submitting ? "Sending…" : "Request pickup"}
            </Btn>
          )}
        </div>
      </div>

      {/* Sticky estimate panel (laptop) and progress to 50 kg (both) */}
      {step >= 1 && (
        <aside className="lg:sticky lg:top-6">
          <EstimatePanel estimate={estimate} loading={estimating} />
        </aside>
      )}
    </div>
  );
}

function EstimatePanel({ estimate, loading }: { estimate: Estimate | null; loading: boolean }) {
  if (!estimate) return null;
  const share = Math.min(100, (Number(estimate.total_kg) / estimate.door_min_kg) * 100);
  return (
    <Card aria-live="polite" className={cn("gap-3", loading && "opacity-60")}>
      <div className="flex items-baseline justify-between">
        <span className="eyebrow text-muted-foreground">Your estimate</span>
        <span className="tabular text-sm text-muted-foreground">{kg(estimate.total_kg)}</span>
      </div>
      <Money kobo={estimate.amount_kobo} className="text-lg font-bold" />
      <div className="h-3 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={estimate.door_min_kg} aria-valuenow={Number(estimate.total_kg)} aria-label="Progress to a door pickup">
        <i className="block h-full rounded-full bg-gradient-to-r from-leaf to-primary transition-[width] duration-200" style={{ width: `${share}%` }} />
      </div>
      <p className="text-sm">
        {estimate.meets_door_minimum ? (
          <span className="font-semibold text-primary">Enough for a door pickup.</span>
        ) : (
          <>
            <b>{kg(estimate.kg_to_minimum)} more</b> for a door pickup ({estimate.door_min_kg} kg).
          </>
        )}
      </p>
    </Card>
  );
}

// Tap +/- or type the number. Limits match the API: sacks up to 200 (one decimal), counts up to 100,000 (whole).
function Counter({ value, step, label, onChange }: { value: number; step: number; label: string; onChange: (v: number) => void }) {
  const whole = Number.isInteger(step);
  const max = whole ? 100_000 : 200;
  const clamp = (v: number) => Math.min(max, Math.max(0, whole ? Math.floor(v) : +v.toFixed(1)));
  // While typing, keep what was typed (an empty box, "2.") instead of snapping it to a number.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center rounded-xl border border-border bg-canvas">
        <button type="button" aria-label={`Fewer ${label}`} onClick={() => onChange(clamp(value - step))} className="grid size-11 place-items-center">
          <Minus className="size-4" aria-hidden />
        </button>
        <input
          type="number"
          inputMode={whole ? "numeric" : "decimal"}
          min={0}
          max={max}
          step={whole ? 1 : 0.1}
          aria-label={label}
          value={draft ?? String(value)}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== "" && Number.isFinite(n)) onChange(clamp(n));
            else if (e.target.value === "") onChange(0);
          }}
          onBlur={() => setDraft(null)}
          className="tabular w-20 bg-transparent text-center font-semibold outline-none [appearance:textfield] focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button type="button" aria-label={`More ${label}`} onClick={() => onChange(clamp(value + step))} className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

function Option({
  on,
  onClick,
  icon: Icon,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  icon: typeof Users;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("flex items-start gap-3 rounded-2xl border bg-card p-3.5 text-left", on ? "border-2 border-primary bg-mist p-[13px]" : "border-border")}
    >
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span>
        <b className="block">{title}</b>
        <small className="text-[13px] text-muted-foreground">{children}</small>
      </span>
    </button>
  );
}
