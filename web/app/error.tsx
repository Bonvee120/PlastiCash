"use client";

import { RotateCw, WifiOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { LogoMark } from "@/components/brand/logo";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

// Root error boundary. Catches failures in the area layouts too (e.g. the API is down while someone uses the app),
// so people see what happened and what to do instead of a blank page (DESIGN_BRIEF.md §13).
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);

  useEffect(() => {
    console.error(error);
  }, [error]);

  // Back online after being offline: try again by itself.
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
    } else if (wasOffline.current) {
      wasOffline.current = false;
      retry();
    }
  }, [online, retry]);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      {online ? <LogoMark size={48} /> : <WifiOff className="size-10 text-muted-foreground" aria-hidden />}
      <h1 className="text-[26px] font-bold">{online ? "We couldn't load this page" : "You're offline"}</h1>
      <p className="text-muted-foreground">
        {online
          ? "PlastiCash didn't respond. Your points and pickups are safe. Try again in a moment."
          : "We'll retry when you're back online."}
      </p>
      <button type="button" className="d-btn d-btn-primary w-full" onClick={() => retry()}>
        <RotateCw className="size-4" aria-hidden />
        Try again
      </button>
      <Link href="/" className="text-sm font-bold text-primary">
        Go to the home page
      </Link>
      {error.digest && <p className="tabular text-xs text-muted-foreground">Ref {error.digest}</p>}
    </main>
  );
}
