import { Suspense } from "react";

import { ThemeChoice } from "@/components/brand/theme";
import { Card, PageTitle } from "@/components/brand/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { get } from "@/lib/api";
import type { Me } from "@/lib/me";

import { BankForm, ProfileForm, type BankOption } from "./settings-forms";

export default function SettingsPage() {
  return (
    <main className="flex flex-1 flex-col gap-5 p-4 lg:p-8">
      <PageTitle title="Settings" sub="Your details and the bank account we pay into." />
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <Data />
      </Suspense>
    </main>
  );
}

async function Data() {
  const [me, banks] = await Promise.all([get<Me>("/me"), get<BankOption[]>("/banks")]);
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <ProfileForm me={me} />
      <BankForm bank={me.bank} banks={banks} />
      <Card className="lg:col-span-2">
        <h3 className="text-[17px] font-bold">Appearance</h3>
        <p className="text-sm text-muted-foreground">Dark mode is easier on the eyes at night. &ldquo;Device&rdquo; follows your phone or computer.</p>
        <ThemeChoice />
      </Card>
    </div>
  );
}
