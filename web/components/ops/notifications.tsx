"use client";

import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  deletePushSubscription,
  pollNewRequests,
  pushPublicKey,
  savePushSubscription,
  sendTestPush,
  type NewRequest,
} from "@/lib/admin-actions";
import { cn } from "@/lib/utils";

const POLL_MS = 20_000;
const BOARD = "/ops-portal/pickups?status=REQUESTED";

// ----- Option 1: live alerts while the ops portal is open -----

// Short two-note chime made in the browser (no sound file). Browsers only allow sound after the admin has clicked
// somewhere on the page; before that it stays silent and the pop-up still shows.
function chime() {
  try {
    const audio = new AudioContext();
    [880, 1320].forEach((freq, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, audio.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.2, audio.currentTime + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + i * 0.18 + 0.25);
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + i * 0.18);
      osc.stop(audio.currentTime + i * 0.18 + 0.3);
    });
    setTimeout(() => audio.close(), 800);
  } catch {
    // no audio: the pop-up is enough
  }
}

function describe(r: NewRequest) {
  return [r.area, r.estimated_kg ? `est. ${Number(r.estimated_kg)} kg` : null, r.pooled ? "area pool" : null].filter(Boolean).join(" · ");
}

// Asks the API every 20 s (only while this tab is visible) for door requests newer than the last one seen.
export function NewRequestAlerts() {
  const router = useRouter();
  const cursor = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let busy = false;

    async function poll() {
      if (busy || stopped || document.visibilityState !== "visible") return;
      busy = true;
      const result = await pollNewRequests(cursor.current).catch(() => null);
      busy = false;
      if (!result?.ok || stopped) return;
      const first = cursor.current === null;
      cursor.current = result.data.cursor;
      if (first || result.data.items.length === 0) return;
      chime();
      for (const r of result.data.items) {
        toast(`New pickup request: ${r.user_name || "a customer"}`, {
          id: `new-${r.id}`,
          description: describe(r),
          duration: 20_000,
          icon: <BellRing className="size-4 text-primary" aria-hidden />,
          action: { label: "View", onClick: () => router.push(BOARD) },
        });
      }
      router.refresh(); // sidebar badge and any open board
    }

    void poll();
    const timer = setInterval(poll, POLL_MS);
    const onVisible = () => void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}

// ----- Option 4: push notifications on this phone or computer, even when PlastiCash is closed -----

type PushState = "loading" | "unsupported" | "needs-install" | "blocked" | "off" | "on";

function keyBytes(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function detect(): PushState {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // iPhone and iPad only allow push for sites added to the Home Screen.
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    return ios && !window.matchMedia("(display-mode: standalone)").matches ? "needs-install" : "unsupported";
  }
  return Notification.permission === "denied" ? "blocked" : "loading";
}

export function PushToggle({ dark = false }: { dark?: boolean }) {
  const [state, setState] = useState<PushState>("loading");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const first = detect();
      if (first !== "loading") {
        if (!cancelled) setState(first);
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      if (!cancelled) setState(existing && Notification.permission === "granted" ? "on" : "off");
    })().catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setPending(true);
    try {
      const key = await pushPublicKey();
      if (!key.ok || !key.data.public_key) {
        toast.error("Notifications aren't set up on the server yet.");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        toast.error("Notifications were not allowed.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key.data.public_key) }));
      const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const saved = await savePushSubscription({ endpoint: json.endpoint, keys: json.keys });
      if (!saved.ok) {
        await subscription.unsubscribe();
        toast.error(saved.error.message);
        return;
      }
      setState("on");
      toast.success("Notifications are on for this device.", {
        action: { label: "Send test", onClick: () => void test() },
      });
    } catch {
      toast.error("Couldn't turn notifications on in this browser. Private (incognito) windows can't get them; use a normal window.");
    } finally {
      setPending(false);
    }
  }

  async function turnOff() {
    setPending(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await deletePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
      toast.success("Notifications are off for this device.");
    } finally {
      setPending(false);
    }
  }

  async function test() {
    const result = await sendTestPush();
    if (!result.ok) return toast.error(result.error.message);
    toast(result.data.sent ? "Test sent. It should appear in a few seconds." : "No device is set up for notifications.");
  }

  const tone = dark ? "text-[#BBF7D0]" : "text-muted-foreground";
  if (state === "loading") return null;
  if (state === "unsupported") return <p className={cn("text-xs", tone)}>This browser can&apos;t show notifications.</p>;
  if (state === "needs-install") {
    return (
      <p className={cn("text-xs", tone)}>
        For notifications on iPhone: Share → Add to Home Screen, then open PlastiCash from the Home Screen.
      </p>
    );
  }
  if (state === "blocked") {
    return <p className={cn("text-xs", tone)}>Notifications are blocked. Allow them for this site in the browser settings.</p>;
  }

  const on = state === "on";
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={on ? turnOff : turnOn}
        disabled={pending}
        aria-pressed={on}
        className={cn(
          "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold",
          dark ? "bg-white/10 text-white hover:bg-white/15" : "bg-mist text-primary-ink",
        )}
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : on ? <Bell className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
        {on ? "Notifications on" : "Turn on notifications"}
      </button>
      {on && (
        <button type="button" onClick={() => void test()} className={cn("self-start px-3 text-xs underline underline-offset-2", tone)}>
          Send a test
        </button>
      )}
    </div>
  );
}
