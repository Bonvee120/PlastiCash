import { Suspense } from "react";

import { PageTitle } from "@/components/brand/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { get } from "@/lib/api";
import type { Me } from "@/lib/me";
import type { Wallet, Withdrawal } from "@/lib/types";

import { WalletView } from "./wallet-view";

export default function WalletPage() {
  return (
    <main className="flex flex-1 flex-col gap-5 p-4 lg:p-8">
      <PageTitle title="Wallet" sub="1 point = ₦1. Withdraw to your bank from ₦1,000." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <Data />
      </Suspense>
    </main>
  );
}

async function Data() {
  const [wallet, withdrawals, me] = await Promise.all([
    get<Wallet>("/wallet?limit=100"),
    get<Withdrawal[]>("/withdrawals"),
    get<Me>("/me"),
  ]);
  return <WalletView wallet={wallet} withdrawals={withdrawals} bank={me.bank} />;
}
