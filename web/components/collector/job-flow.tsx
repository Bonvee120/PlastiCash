"use client";

import { CheckCircle2, LocateFixed, MapPin, Navigation, QrCode, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { WeightTable } from "@/components/app/weight-table";
import { Btn, Card, StatusBadge } from "@/components/brand/ui";
import { OtpStep } from "@/components/collector/otp-step";
import { QrScanner } from "@/components/collector/qr-scanner";
import { WeighForm } from "@/components/collector/weigh-form";
import { scanQr, sendLocation, startTrip, weighPickup } from "@/lib/actions";
import { kg, place, ref, WINDOW_LABEL } from "@/lib/format";
import type { CollectorPickup, CurrentPrice, WeighItemIn } from "@/lib/types";
import { photo } from "@/lib/upload";

const LOCATION_EVERY_MS = 20_000;

// One job, one step at a time: Start trip -> Scan QR -> Weigh -> Get code (DESIGN_BRIEF.md §6.3).
export function JobFlow({ initial, prices }: { initial: CollectorPickup; prices: CurrentPrice[] }) {
  const [job, setJob] = useState(initial);
  const [smsSent, setSmsSent] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [pending, setPending] = useState(false);
  const sharing = useLocationSharing(job.id, job.status === "EN_ROUTE");

  async function start() {
    setPending(true);
    const result = await startTrip(job.id);
    setPending(false);
    if (!result.ok) return toast.error(result.error.message);
    setJob(result.data);
    toast.success("Trip started. The customer can see you coming.");
  }

  async function check(code: string) {
    setPending(true);
    const result = await scanQr(job.id, code);
    setPending(false);
    if (!result.ok) return toast.error(result.error.message);
    setScanning(false);
    setJob(result.data);
    toast.success("QR matches. Weigh the plastic.");
  }

  async function weigh(photoUrl: string, items: WeighItemIn[]) {
    const result = await weighPickup(job.id, photoUrl, items);
    if (!result.ok) {
      toast.error(result.error.message);
      return false;
    }
    setSmsSent(result.data.sms_sent);
    setJob(result.data.pickup);
    window.scrollTo({ top: 0 });
    return true;
  }

  return (
    <div className="flex flex-col gap-4">
      <JobCard job={job} />

      {job.status === "ASSIGNED" && (
        <Btn variant="primary" block className="d-btn-collector" disabled={pending} onClick={start}>
          <Navigation className="size-5" aria-hidden /> {pending ? "Starting…" : "Start trip"}
        </Btn>
      )}

      {job.status === "EN_ROUTE" && <SharingNote state={sharing} />}

      {job.status === "EN_ROUTE" && !job.qr_scanned && (
        <Card className="gap-3">
          <h3 className="text-lg font-bold">Scan the customer&apos;s QR</h3>
          <p className="text-base text-slate-700">Ask {job.customer_name || "the customer"} to open the pickup on PlastiCash and show the QR code.</p>
          {scanning ? (
            <QrScanner onCode={check} busy={pending} />
          ) : (
            <Btn variant="primary" block className="d-btn-collector" onClick={() => setScanning(true)}>
              <QrCode className="size-5" aria-hidden /> Scan QR
            </Btn>
          )}
        </Card>
      )}

      {job.status === "EN_ROUTE" && job.qr_scanned && (
        <>
          <p className="flex items-center gap-2 rounded-xl bg-mint px-3 py-2.5 text-base font-semibold text-primary">
            <ShieldCheck className="size-5" aria-hidden /> QR matched. Weigh each kind separately.
          </p>
          <WeighForm prices={prices} submitLabel="Save weights" onSubmit={weigh} />
        </>
      )}

      {job.status === "AWAITING_CONFIRMATION" && <OtpStep pickup={job} smsSent={smsSent} onDone={setJob} />}

      {job.status === "COMPLETED" && (
        <>
          <p className="flex items-center gap-2 rounded-xl bg-mint px-3 py-3 text-base font-semibold text-primary">
            <CheckCircle2 className="size-5" aria-hidden /> Paid. This job is done.
          </p>
          <WeightTable items={job.items} totalKg={job.total_net_kg} totalKobo={job.total_amount_kobo} />
        </>
      )}

      {job.status === "DISPUTED" && (
        <p className="rounded-xl bg-cream px-3 py-3 text-base text-warn-strong">
          The customer disputed the weight. EcoCyclers will review your photo and decide.
        </p>
      )}

      {job.status === "CANCELLED" && (
        <p className="rounded-xl bg-muted px-3 py-3 text-base">This pickup was cancelled{job.cancelled_reason ? `: ${job.cancelled_reason}` : "."}</p>
      )}

      {job.status !== "EN_ROUTE" && job.status !== "ASSIGNED" && job.status !== "AWAITING_CONFIRMATION" && (
        <Link href="/collector" className="d-btn d-btn-outline d-btn-block d-btn-collector">
          Back to today
        </Link>
      )}
    </div>
  );
}

function JobCard({ job }: { job: CollectorPickup }) {
  const directions =
    job.lat && job.lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${job.address ?? ""}, ${job.area ?? ""}, Enugu`)}`;
  return (
    <Card className="gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">{job.customer_name || "Customer"}</h2>
          <span className="tabular text-sm text-muted-foreground">{ref(job.id)}</span>
        </div>
        <StatusBadge status={job.status} />
      </div>
      {job.channel === "DOOR" && (
        <>
          <p className="flex items-start gap-1.5 text-base">
            <MapPin className="mt-1 size-4 shrink-0" aria-hidden />
            {place(job)}
          </p>
          <p className="tabular text-sm text-muted-foreground">
            est. {kg(job.estimated_kg)}
            {job.preferred_window && ` · ${WINDOW_LABEL[job.preferred_window]}`}
          </p>
          {job.estimate_note && <p className="text-sm text-slate-700">&ldquo;{job.estimate_note}&rdquo;</p>}
          {job.request_photo_url && (job.status === "ASSIGNED" || job.status === "EN_ROUTE") && (
            // eslint-disable-next-line @next/next/no-img-element -- Cloudinary already resizes it
            <img src={photo(job.request_photo_url, 480)} alt="The customer's photo of the plastic" className="max-h-48 w-full rounded-xl object-cover" />
          )}
          {(job.status === "ASSIGNED" || job.status === "EN_ROUTE") && (
            <a href={directions} target="_blank" rel="noreferrer" className="d-btn d-btn-outline d-btn-block d-btn-collector">
              <Navigation className="size-5" aria-hidden /> Directions
            </a>
          )}
        </>
      )}
    </Card>
  );
}

type Sharing = "starting" | "on" | "denied" | "unsupported";

// While EN_ROUTE and this page is open: watch the phone's position and send the latest fix every 20 s (spec 03).
// The API stores it only on this pickup and only while EN_ROUTE (rule 8); stopping happens when the page closes.
function useLocationSharing(id: string, active: boolean): Sharing | null {
  const [state, setState] = useState<Sharing>("starting");
  const latest = useRef<GeolocationPosition | null>(null);

  useEffect(() => {
    if (!active) return;
    if (!("geolocation" in navigator)) {
      queueMicrotask(() => setState("unsupported"));
      return;
    }
    let sentFirst = false;
    const send = () => {
      const position = latest.current;
      if (position) void sendLocation(id, position.coords.latitude, position.coords.longitude);
    };
    const watch = navigator.geolocation.watchPosition(
      (position) => {
        latest.current = position;
        setState("on");
        if (!sentFirst) {
          sentFirst = true;
          send();
        }
      },
      (error) => setState(error.code === error.PERMISSION_DENIED ? "denied" : "starting"),
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    const timer = setInterval(send, LOCATION_EVERY_MS);
    return () => {
      navigator.geolocation.clearWatch(watch);
      clearInterval(timer);
    };
  }, [id, active]);

  return active ? state : null;
}

function SharingNote({ state }: { state: Sharing | null }) {
  if (state === "on") {
    return (
      <p className="flex items-center gap-2 text-sm font-semibold text-primary">
        <LocateFixed className="size-4" aria-hidden /> Sharing your location with the customer while this page is open.
      </p>
    );
  }
  if (state === "denied" || state === "unsupported") {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-cream px-3 py-2.5 text-sm text-warn-strong">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> Location is off, so the customer can&apos;t see you coming. Allow location for
        this site in your browser.
      </p>
    );
  }
  return <p className="text-sm text-muted-foreground">Finding your location…</p>;
}
