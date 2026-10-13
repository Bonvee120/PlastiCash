"use client";

import { WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

// Thin banner while the phone has no connection (DESIGN_BRIEF.md §13), and a refresh of the page's data when it
// comes back. Server render assumes online.
export function OfflineBanner() {
  const router = useRouter();
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  useEffect(() => {
    const retry = () => router.refresh();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [router]);
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-[#0F172A] px-4 py-2 text-sm font-semibold text-white">
      <WifiOff className="size-4" aria-hidden /> You&apos;re offline. We&apos;ll retry when you&apos;re back.
    </div>
  );
}
