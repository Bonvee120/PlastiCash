"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logOut() {
    setPending(true);
    const { error } = await createClient().auth.signOut();
    if (error) {
      setPending(false);
      toast.error("Couldn't log out. Please try again.");
      return;
    }
    toast.success("You're logged out.");
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button variant="outline" onClick={logOut} disabled={pending}>
      <LogOut aria-hidden />
      {pending ? "Logging out…" : "Log out"}
    </Button>
  );
}
