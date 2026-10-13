"use client";

import { CircleCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { GoogleButton, OrDivider, PasswordInput, safeNext } from "@/components/auth/auth-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (searchParams.get("error") === "confirm") {
      toast.error("That confirmation link didn't work. It may have expired; try logging in or sign up again.");
    }
    if (searchParams.get("error") === "oauth") {
      toast.error("Google sign-in didn't finish. Try again, or use your email and password.", { id: "oauth" });
    }
    // Log-out ends with a full page load (which clears toasts), so the login page shows the toast itself.
    // The id stops a second toast if the effect runs twice.
    if (searchParams.get("loggedOut")) {
      toast.success("You're logged out.", { id: "logged-out" });
    }
  }, [searchParams]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setPending(true);
    const { error } = await createClient().auth.signInWithPassword({
      email: String(form.get("email")).trim(),
      password: String(form.get("password")),
    });
    if (error) {
      setPending(false);
      toast.error(
        error.code === "email_not_confirmed"
          ? "Please confirm your email first. Check your inbox for the link."
          : "Wrong email or password.",
      );
      return;
    }
    // Next keeps this page alive in the background after we leave it: clear the password and the pending state.
    formElement.reset();
    setPending(false);
    toast.success("You're logged in.");
    router.replace(safeNext(searchParams.get("next")));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {searchParams.get("loggedOut") && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg bg-primary-light px-3 py-2 text-sm text-primary-dark"
        >
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          You&apos;re logged out. Log in again any time.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </div>
      <button type="submit" className="d-btn d-btn-primary d-btn-block mt-1" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </button>
      <OrDivider />
      <GoogleButton next={safeNext(searchParams.get("next"))} />
    </form>
  );
}
