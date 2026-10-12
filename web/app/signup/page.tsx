import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/auth/auth-card";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up · PlastiCash" };

// Step 1: email and password. Step 2 (Individual or Organization details) comes after the first login.
export default function SignupPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Sell your plastic by weight and get paid to your bank."
      footer={
        <span>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Log in
          </Link>
        </span>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
