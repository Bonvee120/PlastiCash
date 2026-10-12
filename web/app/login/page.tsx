import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuthCard } from "@/components/auth/auth-card";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in · PlastiCash" };

export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      description="Log in to see your wallet and pickups."
      footer={
        <span>
          New here?{" "}
          <Link href="/signup" prefetch={false} className="font-bold text-primary underline-offset-4 hover:underline">
            Create an account
          </Link>
        </span>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
