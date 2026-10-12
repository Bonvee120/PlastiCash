"use client";

import { AlertTriangle, Camera, CheckCircle2, Clock, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { LiveMap } from "@/components/app/maps";
import { WeightTable } from "@/components/app/weight-table";
import { ConfirmDialog } from "@/components/brand/confirm-dialog";
import { Btn, Card, Money, StatusBadge, Timeline } from "@/components/brand/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelPickup, confirmPickup, disputePickup } from "@/lib/actions";
import { dateTime, day, kg, money, ref, WINDOW_LABEL } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Pickup } from "@/lib/types";
import { photo, uploadPhoto } from "@/lib/upload";
import { cn } from "@/lib/utils";

const LIVE: Pickup["status"][] = ["REQUESTED", "ASSIGNED", "EN_ROUTE", "AWAITING_CONFIRMATION", "DISPUTED"];
const POLL_MS = 15_000;

// The pickup page: status, QR for the collector, live map while EN_ROUTE, weights to confirm or dispute.
// Updates arrive by Supabase Realtime on this one row (RLS: only the owner and the assigned collector receive it);
// if Realtime is not connected the page re-checks every 15 s.
export function PickupDetail({ initial }: { initial: Pickup }) {
  const router = useRouter();
  const pickup = initial;
  const [livePosition, setLivePosition] = useState<[number, number] | null>(null);
  const [realtime, setRealtime] = useState(false);

  useEffect(() => {
    if (!LIVE.includes(pickup.status)) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`pickup-${pickup.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pickups", filter: `id=eq.${pickup.id}` },
        (payload) => {
          const row = payload.new as { status: Pickup["status"]; collector_lat: string | null; collector_lng: string | null };
          if (row.collector_lat && row.collector_lng) setLivePosition([Number(row.collector_lat), Number(row.collector_lng)]);
          if (row.status !== pickup.status) router.refresh();
        },
      )
      .subscribe((state) => setRealtime(state === "SUBSCRIBED"));
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pickup.id, pickup.status, router]);

  // Fallback: poll while Realtime isn't connected.
  useEffect(() => {
    if (realtime || !LIVE.includes(pickup.status)) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [realtime, pickup.status, router]);

  const position: [number, number] | null =
    livePosition ?? (pickup.collector_position ? [Number(pickup.collector_position.lat), Number(pickup.collector_position.lng)] : null);
  const home: [number, number] | null = pickup.lat && pickup.lng ? [Number(pickup.lat), Number(pickup.lng)] : null;

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1.2fr_1fr] lg:items-start">
      <div className="flex flex-col gap-5">
        <Card className="gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[22px] font-bold">{pickup.channel === "HUB" ? "Hub drop-off" : "Door pickup"}</h2>
              <p className="tabular text-xs text-muted-foreground">
                {ref(pickup.id)} · requested {day(pickup.created_at)}
              </p>
            </div>
            <StatusBadge status={pickup.status} />
          </div>
          {pickup.status !== "CANCELLED" && <Timeline status={pickup.status} />}
          <Summary pickup={pickup} />
        </Card>

        {pickup.status === "EN_ROUTE" && home && (
          <Card className="gap-0 overflow-hidden p-0">
            <div className="relative">
              <LiveMap home={home} collector={position} />
              <span className="absolute top-3 left-3 z-[400] flex items-center gap-1.5 rounded-full bg-heading px-3 py-1.5 text-xs font-bold text-white">
                <Clock className="size-3.5 text-gold" aria-hidden />
                {position ? `${pickup.collector_first_name ?? "Your collector"} is on the way` : "Waiting for the collector's location"}
              </span>
            </div>
            <p className="px-4 py-3 text-xs text-muted-foreground">
              {realtime ? "Live: the map moves as your collector moves." : "Updating every 15 seconds."}
            </p>
          </Card>
        )}

        {(pickup.status === "AWAITING_CONFIRMATION" || pickup.status === "DISPUTED" || pickup.status === "COMPLETED") && (
          <section className="flex flex-col gap-3" aria-label="Weights">
            <div className="grid gap-3 sm:grid-cols-[160px_1fr] sm:items-start">
              {pickup.weigh_photo_url && (
                // eslint-disable-next-line @next/next/no-img-element -- Cloudinary serves a resized WebP
                <img src={photo(pickup.weigh_photo_url, 480)} alt="The collector's photo of the scale" className="aspect-square w-full rounded-2xl object-cover sm:w-40" />
              )}
              <WeightTable items={pickup.items} totalKg={pickup.total_net_kg} totalKobo={pickup.total_amount_kobo} />
            </div>
          </section>
        )}
      </div>

      <div className="flex flex-col gap-5">
        {pickup.qr_token && <QrCard token={pickup.qr_token} />}
        {pickup.status === "AWAITING_CONFIRMATION" && <ConfirmOrDispute pickup={pickup} />}
        {(pickup.status === "REQUESTED" || pickup.status === "ASSIGNED") && <CancelCard pickup={pickup} />}
      </div>
    </div>
  );
}

function Summary({ pickup }: { pickup: Pickup }) {
  const when = pickup.scheduled_date ?? pickup.preferred_date;
  switch (pickup.status) {
    case "REQUESTED":
      return (
        <p className="text-sm text-muted-foreground">
          {pickup.pooled
            ? `Waiting for the next ${pickup.area} area pickup day. We'll tell you the date.`
            : "We're finding a collector for you."}{" "}
          Estimate: {kg(pickup.estimated_kg)}.
        </p>
      );
    case "ASSIGNED":
      return (
        <p className="text-sm">
          <b>{pickup.collector_first_name}</b> will come on <b>{day(when)}</b>
          {pickup.preferred_window ? `, ${WINDOW_LABEL[pickup.preferred_window]}` : ""}. Show them your QR code.
        </p>
      );
    case "EN_ROUTE":
      return <p className="text-sm">{pickup.collector_first_name} is on the way. Have your plastic and your QR code ready.</p>;
    case "AWAITING_CONFIRMATION":
      return <p className="text-sm">Weighed in front of you. Check the weights below, then confirm to get paid.</p>;
    case "DISPUTED":
      return (
        <p className="text-sm">
          We&apos;re reviewing your pickup. You said about <b>{kg(pickup.dispute_claimed_kg)}</b>: &ldquo;{pickup.dispute_reason}&rdquo;.
        </p>
      );
    case "COMPLETED":
      return (
        <p className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            Paid <b>{pickup.total_amount_kobo !== null ? money(pickup.total_amount_kobo) : ""}</b> on {dateTime(pickup.confirmed_at)}
            {pickup.resolution_note ? `. Review note: ${pickup.resolution_note}` : "."}
          </span>
        </p>
      );
    case "CANCELLED":
      return <p className="text-sm text-muted-foreground">Cancelled{pickup.cancelled_reason ? `: ${pickup.cancelled_reason}` : "."}</p>;
  }
}

function QrCard({ token }: { token: string }) {
  return (
    <Card id="qr" className="items-center text-center">
      <QRCodeSVG
        value={token}
        size={200}
        level="M"
        marginSize={2}
        imageSettings={{ src: "/icon.svg", height: 40, width: 40, excavate: true }}
        title="Pickup QR code"
      />
      <b>Show this to your collector</b>
      <p className="text-sm text-muted-foreground">They scan it before weighing, so only your plastic is paid to you.</p>
      <p className="text-xs text-muted-foreground">
        Camera not working? They can type this code:
        <span className="tabular mt-1 block text-sm font-semibold tracking-wide text-ink">{token.match(/.{1,4}/g)?.join(" ")}</span>
      </p>
    </Card>
  );
}

function useCountdown(until: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  if (!until) return null;
  const left = Math.max(0, new Date(until).getTime() - now);
  return { hours: Math.floor(left / 3_600_000), minutes: Math.floor((left % 3_600_000) / 60_000) };
}

const REASONS = ["The scale read too low", "Some of my plastic is missing", "The price is wrong", "Something else"];

function ConfirmOrDispute({ pickup }: { pickup: Pickup }) {
  const router = useRouter();
  const left = useCountdown(pickup.auto_confirm_at);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [disputing, setDisputing] = useState(false);

  async function confirm() {
    setPending(true);
    const result = await confirmPickup(pickup.id);
    setPending(false);
    setConfirming(false);
    if (!result.ok) return toast.error(result.error.message);
    toast.success(`You earned ${money(result.data.total_amount_kobo)}. It's in your wallet.`);
    router.refresh();
  }

  return (
    <Card className="gap-4">
      {left && (
        <span className="tabular flex w-fit items-center gap-1.5 rounded-full bg-cream px-3 py-1.5 text-xs font-semibold text-[#92400E]">
          <Clock className="size-3.5" aria-hidden /> Auto-confirms in {left.hours} h {left.minutes} m
        </span>
      )}
      <div>
        <p className="text-sm text-muted-foreground">You get</p>
        {pickup.total_amount_kobo !== null && <Money kobo={pickup.total_amount_kobo} className="text-xl font-bold" />}
        <p className="tabular text-sm text-muted-foreground">for {kg(pickup.total_net_kg)} of plastic</p>
      </div>
      {!disputing ? (
        <>
          <Btn block onClick={() => setConfirming(true)}>
            <ShieldCheck className="size-5" aria-hidden /> Confirm and get paid
          </Btn>
          <Btn block variant="danger" onClick={() => setDisputing(true)}>
            <AlertTriangle className="size-5" aria-hidden /> Something&apos;s wrong
          </Btn>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Smartphone className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            No data? Give the collector the 6-digit code we texted you instead.
          </p>
        </>
      ) : (
        <DisputeForm pickup={pickup} onCancel={() => setDisputing(false)} />
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Confirm this weight?"
        description="Your points go into your wallet now. You can't dispute after confirming."
        confirmLabel="Confirm and get paid"
        onConfirm={confirm}
        pending={pending}
      >
        {pickup.total_amount_kobo !== null && (
          <p className="rounded-xl bg-mist px-3 py-2.5 text-sm">
            {kg(pickup.total_net_kg)} = <b>{money(pickup.total_amount_kobo)}</b>
          </p>
        )}
      </ConfirmDialog>
    </Card>
  );
}

function DisputeForm({ pickup, onCancel }: { pickup: Pickup; onCancel: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState("");
  const [claimed, setClaimed] = useState(pickup.total_net_kg ?? "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [asking, setAsking] = useState(false);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      setPhotoUrl(await uploadPhoto(file, "dispute"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The photo didn't upload.");
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    setSending(true);
    const text = details.trim() ? `${reason}: ${details.trim()}` : reason;
    const result = await disputePickup(pickup.id, { photo_url: photoUrl!, claimed_kg: Number(claimed).toFixed(2), reason: text });
    setSending(false);
    setAsking(false);
    if (!result.ok) return toast.error(result.error.details?.errors?.[0]?.message ?? result.error.message);
    toast.success("Sent for review. We'll compare both photos and get back to you.");
    router.refresh();
  }

  const ready = photoUrl !== null && Number(claimed) > 0;

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">What&apos;s wrong?</legend>
        {REASONS.map((r) => (
          <label key={r} className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl border bg-white p-3 text-sm", reason === r ? "border-2 border-primary p-[11px]" : "border-border")}>
            <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-primary" />
            {r}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-2">
        <Label htmlFor="claimed">How many kg do you think it was?</Label>
        <Input id="claimed" inputMode="decimal" value={claimed} onChange={(e) => setClaimed(e.target.value.replace(/[^\d.]/g, ""))} className="tabular" />
        <p className="tabular text-xs text-muted-foreground">The collector recorded {kg(pickup.total_net_kg)}.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="details">Anything else (optional)</Label>
        <Input id="details" value={details} maxLength={300} onChange={(e) => setDetails(e.target.value)} />
      </div>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-input bg-white p-3 text-sm">
        {uploading ? <Loader2 className="size-5 animate-spin text-primary" aria-hidden /> : <Camera className="size-5 text-primary" aria-hidden />}
        {photoUrl ? "Photo added. Tap to change it." : "Add your photo of the plastic (required)"}
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} disabled={uploading} />
      </label>
      <div className="flex gap-3">
        <Btn variant="outline" className="w-28" onClick={onCancel}>
          Back
        </Btn>
        <Btn variant="danger" className="flex-1" disabled={!ready || sending} onClick={() => setAsking(true)}>
          Send for review
        </Btn>
      </div>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Send for review?"
        description="An EcoCyclers officer compares your photo with the collector's and sets the final weight. You're paid once it's resolved."
        confirmLabel="Send for review"
        onConfirm={send}
        pending={sending}
        tone="danger"
      />
    </div>
  );
}

function CancelCard({ pickup }: { pickup: Pickup }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function cancel() {
    setPending(true);
    const result = await cancelPickup(pickup.id, null);
    setPending(false);
    setOpen(false);
    if (!result.ok) return toast.error(result.error.message);
    toast.success("Pickup cancelled.");
    router.refresh();
  }

  return (
    <>
      <Btn variant="outline" block onClick={() => setOpen(true)}>
        Cancel this pickup
      </Btn>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancel this pickup?"
        description="You can request a new one any time."
        confirmLabel="Yes, cancel it"
        onConfirm={cancel}
        pending={pending}
        tone="danger"
      />
    </>
  );
}
