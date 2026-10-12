"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// compact: icon only (phone headers). dark: glass style for forest backgrounds.
export function LogoutButton({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  const [pending, setPending] = useState(false);

  async function logOut() {
    setPending(true);
    const { error } = await createClient().auth.signOut();
    if (error) {
      setPending(false);
      toast.error("Couldn't log out. Please try again.");
      return;
    }
    // The login page shows the "You're logged out" toast and notice (from ?loggedOut=1).
    // Full page load, not router navigation: Next keeps visited pages alive in the background, and nothing
    // from the logged-in session (pages, form state, cached data) should survive a log-out.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate full reload, see above
    window.location.assign("/login?loggedOut=1");
  }

  return (
    <button
      type="button"
      onClick={logOut}
      disabled={pending}
      aria-label={compact ? "Log out" : undefined}
      className={cn(
        "d-btn d-btn-sm",
        dark ? "d-btn-glass" : "d-btn-outline",
        compact ? "w-10 px-0" : "w-full",
      )}
    >
      <LogOut className="size-4" aria-hidden />
      {!compact && (pending ? "Logging out…" : "Log out")}
    </button>
  );
}
