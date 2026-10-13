"use client";

import { MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { GoogleButton, OrDivider, PasswordInput } from "@/components/auth/auth-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

const MIN_PASSWORD = 8;

export function SignupForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    if (password.length < MIN_PASSWORD) {
      toast.error(`Use at least ${MIN_PASSWORD} characters for your password.`);
      return;
    }
    if (password !== form.get("confirm")) {
      toast.error("The two passwords don't match.");
      return;
    }

    setPending(true);
    const { data, error } = await createClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/app` },
    });
    setPending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data.session) {
      // Email confirmation is off in Supabase: logged in straight away.
      toast.success("Account created.");
      router.replace("/app");
      router.refresh();
      return;
    }
    toast.success("Check your email to confirm your account.");
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-3 text-center" role="status">
        <MailCheck className="size-10 text-primary" aria-hidden />
        <p className="font-medium">Check your email</p>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to <span className="font-medium text-ink">{sentTo}</span>. Open it on this
          phone to finish signing up.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          aria-describedby="password-hint"
          required
        />
        <p id="password-hint" className="text-sm text-muted-foreground">
          At least {MIN_PASSWORD} characters.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
      </div>
      <button type="submit" className="d-btn d-btn-primary d-btn-block mt-1" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </button>
      <OrDivider />
      <GoogleButton />
    </form>
  );
}
