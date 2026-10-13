"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Password input with a show/hide button. The button is a real <button> with a label that says what it will do,
// so screen readers and keyboards can use it; the field keeps its autocomplete so password managers still work.
export function PasswordInput({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-12", className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={props.id}
        className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-input text-muted-foreground hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
      >
        {visible ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
      </button>
    </div>
  );
}

// "or" between the main action and Google.
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase" role="separator">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

// Same-site paths only, so ?next= can't send people to another website.
export function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/app";
}

// "Continue with Google": white with the Google mark (Google's branding rules), outlined so it stays secondary to the
// green main button. Supabase sends the user to Google and back to /auth/callback, which swaps the code for a session.
// New Google users have no profile yet, so /app sends them to sign-up step 2 like any new account.
export function GoogleButton({ next = "/app" }: { next?: string }) {
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    try {
      // If Google is off in Supabase, its authorize page shows raw JSON; check the public settings first instead.
      if (!(await googleEnabled())) {
        toast.error("Google sign-in isn't switched on yet. Use your email and password for now.");
        setPending(false);
        return;
      }
      const { data, error } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`,
          skipBrowserRedirect: true,
        },
      });
      if (error || !data.url) throw error ?? new Error("no url");
      window.location.assign(data.url); // leaving for Google; the button stays busy
    } catch {
      toast.error("Couldn't open Google sign-in. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={signIn}
      disabled={pending}
      className="d-btn d-btn-block border border-border bg-card font-semibold text-ink shadow-none hover:border-slate-400 hover:bg-slate-50"
    >
      {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <GoogleMark />}
      Continue with Google
    </button>
  );
}

async function googleEnabled(): Promise<boolean> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
  });
  if (!response.ok) return true; // can't tell: let Supabase decide
  const settings = (await response.json()) as { external?: { google?: boolean } };
  return settings.external?.google === true;
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
